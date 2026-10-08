import test from "node:test";
import assert from "node:assert/strict";
import { parseEther, encodeFunctionResult, decodeFunctionData } from "viem";
import {
  assignImpacts,
  chartRange,
  mergePoints,
  observeCrossing,
  pointsToGo,
  swapAge,
  swapSide,
  type PoolSwap,
} from "../src/swapTape";
import { createSwapVisit } from "../src/swapVisit";
import { readSwapMeter, blockInfoAbi, type SwapSource } from "../src/swapReads";
import { aggregateAbi } from "../src/paidReads";
import { quoteAbi, stateAbi, tokenAbi } from "../src/chain";
import { feedAbi } from "../src/dollars";
import { M0, CASH_OUT } from "../src/watch";
import { type SellReading } from "../src/paid";

const point = (block: bigint, percent: number): SellReading => ({
  block,
  timestamp: 1791450000n + block * 12n,
  out: (CASH_OUT * BigInt(Math.round(percent * 10000))) / 1000000n,
  marketCap: percent * 10000,
  balance: M0,
  amount: M0,
});
const swap = (
  block: bigint,
  index = 0,
  amount0 = -parseEther("0.42"),
): PoolSwap => ({
  id: `${block}:${index}`,
  block,
  logIndex: index,
  transaction: `0x${"12".repeat(32)}`,
  amount0,
  amount1: -amount0 * 10000000n,
});
const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
};
function fixture() {
  let block = 20000n,
    now = 0,
    fail = false,
    percent = 9.4;
  const rows: PoolSwap[] = [],
    calls: { from: bigint; to: bigint }[] = [],
    meters: (bigint | undefined)[] = [];
  const source: SwapSource = {
    latest: async () => block,
    logs: async (from, to) => {
      calls.push({ from, to });
      return rows.filter((s) => s.block >= from && s.block <= to);
    },
    timestamp: async (b) => point(b, 0).timestamp,
    meter: async (b) => {
      meters.push(b);
      if (fail) throw Error("offline");
      return point(b ?? block, percent);
    },
  };
  const visit = createSwapVisit(source, () => now);
  return {
    visit,
    rows,
    calls,
    meters,
    setBlock: (b: bigint) => {
      block = b;
    },
    setTime: (n: number) => {
      now = n;
    },
    setFail: (v: boolean) => {
      fail = v;
    },
    setPercent: (n: number) => {
      percent = n;
    },
  };
}

test("Swap sign determines BUY/SELL, ETH and token magnitudes are independent", () => {
  assert.equal(swapSide(swap(1n)), "BUY");
  assert.equal(swapSide(swap(1n, 0, 420n)), "SELL");
});
test("impact is per swap block; only its final log carries the change, newest seven first", () => {
  const rows = [swap(10n, 2), swap(10n, 0), swap(10n, 1), swap(20n), swap(21n)];
  const readings = new Map(
    [point(9n, 9), point(10n, 9.31), point(20n, 9.19), point(21n, 10)].map(
      (p) => [p.block, p],
    ),
  );
  const tape = assignImpacts(rows, readings);
  assert.equal(tape[0].block, 21n);
  assert.ok(Math.abs(tape[1].impact! + 0.12) < 1e-10);
  assert.ok(Math.abs(tape[2].impact! - 0.31) < 1e-10);
  assert.equal(tape[3].impact, 0);
  assert.equal(tape[4].impact, 0);
  assert.equal(
    assignImpacts(
      [...rows, ...Array.from({ length: 10 }, (_, i) => swap(30n + BigInt(i)))],
      readings,
    ).length,
    7,
  );
});
test("a missing block read never fabricates a cumulative impact for the next block", () => {
  const tape = assignImpacts(
    [swap(10n), swap(20n)],
    new Map([point(9n, 5), point(20n, 9)].map((p) => [p.block, p])),
  );
  assert.equal(tape[0].impact, undefined);
  assert.equal(tape[1].impact, undefined);
});
test("LIVE retains forty unique blocks, sorted, with replacements on retry", () => {
  const points = Array.from({ length: 45 }, (_, i) => point(BigInt(i), i));
  const result = mergePoints(points, [point(44n, 99)]);
  assert.equal(result.length, 40);
  assert.equal(result[0].block, 5n);
  assert.equal(result.at(-1)?.out, point(44n, 99).out);
});
test("chart range has minimum .8 data span plus 25% padding on each side", () => {
  assert.deepEqual(chartRange([10, 14]), [9, 15]);
  const flat = chartRange([9.4]);
  assert.ok(Math.abs(flat[0] - 8.8) < 1e-10);
  assert.ok(Math.abs(flat[1] - 10) < 1e-10);
});
test("distance and unlocked text; zero and loading remain honest", () => {
  assert.equal(pointsToGo(9.4), "10.6× to go");
  assert.equal(pointsToGo(100), "UNLOCKED");
  assert.equal(pointsToGo(140), "UNLOCKED");
  assert.equal(pointsToGo(0), "∞× to go");
  assert.equal(pointsToGo(), "—");
});
test("ages tick through now, seconds, minutes and hours", () => {
  assert.equal(swapAge(1000n, 1001000), "now");
  assert.equal(swapAge(1000n, 1012000), "12s");
  assert.equal(swapAge(1000n, 1184000), "3m 4s");
  assert.equal(swapAge(1000n, 4720000), "1h 2m");
  assert.equal(swapAge(undefined, 0), "—");
  assert.equal(swapAge(2000n, 0), "now");
});
test("crossing fires once per visit, never on load or downward, exact threshold", () => {
  let [state, fired] = observeCrossing({ fired: false }, point(1n, 110));
  assert.equal(fired, false);
  [state, fired] = observeCrossing(state, point(2n, 99));
  assert.equal(fired, false);
  [state, fired] = observeCrossing(state, point(3n, 100));
  assert.equal(fired, true);
  [state] = observeCrossing(state, point(4n, 90));
  [state, fired] = observeCrossing(state, point(5n, 110));
  assert.equal(fired, false);
});
test("quiet blocks do not read the market until sixty seconds pass", async () => {
  const f = fixture();
  await f.visit.poll();
  await settle();
  assert.deepEqual(f.meters, [undefined]);
  f.setBlock(20001n);
  f.setTime(4000);
  await f.visit.poll();
  await settle();
  assert.equal(f.meters.length, 1);
  f.setTime(59999);
  await f.visit.poll();
  await settle();
  assert.equal(f.meters.length, 1);
  f.setTime(60000);
  await f.visit.poll();
  await settle();
  assert.equal(f.meters.length, 2);
});
test("startup scans newest-first 2000-block windows, exactly 10000 blocks; live does not await history", async () => {
  const f = fixture();
  await f.visit.poll();
  await settle();
  assert.deepEqual(f.calls, [
    { from: 18001n, to: 20000n },
    { from: 16001n, to: 18000n },
    { from: 14001n, to: 16000n },
    { from: 12001n, to: 14000n },
    { from: 10001n, to: 12000n },
  ]);
  assert.ok(f.visit.getSnapshot().live);
});
test("startup takes only 24 swap blocks and one preceding baseline", async () => {
  const f = fixture();
  f.rows.push(
    ...Array.from({ length: 30 }, (_, i) => swap(19900n + BigInt(i))),
  );
  await f.visit.poll();
  await settle();
  assert.equal(f.calls.length, 1);
  assert.equal(f.visit.getSnapshot().points.length, 24);
  assert.equal(f.meters.filter((b) => b !== undefined).length, 25);
  assert.ok(f.meters.includes(19905n));
  assert.equal(f.visit.getSnapshot().swaps.length, 7);
});
test("new buy and sell add rows and points; duplicate polls do not duplicate; failed reads retain values", async () => {
  const f = fixture();
  await f.visit.poll();
  await settle();
  f.rows.push(swap(20001n));
  f.setBlock(20001n);
  f.setPercent(9.71);
  await f.visit.poll();
  await settle();
  assert.equal(f.visit.getSnapshot().swaps[0].fresh, true);
  assert.equal(f.visit.getSnapshot().points.length, 1);
  assert.ok(Math.abs(f.visit.getSnapshot().change - 0.31) < 1e-8);
  await f.visit.poll();
  await settle();
  assert.equal(f.visit.getSnapshot().swaps.length, 1);
  f.rows.push(swap(20002n, 0, 1n), swap(20002n, 1, 1n));
  f.setBlock(20002n);
  f.setPercent(9.59);
  await f.visit.poll();
  await settle();
  assert.equal(f.visit.getSnapshot().swaps.length, 3);
  assert.equal(f.visit.getSnapshot().swaps[1].impact, 0);
  assert.ok(Math.abs(f.visit.getSnapshot().swaps[0].impact! + 0.12) < 1e-8);
  const before = f.visit.getSnapshot().live;
  f.setFail(true);
  f.rows.push(swap(20003n));
  f.setBlock(20003n);
  await f.visit.poll();
  await settle();
  assert.equal(f.visit.getSnapshot().live, before);
  assert.equal(f.visit.getSnapshot().failed, true);
  assert.equal(f.visit.getSnapshot().swaps.length, 4);
  f.setFail(false);
  await f.visit.poll();
  await settle();
  assert.equal(f.visit.getSnapshot().failed, false);
});
test("real meter ABI uses capped balance, one market aggregate at latest, and validates race", async () => {
  let balance = M0 * 2n,
    confirmed = balance,
    aggregated = 0,
    quoted = 0n;
  const timestamp = 1791450000n;
  const mock = {
    readContract: async () => balance,
    call: async (request: { data: `0x${string}`; blockTag: string }) => {
      assert.equal(request.blockTag, "latest");
      aggregated++;
      const calls = decodeFunctionData({
        abi: aggregateAbi,
        data: request.data,
      }).args![0];
      const results = calls.map((c) => {
        for (const abi of [
          quoteAbi,
          stateAbi,
          feedAbi,
          tokenAbi,
          blockInfoAbi,
        ]) {
          try {
            const decoded = decodeFunctionData({ abi, data: c.callData });
            let result: unknown;
            switch (decoded.functionName) {
              case "quoteExactInputSingle":
                quoted = (decoded.args![0] as { exactAmount: bigint })
                  .exactAmount;
                result = [parseEther("0.8"), 100000n];
                break;
              case "getSlot0":
                result = [(1n << 96n) * 3500n, 0, 0, 3000];
                break;
              case "latestRoundData":
                result = [1n, 2500_00000000n, timestamp, timestamp, 1n];
                break;
              case "totalSupply":
                result = parseEther("1000000000");
                break;
              case "balanceOf":
                result = confirmed;
                break;
              case "getBlockNumber":
                result = 20000n;
                break;
              case "getCurrentBlockTimestamp":
                result = timestamp;
                break;
              default:
                throw Error("function");
            }
            return {
              success: true,
              returnData: encodeFunctionResult({
                abi,
                functionName: decoded.functionName,
                result,
              } as never),
            };
          } catch {
            /* try the next ABI */
          }
        }
        throw Error("unknown call");
      });
      return {
        data: encodeFunctionResult({
          abi: aggregateAbi,
          functionName: "aggregate3",
          result: results,
        }),
      };
    },
  };
  const read = () =>
    readSwapMeter(
      undefined,
      mock as unknown as Parameters<typeof readSwapMeter>[1],
    );
  const result = await read();
  assert.equal(aggregated, 1);
  assert.equal(quoted, M0);
  assert.equal(result.out, parseEther("0.8"));
  balance = M0 / 2n;
  confirmed = balance;
  await read();
  assert.equal(quoted, balance);
  confirmed = balance - 1n;
  await assert.rejects(read, /Market data unavailable/);
  balance = confirmed = 0n;
  const zero = await read();
  assert.equal(zero.out, 0n);
});

test("paid history remains once per visit, retains payment early, and never owns live reads", async () => {
  const { createPaidHistoryVisit } = await import("../src/usePaidHistory");
  let reads = 0;
  let complete!: (value: {
    paid: { number: bigint; timestamp: bigint };
    points: SellReading[];
  }) => void;
  const paid = { number: 1n, timestamp: 10n };
  const visit = createPaidHistoryVisit(async (onPaid) => {
    reads++;
    onPaid(paid);
    return new Promise((resolve) => {
      complete = resolve;
    });
  });
  let state: import("../src/paid").PaidState | undefined;
  const stop = visit((value) => {
    state = value;
  });
  assert.equal(state?.history?.paid, paid);
  assert.equal(state?.live, undefined);
  complete({ paid, points: [point(1n, 9)] });
  await settle();
  stop();
  const stopAgain = visit((value) => {
    state = value;
  });
  assert.equal(reads, 1);
  assert.equal(state?.history?.points.length, 1);
  stopAgain();
});

test("a delayed archive scan never prevents a newer live block from updating", async () => {
  let latest = 20000n,
    archiveFinish!: (rows: PoolSwap[]) => void;
  const source: SwapSource = {
    latest: async () => latest,
    timestamp: async (b) => point(b, 0).timestamp,
    logs: async (from, to) =>
      from < 20000n
        ? new Promise((resolve) => {
            archiveFinish = resolve;
          })
        : [swap(to)],
    meter: async (b) => point(b ?? latest, latest === 20000n ? 9 : 10),
  };
  const visit = createSwapVisit(source);
  await visit.poll();
  await settle();
  assert.equal(visit.getSnapshot().live?.block, 20000n);
  latest++;
  await visit.poll();
  await settle();
  assert.equal(visit.getSnapshot().live?.block, 20001n);
  assert.equal(visit.getSnapshot().swaps[0].block, 20001n);
  archiveFinish(Array.from({ length: 24 }, (_, i) => swap(19999n - BigInt(i))));
  await settle();
  assert.equal(visit.getSnapshot().live?.block, 20001n);
  assert.equal(visit.getSnapshot().swaps[0].block, 20001n);
});
