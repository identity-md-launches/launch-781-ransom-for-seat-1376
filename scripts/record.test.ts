import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  encodeEventTopics,
  encodeAbiParameters,
  parseEther,
  type Hex,
  type Address,
} from "viem";
import { ADDR } from "../src/chain";
import {
  CASH_OUT,
  H0,
  HIS_WALLET,
  M0,
  S0,
  type WatchSnapshot,
} from "../src/watch";
import { PAID_START, initialPaidState } from "../src/paid";
import { findBurnPaidBlock } from "../src/burnHistory";
import {
  extendWalletRecord,
  findBalanceChanges,
  initialRecordState,
  recordOfferRules,
  recouped,
  recordFulfilled,
  transferEvent,
  type RecordSource,
  type RecordReceipt,
  type RecordState,
  type WalletRecord,
} from "../src/walletRecord";
import { createRecordVisit } from "../src/recordVisit";
import { recordVerdicts } from "../src/recordVerdicts";
import { SecondActView, SellMeter } from "../src/PaidSecondAct";
import { ThirdActGate } from "../src/ThirdActGate";
import { Recouped } from "../src/Recouped";

const token = parseEther("1");
const start = PAID_START;
const other = ADDR.router;
const hash = (number: bigint) =>
  `0x${number.toString(16).padStart(64, "0")}` as Hex;
const header = async (number: bigint) => ({
  number,
  timestamp: 1791378000n + (number - start) * 12n,
});
const snapshot = (main = M0, block = start + 20n): WatchSnapshot => ({
  block,
  timestamp: 1791378000n,
  main,
  balances: Array<bigint>(9).fill(0n),
  dead: H0,
  supply: S0,
  sqrtPriceX96: 1n << 96n,
  ethUsd: 1n,
});
const ready = (data: WalletRecord): RecordState => ({
  data,
  pending: false,
  failed: false,
});
const empty: WalletRecord = { through: start, balance: M0, changes: [] };
const render = <P extends object>(component: FunctionComponent<P>, props: P) =>
  renderToStaticMarkup(createElement(component, props));
function receipt(
  number: bigint,
  sender: string,
  from: Address,
  to: Address,
  value = token,
): RecordReceipt {
  return {
    from: sender,
    transactionHash: hash(number),
    gasUsed: 21000n,
    effectiveGasPrice: 1_000_000_000n,
    logs: [
      {
        address: ADDR.token,
        topics: encodeEventTopics({
          abi: [transferEvent],
          eventName: "Transfer",
          args: { from, to },
        }) as Hex[],
        data: encodeAbiParameters([{ type: "uint256" }], [value]),
      },
    ],
  };
}
function mock(
  events: { at: bigint; delta: bigint; own?: boolean; proceeds?: bigint }[],
  quote = CASH_OUT,
) {
  let latest = start + 20n;
  const quotes: [bigint, bigint][] = [];
  const queried: bigint[] = [];
  const receipts = (n: bigint) => {
    const event = events.find((e) => e.at === n);
    if (!event) return [];
    return [
      receipt(
        n,
        event.own === false ? other : HIS_WALLET,
        event.delta < 0n ? HIS_WALLET : other,
        event.delta < 0n ? other : HIS_WALLET,
        event.delta < 0n ? -event.delta : event.delta,
      ),
    ];
  };
  const source: RecordSource = {
    latest: () => header(latest),
    block: header,
    balance: async (n) =>
      M0 +
      events.filter((e) => e.at <= n).reduce((sum, e) => sum + e.delta, 0n),
    receipts: async (n) => {
      queried.push(n);
      return receipts(n);
    },
    eth: async (n) =>
      parseEther("10") +
      events
        .filter((e) => e.at <= n)
        .reduce(
          (sum, e) =>
            sum +
            (e.proceeds ?? 0n) -
            (e.own === false ? 0n : 21000n * 1_000_000_000n),
          0n,
        ),
    quote: async (n, amount) => {
      quotes.push([n, amount]);
      return quote;
    },
  };
  return {
    source,
    quotes,
    queried,
    latest: (n: bigint) => {
      latest = n;
    },
  };
}

test("paid search follows burned threshold despite top-ups and validates the nine at that exact block", async () => {
  const paid = start + 7n;
  const totals: bigint[] = [];
  const source = {
    block: header,
    burned: async (n: bigint) => (n < paid ? H0 - 1n : H0),
    total: async (n: bigint) => {
      totals.push(n);
      return n === paid ? 0n : token;
    },
  };
  assert.deepEqual(
    await findBurnPaidBlock(await header(start + 40n), source),
    await header(paid),
  );
  assert.deepEqual(totals, [paid]);
  assert.equal(
    await findBurnPaidBlock(await header(start + 40n), {
      ...source,
      total: async () => token,
    }),
    undefined,
  );
  const html = render(SecondActView, {
    data: { ...snapshot(), balances: [token, ...Array<bigint>(8).fill(0n)] },
    failed: false,
    paid: {
      ...initialPaidState,
      history: { paid: await header(paid), points: [] },
    },
    record: ready(empty),
  });
  assert.match(html, /THE SECOND RANSOM IS PAID\./);
  assert.match(html, /1\.00 FREE1376/);
  assert.doesNotMatch(html, /cash-out line|≈/);
  assert.match(
    html,
    /The person who owned me burned every token in his nine hidden wallets\./,
  );
});

test("equal endpoints finish a million-block range without any interior reads", async () => {
  const queried: bigint[] = [];
  assert.deepEqual(
    await findBalanceChanges(0n, 1_000_000n, async (n) => {
      queried.push(n);
      assert.ok(n === 0n || n === 1_000_000n, "No interior read is allowed");
      return 100n;
    }),
    [],
  );
  assert.deepEqual(queried, [0n, 1_000_000n]);
});

test("an unchanged visit makes exactly two balance reads and never asks for logs or receipts", async () => {
  const m = mock([]);
  const queried: bigint[] = [];
  m.source.balance = async (n) => {
    queried.push(n);
    return M0;
  };
  // Tripwires for either former range-log API, even if added back dynamically.
  const source = {
    ...m.source,
    getLogs: async () => assert.fail("No log queries"),
  };
  Object.defineProperty(source, "transferBlocks", {
    get: () => assert.fail("No transfer-block queries"),
  });
  const record = await extendWalletRecord(source);
  assert.deepEqual(record.changes, []);
  assert.deepEqual(queried, [start + 20n, start - 1n]);
  assert.deepEqual(m.queried, []);
  assert.ok(recordOfferRules(ready(record)).every((row) => row.endsWith("✓")));
});

test("one change over a million blocks needs at most two reads per halving", async () => {
  for (const at of [1n, 500_000n, 731_927n, 1_000_000n]) {
    const reads: bigint[] = [];
    assert.deepEqual(
      await findBalanceChanges(0n, 1_000_000n, async (n) => {
        reads.push(n);
        return n < at ? 100n : 70n;
      }),
      [{ block: at, before: 100n, after: 70n }],
    );
    assert.ok(
      reads.length <= 2 + 2 * Math.ceil(Math.log2(1_000_000)),
      `${reads.length} reads`,
    );
    assert.equal(
      new Set(reads).size,
      reads.length,
      "Cached endpoints are read once",
    );
  }
});

test("two changes in one range are found in order with adjacent-block balances", async () => {
  assert.deepEqual(
    await findBalanceChanges(0n, 1_000_000n, async (n) =>
      n < 71n ? 100n : n < 812_345n ? 70n : 60n,
    ),
    [
      { block: 71n, before: 100n, after: 70n },
      { block: 812_345n, before: 70n, after: 60n },
    ],
  );
});

test("sale then buy at different amounts preserve classification, proceeds and first-decrease quote", async () => {
  const m = mock([
    { at: start + 2n, delta: -3n * token, proceeds: CASH_OUT },
    { at: start + 9n, delta: token, proceeds: -parseEther("1") },
  ]);
  const record = await extendWalletRecord(m.source);
  assert.deepEqual(
    record.changes.map((c) => [c.block, c.kind]),
    [
      [start + 2n, "sale"],
      [start + 9n, "buy"],
    ],
  );
  assert.deepEqual(m.queried, [start + 2n, start + 9n]);
  assert.deepEqual(m.quotes, [[start + 1n, M0]]);
  assert.equal(recouped(record), CASH_OUT);
  assert.equal(recordFulfilled(ready(record)), false);
  assert.deepEqual(recordVerdicts([], ready(record)), ["HE BOUGHT AGAIN."]);
});

test("exactly offsetting sale and buy inside equal endpoints are intentionally invisible", async () => {
  const queried: bigint[] = [];
  assert.deepEqual(
    await findBalanceChanges(0n, 160n, async (n) => {
      queried.push(n);
      return n >= 5n && n < 130n ? 4n : 6n;
    }),
    [],
  );
  assert.deepEqual(queried, [0n, 160n]);
});

test("equal subranges are pruned even when the enclosing range differs", async () => {
  const queried: bigint[] = [];
  assert.deepEqual(
    await findBalanceChanges(0n, 16n, async (n) => {
      queried.push(n);
      return n >= 2n && n < 6n ? 90n : n < 12n ? 100n : 80n;
    }),
    [{ block: 12n, before: 100n, after: 80n }],
  );
  assert.ok(queried.every((n) => n === 0n || n >= 8n));
});

test("bisection handles empty and adjacent ranges", async () => {
  for (const [low, high] of [
    [5n, 5n],
    [6n, 5n],
  ]) {
    assert.deepEqual(
      await findBalanceChanges(low, high, async () =>
        assert.fail("Empty range read"),
      ),
      [],
    );
  }
  assert.deepEqual(await findBalanceChanges(4n, 5n, async (n) => n), [
    { block: 5n, before: 4n, after: 5n },
  ]);
});

test("a sale at the exact quote boundary is allowed; later sales stay allowed and proceeds add his gas back", async () => {
  const m = mock([
    { at: start + 2n, delta: -token, proceeds: parseEther("4") },
    { at: start + 9n, delta: -token, proceeds: parseEther("4.67") },
  ]);
  const record = await extendWalletRecord(m.source);
  assert.equal(record.firstDecreaseAllowed, true);
  assert.deepEqual(m.quotes, [[start + 1n, M0]]);
  assert.deepEqual(m.queried, [start + 2n, start + 9n]);
  assert.deepEqual(
    record.changes.map((c) => c.kind),
    ["sale", "sale"],
  );
  assert.equal(recouped(record), CASH_OUT);
  assert.ok(recordOfferRules(ready(record)).every((row) => row.endsWith("✓")));
  assert.equal(recordFulfilled(ready(record)), true);
  const html = render(Recouped, { record: ready(record) });
  assert.match(
    html,
    /recouped by selling: 8\.6700 of 8\.67 ETH\. The third act opens at 8\.67\./,
  );
  assert.match(html, /class="sealed-headline">THE SECOND ACT IS FULFILLED\./);
  assert.match(html, /UTC · 1\.00 FREE1376 → 4\.0000 ETH/);
  assert.ok(
    html.includes(`href="https://etherscan.io/tx/${hash(start + 2n)}"`),
  );
  assert.match(
    render(SellMeter, {
      live: {
        out: 1n,
        balance: M0,
        amount: M0,
        block: start,
        timestamp: 1n,
        marketCap: 1,
      },
      failed: false,
      allowed: true,
    }),
    /HE MAY SELL\./,
  );
});

test("a first decrease one wei below the boundary stays early even after later sales", async () => {
  const m = mock(
    [
      { at: start + 1n, delta: -token, proceeds: CASH_OUT },
      { at: start + 6n, delta: -token, proceeds: 1n },
    ],
    CASH_OUT - 1n,
  );
  const record = await extendWalletRecord(m.source);
  assert.equal(record.firstDecreaseAllowed, false);
  assert.equal(recordFulfilled(ready(record)), false);
  assert.match(recordOfferRules(ready(record))[2], /✗ HE SOLD EARLY\./);
  assert.deepEqual(recordVerdicts([], ready(record)), ["HE SOLD EARLY."]);
});

test("gifts never accuse, even above M0; own transactions must actually transfer this token to him to be buys", async () => {
  const m = mock([{ at: start + 3n, delta: token, own: false }]);
  const record = await extendWalletRecord(m.source);
  assert.equal(record.changes[0].kind, "gift");
  assert.equal(recouped(record), 0n);
  const rules = recordOfferRules(ready(record));
  assert.ok(rules.every((row) => row.endsWith("✓")));
  const html = render(SecondActView, {
    data: snapshot(M0 + token),
    failed: false,
    record: ready(record),
  });
  assert.doesNotMatch(html, /✗|HE BOUGHT AGAIN\.|HE SOLD EARLY\./);
  const original = m.source.receipts;
  m.source.receipts = async (n) => [
    ...(await original(n)),
    { ...receipt(n, HIS_WALLET, other, HIS_WALLET), logs: [] },
  ];
  assert.equal((await extendWalletRecord(m.source)).changes[0].kind, "gift");
  m.source.receipts = async (n) => [receipt(n, HIS_WALLET, other, HIS_WALLET)];
  const bought = await extendWalletRecord(m.source);
  assert.equal(bought.changes[0].kind, "buy");
  assert.deepEqual(recordVerdicts([], ready(bought)), ["HE BOUGHT AGAIN."]);
  assert.equal(
    recordOfferRules(ready(bought)).filter((row) =>
      row.includes("✗ HE BOUGHT AGAIN."),
    ).length,
    2,
  );
});

test("a move has no proceeds, including negative gain; first-decrease permission still uses the previous block", async () => {
  for (const proceeds of [0n, -parseEther("1")]) {
    const m = mock([{ at: start + 2n, delta: -token, proceeds }]);
    const record = await extendWalletRecord(m.source);
    assert.equal(record.changes[0].kind, "move");
    assert.equal(recouped(record), 0n);
    assert.equal(record.firstDecreaseAllowed, true);
    assert.doesNotMatch(
      render(Recouped, { record: ready(record) }),
      /etherscan.io\/tx/,
    );
  }
});

test("gas correction includes all transactions he sent and none sent by other people", async () => {
  const m = mock([
    { at: start + 2n, delta: -token, proceeds: parseEther("1") },
  ]);
  const get = m.source.receipts;
  m.source.receipts = async (n) => [
    ...(await get(n)),
    {
      ...receipt(n, HIS_WALLET, other, HIS_WALLET),
      gasUsed: 5n,
      effectiveGasPrice: 7n,
      logs: [],
    },
    {
      ...receipt(n, other, other, HIS_WALLET),
      gasUsed: 100n,
      effectiveGasPrice: 100n,
      logs: [],
    },
  ];
  assert.equal(
    recouped(await extendWalletRecord(m.source)),
    parseEther("1") + 35n,
  );
});

test("loading and failed record have unknown rows and no accusations; incomplete record cannot fulfill", () => {
  for (const record of [
    initialRecordState,
    { pending: false, failed: true },
    {
      data: { ...empty, firstDecreaseAllowed: false },
      pending: true,
      failed: false,
    },
  ]) {
    assert.ok(recordOfferRules(record).every((row) => row.endsWith("—")));
    assert.deepEqual(
      recordVerdicts(
        ["BURNED. ALL OF IT.", "HE BOUGHT AGAIN.", "HE SOLD EARLY."],
        record,
      ),
      ["BURNED. ALL OF IT."],
    );
    assert.equal(recordFulfilled(record), false);
  }
  assert.match(
    render(Recouped, { record: ready(empty) }),
    /recouped by selling: 0\.0000 of 8\.67 ETH/,
  );
});

test("extension preserves the first decision and uses min(balance,M0) at the block before the first decrease", async () => {
  const m = mock([{ at: start + 4n, delta: -token, proceeds: 1n }]);
  const previous = { ...empty, balance: token };
  m.source.balance = async (n) => (n < start + 4n ? token : 0n);
  const record = await extendWalletRecord(m.source, previous);
  assert.deepEqual(m.quotes, [[start + 3n, token]]);
  assert.equal(record.firstDecreaseAllowed, true);
  assert.equal(await extendWalletRecord(m.source, record), record);
});

test("record reads once per visit, extends on watch changes, survives navigation and retries failure", async () => {
  const events: Parameters<typeof mock>[0] = [];
  const m = mock(events);
  let scans = 0;
  const latest = m.source.latest;
  let fail = false;
  m.source.latest = async () => {
    scans++;
    if (fail) throw Error("offline");
    return latest();
  };
  const visit = createRecordVisit(m.source);
  const states: RecordState[] = [];
  let stop = visit.subscribe((state) => states.push(state));
  await setImmediate();
  assert.equal(scans, 1);
  assert.equal(states.at(-1)?.data?.changes.length, 0);
  stop();
  stop = visit.subscribe((state) => states.push(state));
  visit.observe(snapshot());
  await setImmediate();
  assert.equal(scans, 1);
  events.push({ at: start + 21n, delta: token, own: false });
  m.latest(start + 21n);
  fail = true;
  visit.observe(snapshot(M0 + token, start + 21n));
  await setImmediate();
  assert.equal(states.at(-1)?.failed, true);
  fail = false;
  visit.observe(snapshot(M0 + token, start + 22n));
  await setImmediate();
  assert.equal(states.at(-1)?.failed, false);
  assert.equal(states.at(-1)?.data?.changes[0].kind, "gift");
  assert.equal(states.at(-1)?.data?.changes.length, 1);
  stop();
});

test("third act lines are word for word and the second act link works in both initial key states", () => {
  const html = render(ThirdActGate, {});
  assert.equal(
    html.replace(/<[^>]*>/g, ""),
    "The third act opens when the person who owned me sells the bag he kept and gets 8.67 ETH back. Everything is in the second act.",
  );
  assert.match(html, /href="#second-act">the second act<\/a>/);
  assert.equal(
    render(ThirdActGate, { fulfilled: true }).replace(/<[^>]*>/g, ""),
    "The second act is fulfilled. The third act opens next.",
  );
});

test("failed endpoint or midpoint reads reject without a scan fallback", async () => {
  for (const unavailable of [0n, 4n, 8n]) {
    const queried: bigint[] = [];
    await assert.rejects(
      findBalanceChanges(0n, 8n, async (n) => {
        queried.push(n);
        if (n === unavailable) throw Error("state unavailable");
        return n < 5n ? 100n : 90n;
      }),
      /state unavailable/,
    );
    assert.ok(queried.length <= 3);
  }
});

test("fulfilled uses exact wei and is withheld after a buy or while rereading", () => {
  const record: WalletRecord = {
    ...empty,
    firstDecreaseAllowed: true,
    changes: [
      {
        block: start,
        before: M0,
        after: M0 - token,
        timestamp: 1n,
        kind: "sale",
        proceeds: CASH_OUT - 1n,
        transaction: hash(start),
      },
    ],
  };
  assert.equal(recordFulfilled(ready(record)), false);
  record.changes[0].proceeds = CASH_OUT;
  assert.equal(recordFulfilled(ready(record)), true);
  assert.equal(recordFulfilled({ ...ready(record), pending: true }), false);
  record.changes.push({
    block: start + 1n,
    before: M0 - token,
    after: M0,
    timestamp: 2n,
    kind: "buy",
    proceeds: 0n,
  });
  assert.equal(recordFulfilled(ready(record)), false);
});

test("the starting block is included; a different token or an outgoing own transfer never marks an increase as a buy", async () => {
  const m = mock([{ at: start, delta: token, own: false }]);
  m.source.receipts = async (n) => [
    {
      ...receipt(n, HIS_WALLET, other, HIS_WALLET),
      logs: receipt(n, HIS_WALLET, other, HIS_WALLET).logs.map((log) => ({
        ...log,
        address: other,
      })),
    },
    receipt(n, HIS_WALLET, HIS_WALLET, other),
  ];
  const record = await extendWalletRecord(m.source);
  assert.equal(record.changes[0].block, start);
  assert.equal(record.changes[0].kind, "gift");
});

test("burned archive read adds supply destruction and the dead balance at the same block", async () => {
  const { burnedAt } = await import("../src/burnReads");
  const { aggregateAbi } = await import("../src/paidReads");
  const { decodeFunctionData, encodeFunctionResult } = await import("viem");
  const { tokenAbi } = await import("../src/chain");
  const { DEAD } = await import("../src/watch");
  const burned = await burnedAt(start, async (request) => {
    assert.equal(request.blockNumber, start);
    const calls = decodeFunctionData({ abi: aggregateAbi, data: request.data })
      .args![0];
    assert.equal(calls.length, 2);
    const first = decodeFunctionData({
      abi: tokenAbi,
      data: calls[0].callData,
    });
    const second = decodeFunctionData({
      abi: tokenAbi,
      data: calls[1].callData,
    });
    assert.equal(first.functionName, "totalSupply");
    assert.equal(second.functionName, "balanceOf");
    assert.equal(second.args![0], DEAD);
    return {
      data: encodeFunctionResult({
        abi: aggregateAbi,
        functionName: "aggregate3",
        result: [
          {
            success: true,
            returnData: encodeFunctionResult({
              abi: tokenAbi,
              functionName: "totalSupply",
              result: S0 - 3n,
            }),
          },
          {
            success: true,
            returnData: encodeFunctionResult({
              abi: tokenAbi,
              functionName: "balanceOf",
              result: H0 - 3n,
            }),
          },
        ],
      }),
    };
  });
  assert.equal(burned, H0);
});

test("paid block is published before chart completion and survives failed history retries", async (t) => {
  const { createPaidVisit } = await import("../src/paidVisit");
  t.mock.timers.enable({ apis: ["setInterval"] });
  const states: import("../src/paid").PaidState[] = [];
  let calls = 0;
  const visit = createPaidVisit(
    async (onPaid) => {
      calls++;
      onPaid(await header(start));
      throw Error("history failed");
    },
    async () => ({
      block: start,
      timestamp: 1n,
      out: 1n,
      marketCap: 1,
      balance: M0,
      amount: M0,
    }),
  );
  const stop = visit((state) => states.push(state));
  await setImmediate();
  assert.equal(states.at(-1)?.history?.paid?.number, start);
  assert.equal(states.at(-1)?.historyFailed, true);
  t.mock.timers.tick(15000);
  await setImmediate();
  assert.equal(calls, 2);
  assert.equal(states.at(-1)?.history?.paid?.number, start);
  stop();
});
