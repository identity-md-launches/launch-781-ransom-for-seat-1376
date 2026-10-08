import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import {
  decodeFunctionData,
  encodeFunctionResult,
  parseEther,
  type Hex,
} from "viem";
import { chartRange, pointChange, traderEth } from "../src/swapTape";
import { chartTicks, ROUND_STEPS, tickLabel } from "../src/chartAxis";
import { createSwapVisit } from "../src/swapVisit";
import { aggregateAbi, MULTICALL3 } from "../src/paidReads";
import { blockInfoAbi, swapRpc, type SwapSource } from "../src/swapReads";
import {
  ADDR,
  hookAbi,
  seatAbi,
  tokenAbi,
  stateAbi,
  rpc,
  readSnapshot,
} from "../src/chain";
import { feedAbi } from "../src/dollars";
import {
  readWatch,
  pollWatch,
  NINE_WALLETS,
  HIS_WALLET,
  M0,
  H0,
  S0,
  type WatchState,
} from "../src/watch";
import { readBatchedWatch } from "../src/watchBatch";
import { createSnapshotReader } from "../src/snapshotBatch";
import type { LiveCaller } from "../src/liveBatch";

test("chart ranges stay nonnegative through flat, empty, pump and animated ranges; ticks use allowed steps", () => {
  for (const values of [
    [],
    [0],
    [0.01],
    [7.1, 7.8, 8.5],
    [0, 150],
    [7, 200],
    [0, 1000],
    [NaN, Infinity],
  ]) {
    const range = chartRange(values);
    assert.ok(range[0] >= 0 && range[1] > range[0]);
    for (let i = 0; i <= 100; i++) {
      const animated: [number, number] = [
        (range[0] * i) / 100,
        0.6 + ((range[1] - 0.6) * i) / 100,
      ];
      const ticks = chartTicks(animated);
      assert.ok(
        ticks.every(
          (v) => v >= 0 && v >= animated[0] - 1e-9 && v <= animated[1] + 1e-9,
        ),
      );
      if (ticks.length > 1)
        assert.ok(
          ROUND_STEPS.some((s) => Math.abs(s - (ticks[1] - ticks[0])) < 1e-9),
        );
    }
  }
  assert.deepEqual(chartTicks([7.05, 7.95]), [7.25, 7.5, 7.75]);
  assert.equal(tickLabel(7.25), "7.25%");
});
test("tape ETH includes the hook fee on BUY and removes it on SELL; tiny impacts have no sign", () => {
  assert.equal(traderEth({ amount0: -parseEther(".49") }), parseEther(".5"));
  assert.equal(traderEth({ amount0: parseEther(".5") }), parseEther(".49"));
  for (const value of [-0.00499, -0.001, -0, 0, 0.001, 0.00499])
    assert.equal(pointChange(value), "0.00%");
  assert.equal(pointChange(-0.0051), "−0.01%");
  assert.equal(pointChange(0.0051), "+0.01%");
});
test("failed initial logs and catch-up have independent minute cooldowns; retry resumes overlapped ranges", async () => {
  let now = 0,
    head = 20000n,
    fail = true;
  const reads: { at: number; from: bigint; to: bigint }[] = [];
  const source: SwapSource = {
    latest: async () => head,
    logs: async (from, to) => {
      reads.push({ at: now, from, to });
      if (fail) throw Error("offline");
      return [];
    },
    meter: async (block) => ({
      block: block ?? head,
      timestamp: 1n,
      out: 1n,
      marketCap: 1,
      balance: M0,
      amount: M0,
    }),
    timestamp: async () => 1n,
  };
  const visit = createSwapVisit(source, () => now);
  for (now = 0; now < 180000; now += 4000) {
    head++;
    await visit.poll();
    await setImmediate();
  }
  assert.deepEqual(
    reads.map((r) => r.at),
    [0, 4000, 60000, 64000, 120000, 124000],
  );
  assert.ok(visit.getSnapshot().historyFailed);
  fail = false;
  await visit.poll();
  await setImmediate();
  await setImmediate();
  now += 4000;
  await visit.poll();
  await setImmediate();
  assert.ok(reads.some((r) => r.from === 19997n));
  assert.ok(visit.getSnapshot().live);
});

const allAbi = [
  ...hookAbi,
  ...seatAbi,
  ...tokenAbi,
  ...stateAbi,
  ...feedAbi,
  ...blockInfoAbi,
];
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/revision.json", import.meta.url), "utf8"),
);
function mockBatch() {
  let buried = true,
    failedName = "",
    rejected = false;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const values: Record<string, unknown> = {
    totalFees: 3n,
    CREATOR_CAP: 2n,
    buried: true,
    totalIMDBurned: 4n,
    burnable: 5n,
    MIN_BURN: 6n,
    lastBurnBlock: 7n,
    MIN_BLOCKS_BETWEEN_BURNS: 8n,
    status: "BURIED",
    MANIFESTO: fixture.manifesto,
    MANIFESTO_HASH: fixture.manifestoHash,
    IMD: ADDR.token,
    tokenURI: fixture.uri,
    getApproved: ADDR.zero,
    getSlot0: [2n ** 96n, 0, 0, 3000],
    decimals: 18,
    totalSupply: S0,
    getBlockNumber: 123n,
    getCurrentBlockTimestamp: now,
    latestRoundData: [2n, 2500_00000000n, 0n, now, 2n],
  };
  const calls: string[][] = [];
  const value = (name: string, args?: readonly unknown[]) => {
    if (name === "buried") return buried;
    if (name === "balanceOf")
      return String(args?.[0]).toLowerCase() === HIS_WALLET.toLowerCase()
        ? M0
        : String(args?.[0]).toLowerCase() === NINE_WALLETS[0].toLowerCase()
          ? H0
          : 0n;
    return values[name];
  };
  const call: LiveCaller = async (request) => {
    assert.equal(request.to, MULTICALL3);
    assert.equal(request.blockTag, "latest");
    const decoded = decodeFunctionData({
      abi: aggregateAbi,
      data: request.data,
    });
    assert.equal(decoded.functionName, "aggregate3");
    const names: string[] = [];
    calls.push(names);
    if (rejected) throw Error("offline");
    const result = decoded.args[0].map((c) => {
      const { functionName, args } = decodeFunctionData({
        abi: allAbi,
        data: c.callData,
      });
      names.push(functionName);
      if (functionName === failedName)
        return { success: false, returnData: "0x" as Hex };
      return {
        success: true,
        returnData: encodeFunctionResult({
          abi: allAbi,
          functionName,
          result: value(functionName, args) as never,
        }),
      };
    });
    return {
      data: encodeFunctionResult({
        abi: aggregateAbi,
        functionName: "aggregate3",
        result,
      }),
    };
  };
  return {
    call,
    calls,
    values,
    value,
    now,
    setBuried: (v: boolean) => (buried = v),
    setFailure: (v: string) => (failedName = v),
    setRejected: (v: boolean) => (rejected = v),
  };
}
test("one aggregate per watch tick, same eleven balances/supply/pool/feed/block and unchanged recovery text", async (t) => {
  const f = mockBatch();
  t.mock.method(swapRpc, "call", f.call);
  t.mock.timers.enable({ apis: ["setInterval"] });
  const states: WatchState[] = [];
  const stop = pollWatch((s) => states.push(s));
  await setImmediate();
  assert.equal(f.calls.length, 1);
  assert.deepEqual(states[0].data, {
    block: 123n,
    timestamp: f.now,
    balances: [H0, ...Array(8).fill(0n)],
    main: M0,
    dead: 0n,
    supply: S0,
    sqrtPriceX96: 2n ** 96n,
    ethUsd: 2500_00000000n,
  });
  f.setRejected(true);
  t.mock.timers.tick(15000);
  await setImmediate();
  assert.equal(f.calls.length, 2);
  assert.equal(states.at(-1)?.data, states[0].data);
  assert.equal(states.at(-1)?.failed, true);
  f.setRejected(false);
  t.mock.timers.tick(15000);
  await setImmediate();
  stop();
  assert.equal(f.calls.length, 3);
  assert.equal(states.at(-1)?.failed, false);
  assert.match(
    readFileSync(new URL("../src/Watch.tsx", import.meta.url), "utf8"),
    /Live reads are unavailable\. Retrying…/,
  );
});
test("watch aggregate rejects failed members and stale/invalid prices as a whole", async () => {
  for (const name of [
    "balanceOf",
    "totalSupply",
    "getSlot0",
    "latestRoundData",
    "getBlockNumber",
    "getCurrentBlockTimestamp",
  ]) {
    const f = mockBatch();
    f.setFailure(name);
    await assert.rejects(readBatchedWatch(f.call));
  }
  for (const round of [
    [2n, 0n, 0n, 1n, 2n],
    [2n, 1n, 0n, 1n, 1n],
  ]) {
    const f = mockBatch();
    f.values.latestRoundData = round;
    await assert.rejects(readBatchedWatch(f.call));
  }
});
test("batched snapshot matches unchanged legacy snapshot in all three states, one aggregate each tick", async (t) => {
  const f = mockBatch();
  let discovers = 0;
  t.mock.method(rpc, "getBlock", async () => ({
    number: 123n,
    timestamp: f.now,
  }));
  t.mock.method(
    rpc,
    "readContract",
    async ({
      functionName,
      args,
    }: {
      functionName: string;
      args?: readonly unknown[];
    }) => f.value(functionName, args),
  );
  const read = createSnapshotReader(async () => {
    discovers++;
    return ADDR.token;
  }, f.call);
  for (const [buried, fees] of [
    [false, 1n],
    [false, 3n],
    [true, 3n],
  ] as const) {
    f.setBuried(buried);
    f.values.totalFees = fees;
    const legacy = await readSnapshot(),
      batch = await read();
    assert.deepEqual({ ...batch, fetchedAt: 0 }, { ...legacy, fetchedAt: 0 });
  }
  assert.equal(f.calls.length, 3);
  assert.equal(discovers, 1);
});
test("sealed manifesto failure does not block snapshot; required failures reject without partial data", async () => {
  const f = mockBatch();
  const read = createSnapshotReader(async () => ADDR.token, f.call);
  f.setBuried(false);
  f.setFailure("MANIFESTO");
  assert.equal((await read()).manifesto, undefined);
  f.setBuried(true);
  await assert.rejects(read());
  f.setFailure("getSlot0");
  await assert.rejects(read());
  f.setFailure("");
  assert.equal((await read()).buried, true);
});
test("point slot remains narrow and centers overflowing glyph; phone hero and exact requested copy", () => {
  const css = readFileSync(
    new URL("../src/live-paid.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\.live-percentage \.live-punctuation\s*\{[^}]*width: 0\.3em/s,
  );
  for (const declaration of [
    "display: inline-flex",
    "justify-content: center",
    "overflow: visible",
  ])
    assert.ok(
      css
        .slice(css.indexOf("\n.live-punctuation {"))
        .split("}")[0]
        .includes(declaration),
    );
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /className="hero-note"/);
  assert.match(app, /className="testament-link"/);
  assert.ok(app.indexOf("<Provenance") < app.indexOf('className="hero-note"'));
  assert.match(
    app,
    /Uniswap’s app does not route through this hook yet\. This page\s+trades in the same pool through Uniswap’s own Universal Router\./,
  );
  assert.equal(
    (
      readFileSync(new URL("../index.html", import.meta.url), "utf8").match(
        /Seat #1376 is free\. The second ransom is paid\./g,
      ) || []
    ).length,
    2,
  );
});

test("optional dollar feed still clears on its own failure while required snapshot values survive", async () => {
  const f = mockBatch();
  const read = createSnapshotReader(async () => ADDR.token, f.call);
  const published: unknown[] = [];
  await read((v) => published.push(v));
  assert.deepEqual(published.at(-1), {
    answer: 2500_00000000n,
    updatedAt: f.now,
  });
  f.setFailure("latestRoundData");
  assert.equal((await read((v) => published.push(v))).buried, true);
  assert.equal(published.at(-1), undefined);
  f.setFailure("getSlot0");
  await assert.rejects(read((v) => published.push(v)));
  assert.deepEqual(published.at(-1), {
    answer: 2500_00000000n,
    updatedAt: f.now,
  });
  f.setRejected(true);
  await assert.rejects(read((v) => published.push(v)));
  assert.equal(published.at(-1), undefined);
});
