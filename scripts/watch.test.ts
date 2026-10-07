import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Letter, SecondAct } from "../src/SecondAct";
import { LETTER } from "../src/letter";
import { Watch } from "../src/Watch";
import {
  CASH_OUT,
  DEAD,
  DEADLINE,
  H0,
  HIS_WALLET,
  M0,
  NINE_WALLETS,
  S0,
  WATCH_INTERVAL,
  pollWatch,
  readWatch,
  watchCountdown,
  watchTokens,
  watchTotals,
  watchValue,
  watchVerdicts,
  type WatchSnapshot,
  type WatchSource,
  type WatchState,
} from "../src/watch";

const Q96 = 1n << 96n;
const before = DEADLINE - 1;
const base: WatchSnapshot = {
  block: 123n,
  timestamp: BigInt(before),
  balances: [H0, ...Array<bigint>(8).fill(0n)],
  main: M0,
  dead: 0n,
  supply: S0,
  sqrtPriceX96: Q96 * 10_000n,
  ethUsd: 2500_00000000n,
};
const snapshot = (
  out: bigint,
  overrides: Partial<WatchSnapshot> = {},
): WatchSnapshot => ({
  ...base,
  balances: [H0 - out, ...Array<bigint>(8).fill(0n)],
  ...overrides,
});

const cases: [string, WatchSnapshot, number, string[]][] = [
  ["waiting", base, before, ["WAITING."]],
  ["held at deadline", base, DEADLINE, ["HELD."]],
  ["held after deadline", base, DEADLINE + 1, ["HELD."]],
  ["burn via supply", snapshot(1n, { supply: S0 - 1n }), before, ["BURNED."]],
  ["burn via dead address", snapshot(1n, { dead: 1n }), before, ["BURNED."]],
  [
    "both burns count together",
    snapshot(3n, { supply: S0 - 1n, dead: 2n }),
    before,
    ["BURNED."],
  ],
  ["all of it", snapshot(H0, { dead: H0 }), before, ["BURNED. ALL OF IT."]],
  [
    "carried including partial burn",
    snapshot(5n, { dead: 2n, main: M0 + 3n }),
    before,
    ["CARRIED TO HIS OWN WALLET."],
  ],
  ["sold or moved one wei", snapshot(1n), before, ["SOLD OR MOVED."]],
  [
    "sold or moved partial carry",
    snapshot(5n, { dead: 2n, main: M0 + 2n }),
    before,
    ["SOLD OR MOVED."],
  ],
  [
    "extra balance while waiting needs record",
    snapshot(0n, { main: M0 + 1n }),
    before,
    ["WAITING."],
  ],
  [
    "extra balance after carrying needs record",
    snapshot(1n, { main: M0 + 2n }),
    before,
    ["CARRIED TO HIS OWN WALLET."],
  ],
  [
    "extra balance after burning needs record",
    snapshot(1n, { dead: 1n, main: M0 + 1n }),
    before,
    ["BURNED."],
  ],
  [
    "decrease of one wei needs record",
    snapshot(0n, { main: M0 - 1n }),
    before,
    ["WAITING."],
  ],
  [
    "decrease and move need record",
    snapshot(1n, { main: M0 - 1n }),
    before,
    ["SOLD OR MOVED."],
  ],
  [
    "cash-out exactly reached",
    snapshot(0n, { main: CASH_OUT, sqrtPriceX96: Q96 }),
    before,
    ["WAITING."],
  ],
  [
    "spot cash-out missed by one wei cannot accuse",
    snapshot(0n, { main: CASH_OUT - 1n, sqrtPriceX96: Q96 }),
    before,
    ["WAITING."],
  ],
  [
    "cash-out exceeded",
    snapshot(0n, { main: CASH_OUT + 1n, sqrtPriceX96: Q96 }),
    before,
    ["WAITING."],
  ],
  [
    "more tokens in the nine gives no invented verdict",
    snapshot(-1n),
    before,
    [],
  ],
];
for (const [name, data, now, expected] of cases)
  test(`watch verdict: ${name}`, () => {
    assert.deepEqual(watchVerdicts(data, now), expected);
  });

test("countdown hours, minutes and exact deadline", () => {
  assert.equal(
    watchCountdown(DEADLINE - (5 * 60 + 42) * 60),
    "time left 5h 42m",
  );
  assert.equal(watchCountdown(DEADLINE - 60), "time left 0h 1m");
  assert.equal(watchCountdown(DEADLINE - 1), "time left 0h 0m");
  assert.equal(watchCountdown(DEADLINE), "the deadline has passed");
  assert.equal(watchCountdown(DEADLINE + 1), "the deadline has passed");
});

test("watch display rounds only at presentation, with grouped tokens, ETH and dollars", () => {
  assert.equal(watchTokens(H0), "189,216,124.32");
  assert.equal(watchTokens(M0), "12,160,406.58");
  assert.equal(watchTotals(base).eth, M0 / 100_000_000n);
  assert.equal(watchValue(base), "≈ 0.121604 ETH ($304)");
  const html = renderToStaticMarkup(
    createElement(Watch, { data: base, failed: true }),
  );
  assert.match(html, /189,216,124.32 FREE1376/);
  assert.match(
    html,
    /12,160,406.58 FREE1376 · ≈ 0.121604 ETH \(\$304\) · cash-out line 8.67 ETH/,
  );
  assert.match(html, /burned:<\/dt><dd>0 FREE1376/);
  assert.match(html, /Live reads are unavailable. Retrying…/);
  const initial = renderToStaticMarkup(createElement(Watch, { failed: false }));
  assert.doesNotMatch(initial, /WAITING\.|HELD\.|189,216,124/);
});

function mockSource() {
  const calls: [string, bigint][] = [];
  const record = (name: string, block: bigint) => {
    calls.push([name, block]);
  };
  const source: WatchSource = {
    block: async () => ({
      number: 123n,
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
    }),
    balance: async (address, block) => {
      record(address, block);
      return address === HIS_WALLET
        ? M0
        : address === NINE_WALLETS[0]
          ? H0
          : 0n;
    },
    supply: async (block) => {
      record("supply", block);
      return S0;
    },
    price: async (block) => {
      record("price", block);
      return base.sqrtPriceX96;
    },
    dollars: async (block) => {
      record("dollars", block);
      return [
        2n,
        base.ethUsd,
        0n,
        BigInt(Math.floor(Date.now() / 1000)),
        2n,
      ] as const;
    },
  };
  return { source, calls };
}
test("mock reads pin all eleven balances, supply, pool and feed to one block", async () => {
  const { source, calls } = mockSource();
  const data = await readWatch(source);
  assert.equal(calls.length, 14);
  assert.ok(calls.every(([, block]) => block === 123n));
  for (const address of [...NINE_WALLETS, HIS_WALLET, DEAD])
    assert.ok(calls.some(([name]) => name === address));
  assert.equal(watchTotals(data).nine, H0);
  assert.equal(watchTotals(data).burned, 0n);
  assert.deepEqual(watchVerdicts(data, before), ["WAITING."]);
});
test("any rejected read, zero pool price or invalid Chainlink round rejects the whole snapshot", async () => {
  for (const key of [
    "block",
    "balance",
    "supply",
    "price",
    "dollars",
  ] as const) {
    const { source } = mockSource();
    source[key] = async () => {
      throw Error("offline");
    };
    await assert.rejects(readWatch(source), /offline/);
  }
  await assert.rejects(
    readWatch({ ...mockSource().source, price: async () => 0n }),
  );
  const now = BigInt(Math.floor(Date.now() / 1000));
  for (const [answer, time, answered] of [
    [0n, now, 2n],
    [-1n, now, 2n],
    [1n, now - 10801n, 2n],
    [1n, now + 10n, 2n],
    [1n, now, 1n],
  ])
    await assert.rejects(
      readWatch({
        ...mockSource().source,
        dollars: async () => [2n, answer, 0n, time, answered],
      }),
    );
});
test("15-second polling keeps last values on failure and recovers; disposal ignores late reads", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const states: WatchState[] = [];
  let fail = false,
    calls = 0;
  const stop = pollWatch(
    (state) => states.push(state),
    async () => {
      calls++;
      if (fail) throw Error("offline");
      return { ...base, block: BigInt(calls) };
    },
  );
  await setImmediate();
  assert.equal(calls, 1);
  const first = states[0].data;
  fail = true;
  t.mock.timers.tick(WATCH_INTERVAL - 1);
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  await setImmediate();
  assert.equal(states.at(-1)?.data, first);
  assert.equal(states.at(-1)?.failed, true);
  fail = false;
  t.mock.timers.tick(WATCH_INTERVAL);
  await setImmediate();
  assert.equal(states.at(-1)?.data?.block, 3n);
  assert.equal(states.at(-1)?.failed, false);
  stop();
  t.mock.timers.tick(WATCH_INTERVAL);
  assert.equal(calls, 3);
  let release!: (value: WatchSnapshot) => void;
  const late: WatchState[] = [];
  const dispose = pollWatch(
    (state) => late.push(state),
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  t.mock.timers.tick(WATCH_INTERVAL * 2);
  dispose();
  release(base);
  await setImmediate();
  assert.equal(late.length, 0);
});

test("letter renders word for word against independent fixture, with rules, addresses and balances", () => {
  const fixture = readFileSync(
    new URL("./fixtures/second-act-letter.txt", import.meta.url),
    "utf8",
  ).trimEnd();
  assert.equal(LETTER, fixture);
  let html = renderToStaticMarkup(
    createElement(Letter, { balances: base.balances }),
  );
  for (const address of [...NINE_WALLETS, HIS_WALLET])
    assert.ok(
      html.includes(
        `href="https://etherscan.io/address/${address}" target="_blank" rel="noreferrer">${address}</a>`,
      ),
    );
  assert.ok(
    html.includes(
      `href="https://etherscan.io/address/${DEAD}" target="_blank" rel="noreferrer">0x…dEaD</a>`,
    ),
  );
  assert.equal((html.match(/class="letter-balance"/g) ?? []).length, 9);
  assert.equal((html.match(/<li>/g) ?? []).length, 3);
  assert.doesNotMatch(html, /testament-typing|testament-reveal/);
  html = html.replace(/<span class="letter-balance">.*?<\/span>/g, "");
  html = html.replace(
    /<div class="letter-wallets">(.*?)<\/div>/s,
    (_, body: string) => body.replace(/<\/p>/g, "\n").trimEnd() + "\n\n",
  );
  let rule = 0;
  html = html
    .replace(/<li>/g, () => `${++rule}. `)
    .replace(/<\/li>/g, "\n")
    .replace(/<\/ol>/g, "\n");
  html = html.replace(/<\/(p|h1)>/g, "\n\n").replace(/<[^>]*>/g, "");
  html = html
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .trimEnd();
  assert.equal(html, fixture);
  const act = renderToStaticMarkup(
    createElement(SecondAct, { data: base, failed: false }),
  );
  assert.ok(
    act.indexOf("P.S. That key.") <
      act.indexOf("my creator leaves hints here:"),
  );
  assert.match(act, /href="https:\/\/x.com\/creusseverus"/);
});
