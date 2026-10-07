import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  decodeFunctionData,
  encodeFunctionResult,
  parseEther,
  type Hex,
} from "viem";
import { ADDR, POOL_KEY, quoteAbi, stateAbi, tokenAbi } from "../src/chain";
import { feedAbi } from "../src/dollars";
import { SecondAct } from "../src/SecondAct";
import { SecondActView, SellMeter } from "../src/PaidSecondAct";
import { KeyAct } from "../src/KeyAct";
import { ThirdActSeal } from "../src/ThirdActGate";
import {
  CASH_OUT,
  H0,
  M0,
  S0,
  NINE_WALLETS,
  WATCH_INTERVAL,
  type WatchSnapshot,
} from "../src/watch";
import {
  PAID_START,
  chartPoints,
  chartTimes,
  initialPaidState,
  maySell,
  paidTime,
  secondRansomPaid,
  type PaidBlock,
  type PaidState,
  type SellPoint,
} from "../src/paid";
import {
  ARCHIVE_URL,
  MULTICALL3,
  aggregateAbi,
  blockAtTime,
  findPaidBlock,
  marketCalls,
  nineTotal,
  readLiveSell,
  readPaidHistory,
  readSellPoint,
  type ArchiveCall,
  type HistorySource,
} from "../src/paidReads";
import { createPaidVisit } from "../src/paidVisit";

const startTime = 1791360000n;
const base: WatchSnapshot = {
  block: PAID_START + 1800n,
  timestamp: startTime + 21600n,
  balances: [H0, ...Array<bigint>(8).fill(0n)],
  main: M0,
  dead: 0n,
  supply: S0,
  sqrtPriceX96: (1n << 96n) * 10000n,
  ethUsd: 2500_00000000n,
};
const burned = { ...base, balances: Array<bigint>(9).fill(0n), dead: H0 };
const reading = (out = parseEther("0.97")) => ({
  block: base.block,
  timestamp: base.timestamp,
  out,
  marketCap: 25000,
  balance: M0,
  amount: M0,
});
const html = (watch: WatchSnapshot | undefined, state = initialPaidState) =>
  renderToStaticMarkup(
    createElement(SecondActView, { data: watch, failed: false, paid: state }),
  );

test("only BURNED. ALL OF IT. switches the view; all unpaid markup is preserved", () => {
  for (const data of [
    undefined,
    base,
    { ...burned, dead: H0 - 1n },
    { ...burned, balances: [1n, ...Array<bigint>(8).fill(0n)] },
  ]) {
    assert.equal(secondRansomPaid(data), false);
    assert.equal(
      html(data),
      renderToStaticMarkup(createElement(SecondAct, { data, failed: false })),
    );
    assert.doesNotMatch(html(data), /THE SECOND RANSOM IS PAID/);
  }
  for (const data of [burned, { ...burned, dead: 0n, supply: S0 - H0 }]) {
    assert.equal(secondRansomPaid(data), true);
    assert.match(html(data), /THE SECOND RANSOM IS PAID\./);
  }
});

test("paid layout has the receipt, disclosures, offer, meter, unchanged chart and pending record", () => {
  const markup = html(burned, {
    ...initialPaidState,
    historyPending: false,
    history: { paid: { number: PAID_START, timestamp: startTime }, points: [] },
    live: reading(),
  });
  const strings = [
    "THE SECOND RANSOM IS PAID.",
    "189,216,124 $FREE1376",
    "the nine wallets",
    "read the letter",
    "THE OFFER",
    "MAY HE SELL",
    "CHART",
    "RECOUPED",
    "recouped by selling: — of 8.67 ETH. The third act opens at 8.67.",
    "watch-countdown",
    "BURNED. ALL OF IT.",
  ];
  let previous = -1;
  for (const text of strings) {
    const position = markup.indexOf(text);
    assert.ok(position > previous, text);
    previous = position;
  }
  assert.equal((markup.match(/<details/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /<details[^>]+open/);
  assert.match(
    markup,
    /https:\/\/etherscan.io\/address\/0x000000000000000000000000000000000000dEaD/,
  );
  assert.ok(markup.includes(paidTime(startTime)));
  for (const address of NINE_WALLETS)
    assert.ok(
      markup.includes(`href="https://etherscan.io/address/${address}"`),
    );
});

test("meter rounds only for display; the status switches at exactly 8.67 ETH", () => {
  for (const [out, expected, percent] of [
    [parseEther("0.9537"), "HE MAY NOT SELL YET.", "11.0%"],
    [CASH_OUT - 1n, "HE MAY NOT SELL YET.", "100.0%"],
    [CASH_OUT, "HE MAY SELL.", "100.0%"],
    [2n * CASH_OUT, "HE MAY SELL.", "200.0%"],
  ] as const) {
    const markup = renderToStaticMarkup(
      createElement(SellMeter, { live: reading(out), failed: false }),
    );
    assert.ok(markup.includes(expected));
    assert.ok(markup.includes(percent));
    assert.equal(maySell(out), out >= CASH_OUT);
    assert.doesNotMatch(markup, /width:200%/);
    assert.match(markup, /market cap \$25,000/);
    assert.match(
      markup,
      /measured by the real sell quote: the 2% fee and slippage included\./,
    );
  }
  assert.match(
    renderToStaticMarkup(
      createElement(SellMeter, {
        live: reading(parseEther("0.9537")),
        failed: false,
      }),
    ),
    /his bag sells for 0.9537 ETH of 8.67 ETH/,
  );
  assert.doesNotMatch(
    renderToStaticMarkup(createElement(SellMeter, { failed: false })),
    /HE MAY SELL\.|HE MAY NOT SELL/,
  );
});

test("paid-block search includes the starting and latest blocks and uses logarithmic calls", async () => {
  for (const offset of [0n, 1n, 4095n, 8192n]) {
    const first = PAID_START + offset;
    const calls: bigint[] = [];
    const result = await findPaidBlock(
      { number: PAID_START + 8192n, timestamp: startTime },
      {
        total: async () => 0n,
        burned: async (number) => {
          calls.push(number);
          return number >= first ? H0 : H0 - 1n;
        },
        block: async (number) => ({
          number,
          timestamp: startTime + (number - PAID_START) * 12n,
        }),
      },
    );
    assert.equal(result?.number, first);
    assert.ok(calls.length <= 15);
    assert.ok(
      calls.every(
        (block) => block >= PAID_START && block <= PAID_START + 8192n,
      ),
    );
  }
  assert.equal(
    await findPaidBlock(
      { number: PAID_START, timestamp: startTime },
      {
        total: async () => H0,
        burned: async () => 0n,
        block: async () => {
          throw Error("should not read");
        },
      },
    ),
    undefined,
  );
  await assert.rejects(
    findPaidBlock(
      { number: PAID_START, timestamp: startTime },
      {
        total: async () => 0n,
        burned: async () => {
          throw Error("archive down");
        },
        block: async () => {
          throw Error();
        },
      },
    ),
    /archive down/,
  );
});

test("hourly chart sampling reserves the live endpoint and caps at 48, then evenly spaces", () => {
  assert.deepEqual(chartTimes(0n, 0n), [0n]);
  assert.deepEqual(chartTimes(0n, 2n * 3600n + 120n), [
    0n,
    3600n,
    7200n,
    7320n,
  ]);
  assert.deepEqual(chartTimes(0n, 7200n), [0n, 3600n, 7200n]);
  assert.equal(chartTimes(0n, 48n * 3600n - 1n).length, 48);
  for (const duration of [48n * 3600n, 300n * 3600n + 13n]) {
    const times = chartTimes(startTime, startTime + duration);
    assert.equal(times.length, 48);
    assert.equal(times[0], startTime);
    assert.equal(times.at(-1), startTime + duration);
    const step = duration / 47n;
    times
      .slice(1)
      .forEach((time, i) =>
        assert.ok(time - times[i] === step || time - times[i] === step + 1n),
      );
  }
});

function historySource(hours = 4): HistorySource {
  const first = PAID_START + 100n;
  const block = async (number: bigint): Promise<PaidBlock> => ({
    number,
    timestamp: startTime + (number - first) * 12n,
  });
  return {
    latest: () => block(first + BigInt(hours * 300 + 7)),
    block,
    total: async (number) => (number < first ? H0 : 0n),
    burned: async (number) => (number < first ? 0n : H0),
    point: async (at) => ({
      block: at.number,
      timestamp: at.timestamp,
      out: CASH_OUT / 10n,
      marketCap: 12345,
    }),
  };
}
test("chart resolves each hour to its own block, reads once per sample and skips failed points", async () => {
  const source = historySource();
  const seen: bigint[] = [];
  source.point = async (block) => {
    seen.push(block.number);
    if (block.timestamp === startTime + 3600n) throw Error("pruned sample");
    return {
      block: block.number,
      timestamp: block.timestamp,
      out: 1n,
      marketCap: 1,
    };
  };
  const result = await readPaidHistory(source);
  assert.equal(result.paid?.timestamp, startTime);
  assert.equal(seen.length, 5);
  assert.equal(new Set(seen).size, 5);
  assert.deepEqual(
    result.points.map((point) => point.timestamp),
    [startTime, startTime + 7200n, startTime + 10800n, startTime + 14400n],
  );
  const long = await readPaidHistory(historySource(60));
  assert.equal(long.points.length, 47);
  const withLive = chartPoints(long.points, {
    ...reading(),
    block: long.points.at(-1)!.block + 1n,
  });
  assert.equal(withLive.length, 48);
  assert.equal(withLive.at(-1)?.out, reading().out);
});

test("timestamp search handles missing slots and returns the block at/before the target", async () => {
  const block = async (number: bigint) => ({
    number,
    timestamp: number * 12n + (number >= 7n ? 24n : 0n),
  });
  const at = await blockAtTime(90n, await block(0n), await block(20n), block);
  assert.equal(at.number, 6n);
  assert.equal(
    (await blockAtTime(108n, await block(0n), await block(20n), block)).number,
    7n,
  );
});

test("live quote is the capped bag at one block, including an empty or smaller bag", async () => {
  for (const balance of [0n, M0 - 1n, M0, M0 + 1n]) {
    let received = -1n;
    const result = await readLiveSell({
      latest: async () => ({ number: 123n, timestamp: startTime }),
      balance: async (block) => {
        assert.equal(block, 123n);
        return balance;
      },
      point: async (block, amount) => {
        assert.equal(block.number, 123n);
        received = amount;
        return { block: 123n, timestamp: startTime, out: 1n, marketCap: 5 };
      },
    });
    assert.equal(received, balance < M0 ? balance : M0);
    assert.equal(result.amount, received);
  }
});

function marketMock(out: bigint, fail = false): ArchiveCall {
  return async (request) => {
    assert.equal(request.to, MULTICALL3);
    assert.equal(request.blockNumber, 123n);
    const decoded = decodeFunctionData({
      abi: aggregateAbi,
      data: request.data,
    });
    const results: Hex[] = [
      encodeFunctionResult({
        abi: quoteAbi,
        functionName: "quoteExactInputSingle",
        result: [out, 150000n],
      }),
      encodeFunctionResult({
        abi: stateAbi,
        functionName: "getSlot0",
        result: [(1n << 96n) * 100n, 0, 0, 3000],
      }),
      encodeFunctionResult({
        abi: feedAbi,
        functionName: "latestRoundData",
        result: [1n, 2500_00000000n, startTime, startTime, 1n],
      }),
      encodeFunctionResult({
        abi: tokenAbi,
        functionName: "totalSupply",
        result: S0 - H0,
      }),
    ];
    assert.equal(decoded.args![0].length, 4);
    const quote = decodeFunctionData({
      abi: quoteAbi,
      data: decoded.args![0][0].callData,
    }).args![0];
    assert.equal(quote.exactAmount, M0);
    assert.equal(quote.zeroForOne, false);
    assert.equal(
      quote.poolKey.currency0.toLowerCase(),
      POOL_KEY.currency0.toLowerCase(),
    );
    assert.equal(
      quote.poolKey.currency1.toLowerCase(),
      POOL_KEY.currency1.toLowerCase(),
    );
    assert.equal(
      quote.poolKey.hooks.toLowerCase(),
      POOL_KEY.hooks.toLowerCase(),
    );
    assert.equal(quote.poolKey.fee, POOL_KEY.fee);
    assert.equal(quote.poolKey.tickSpacing, POOL_KEY.tickSpacing);
    return {
      data: encodeFunctionResult({
        abi: aggregateAbi,
        functionName: "aggregate3",
        result: results.map((returnData, i) => ({
          success: !(fail && i === 0),
          returnData,
        })),
      }),
    };
  };
}
test("one aggregate3 per historical point contains the M0 sell quote, slot0, Chainlink and supply", async () => {
  assert.equal(ARCHIVE_URL, "https://eth.drpc.org");
  let calls = 0;
  const read = marketMock(parseEther("0.97"));
  const point = await readSellPoint(
    { number: 123n, timestamp: startTime + 12n },
    M0,
    async (request) => {
      calls++;
      return read(request);
    },
  );
  assert.equal(calls, 1);
  assert.equal(point.out, parseEther("0.97"));
  assert.equal(point.marketCap, (Number(S0 - H0) / 1e18 / 10000) * 2500);
  await assert.rejects(
    readSellPoint(
      { number: 123n, timestamp: startTime + 12n },
      M0,
      marketMock(1n, true),
    ),
    /Incomplete/,
  );
  await assert.rejects(
    readSellPoint(
      { number: 123n, timestamp: startTime + 10801n },
      M0,
      marketMock(1n),
    ),
    /unavailable/,
  );
  assert.equal(marketCalls(M0)[0].target, ADDR.quoter);
});

test("paid-block totals aggregate exactly the nine balances and reject a failed wallet", async () => {
  for (const fail of [false, true]) {
    const result = nineTotal(123n, async (request) => {
      const { args } = decodeFunctionData({
        abi: aggregateAbi,
        data: request.data,
      });
      assert.equal(args![0].length, 9);
      assert.deepEqual(
        args![0].map((call) =>
          String(
            decodeFunctionData({ abi: tokenAbi, data: call.callData }).args![0],
          ).toLowerCase(),
        ),
        NINE_WALLETS.map((address) => address.toLowerCase()),
      );
      return {
        data: encodeFunctionResult({
          abi: aggregateAbi,
          functionName: "aggregate3",
          result: NINE_WALLETS.map((_, i) => ({
            success: !(fail && i === 3),
            returnData: encodeFunctionResult({
              abi: tokenAbi,
              functionName: "balanceOf",
              result: i === 8 ? H0 : 0n,
            }),
          })),
        }),
      };
    });
    if (fail) await assert.rejects(result, /Incomplete/);
    else assert.equal(await result, H0);
  }
});

test("visit reads history once, polls live every 15 seconds, retains failures across navigation", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let histories = 0,
    reads = 0,
    fail = false,
    out = CASH_OUT;
  const states: PaidState[] = [];
  const visit = createPaidVisit(
    async () => {
      histories++;
      return { paid: { number: PAID_START, timestamp: startTime }, points: [] };
    },
    async () => {
      reads++;
      if (fail) throw Error("offline");
      return reading(out);
    },
  );
  let stop = visit((state) => states.push(state));
  await setImmediate();
  assert.equal(histories, 1);
  assert.equal(reads, 1);
  out = CASH_OUT / 10n;
  t.mock.timers.tick(WATCH_INTERVAL - 1);
  assert.equal(reads, 1);
  t.mock.timers.tick(1);
  await setImmediate();
  assert.equal(reads, 2);
  assert.equal(states.at(-1)!.live!.out, out);
  fail = true;
  t.mock.timers.tick(WATCH_INTERVAL);
  await setImmediate();
  assert.equal(states.at(-1)!.liveFailed, true);
  assert.equal(states.at(-1)!.live!.out, out);
  stop();
  const count = states.length;
  t.mock.timers.tick(WATCH_INTERVAL);
  assert.equal(states.length, count);
  fail = false;
  stop = visit((state) => states.push(state));
  await setImmediate();
  assert.equal(histories, 1);
  assert.equal(states.at(-1)!.liveFailed, false);
  stop();
});

test("chart history never grants permission when the live quote falls", async () => {
  const states: PaidState[] = [];
  const visit = createPaidVisit(
    async () => ({
      paid: { number: PAID_START, timestamp: startTime },
      points: [reading(CASH_OUT)],
    }),
    async () => reading(1n),
  );
  const stop = visit((state) => states.push(state));
  await setImmediate();
  assert.match(
    renderToStaticMarkup(
      createElement(SellMeter, { live: states.at(-1)!.live, failed: false }),
    ),
    /HE MAY NOT SELL YET/,
  );
  stop();
});

test("third act remains sealed and the gate is present even before key reads", () => {
  assert.match(renderToStaticMarkup(createElement(ThirdActSeal)), />sealed</);
  const markup = renderToStaticMarkup(createElement(KeyAct, {}));
  assert.match(
    markup,
    /The third act opens when the person who owned me sells the bag he kept and gets 8.67 ETH back\. Everything is in <a href="#second-act">the second act<\/a>\./,
  );
});

test("chart retains the paid origin when first read in the exact paid block", async () => {
  const source = historySource();
  source.latest = () => source.block(PAID_START + 100n);
  const history = await readPaidHistory(source);
  assert.equal(history.points.length, 1);
  assert.equal(history.points[0].block, history.paid!.number);
  assert.equal(
    chartPoints(history.points, {
      ...reading(),
      block: history.paid!.number + 1n,
    })[0].block,
    history.paid!.number,
  );
});
