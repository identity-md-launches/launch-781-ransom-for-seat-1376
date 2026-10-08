import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import {
  createReadPool,
  PAST_URLS,
  LATEST_URLS,
  pastReads,
  latestReads,
} from "../src/readPools";
import {
  chartTarget,
  chartTransition,
  type ChartFrame,
} from "../src/chartMotion";
import {
  createChartCache,
  CHART_CACHE_KEY,
  decodeChartCache,
} from "../src/chartCache";
import {
  hourGrid,
  estimatedBlock,
  confirmBurn,
  createHourHistory,
} from "../src/hourHistory";
import {
  createReadLimit,
  createPastPoints,
  firstLoadGate,
} from "../src/pastPoints";
import { PAID_START, type SellReading } from "../src/paid";
import { M0, H0 } from "../src/watch";
import { catchUpRange, createSwapVisit } from "../src/swapVisit";
import { readSwapMeter, type SwapSource } from "../src/swapReads";
import { aggregateAbi } from "../src/paidReads";
import { decodeFunctionData, encodeFunctionResult } from "viem";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { LiveSellChart } from "../src/LiveSellChart";
const tick = async () => {
  await setImmediate();
  await setImmediate();
};
const burn = { number: PAID_START + 10n, timestamp: 1791387780n };
const point = (b: bigint): SellReading => ({
  block: b,
  timestamp: burn.timestamp + (b - burn.number) * 12n,
  out: b,
  balance: M0,
  amount: M0,
  marketCap: 100,
});
const storage = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
};
const monotone = (f: ChartFrame) =>
  f.dots.forEach((d, i) => {
    if (i) assert.ok(d.x >= f.dots[i - 1].x, `${d.x} < ${f.dots[i - 1].x}`);
  });

test("point entries use the left edge, neighbour midpoint and right edge; exits move left; interruptions never fold", () => {
  const from = chartTarget([point(10n), point(20n)], 46, 600, "live");
  const target = chartTarget(
    [point(5n), point(10n), point(15n), point(20n), point(25n)],
    46,
    600,
    "live",
  );
  const motion = chartTransition(from, target, 46, 600);
  const start = motion(0),
    dot = (b: bigint) => start.dots.find((d) => d.block === b)!;
  assert.equal(dot(5n).x, 46);
  assert.equal(dot(5n).value, from.dots[0].value);
  assert.equal(dot(15n).x, 323);
  assert.equal(dot(15n).value, (from.dots[0].value + from.dots[1].value) / 2);
  assert.ok(dot(25n).x > 600);
  for (let i = 0; i <= 100; i++) {
    const f = motion(i / 100);
    monotone(f);
    const interrupted = chartTransition(
      f,
      chartTarget(
        [point(10n), point(17n), point(25n), point(30n)],
        46,
        600,
        "live",
      ),
      46,
      600,
    );
    for (let j = 0; j <= 100; j++) monotone(interrupted(j / 100));
  }
  const leaving = chartTransition(target, from, 46, 600);
  assert.ok(
    leaving(0.5).dots.find((d) => d.block === 25n)!.x < target.dots.at(-1)!.x,
  );
});

test("first-load gate waits for settlement, opens at eight seconds at most, and fires once", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let fired = 0;
  const gate = firstLoadGate(() => fired++);
  t.mock.timers.tick(7999);
  assert.equal(fired, 0);
  t.mock.timers.tick(1);
  assert.equal(fired, 1);
  gate.settle();
  assert.equal(fired, 1);
  const early = firstLoadGate(() => fired++);
  early.settle();
  assert.equal(fired, 2);
  t.mock.timers.tick(8000);
  assert.equal(fired, 2);
});

test("fixed hour grid uses the smallest integer stride <=47 points and interpolation makes no header reads", () => {
  for (let h = 0; h < 3000; h++) {
    const grid = hourGrid(
      burn.timestamp,
      burn.timestamp + BigInt(h) * 3600n + 13n,
    );
    assert.ok(grid.length <= 47);
    const stride = BigInt(Math.floor(h / 47) + 1);
    assert.deepEqual(
      grid,
      Array.from(
        { length: Math.floor(h / Number(stride)) + 1 },
        (_, i) => BigInt(i) * stride,
      ),
    );
    if (stride > 1n) assert.ok(BigInt(h) / (stride - 1n) + 1n > 47n);
  }
  const latest = {
    number: burn.number + 1195n,
    timestamp: burn.timestamp + 4n * 3600n,
  };
  assert.equal(estimatedBlock(2n, burn, latest), burn.number + 597n);
  assert.equal(estimatedBlock(0n, burn, latest), burn.number);
});

test("two series share four past reads; failures retry 5/10/20/40/60/60 seconds and first attempts settle independently", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const limit = createReadLimit();
  let active = 0,
    maximum = 0;
  const releases: (() => void)[] = [];
  const read = async (b: bigint) => {
    maximum = Math.max(maximum, ++active);
    await new Promise<void>((r) => releases.push(r));
    active--;
    return point(b);
  };
  const a = createPastPoints(read, limit),
    b = createPastPoints(read, limit);
  const jobs = Array.from({ length: 10 }, (_, i) =>
    (i % 2 ? a : b).request(BigInt(i), () => {}),
  );
  await tick();
  assert.equal(active, 4);
  while (releases.length) {
    releases.splice(0).forEach((r) => r());
    await tick();
  }
  await Promise.all(jobs);
  assert.equal(maximum, 4);
  a.dispose();
  b.dispose();
  let tries = 0,
    result = 0;
  const retry = createPastPoints(async (n) => {
    if (++tries <= 6) throw Error("pool round failed");
    return point(n);
  });
  await retry.request(1n, () => result++);
  assert.equal(tries, 1);
  assert.equal(result, 0);
  for (const delay of [5000, 10000, 20000, 40000, 60000, 60000]) {
    const previous: number = tries;
    t.mock.timers.tick(delay - 1);
    await tick();
    assert.equal(tries, previous);
    t.mock.timers.tick(1);
    await tick();
    assert.equal(tries, previous + 1);
  }
  assert.equal(result, 1);
  retry.dispose();
});

test("cache persists decimal strings, only >=64-block final points, at most40 swaps plus baseline and47 grid; bad or foreign entries are ignored", () => {
  const s = storage(),
    cache = createChartCache(() => s);
  const readings = Array.from({ length: 42 }, (_, i) =>
    point(burn.number + BigInt(i)),
  );
  cache.setBurn(burn);
  const swaps = readings.map((p, i) => ({
    id: `0x${"a".repeat(64)}:${i}`,
    block: p.block,
    logIndex: i,
    transaction: `0x${"b".repeat(64)}` as const,
    amount0: 1n,
    amount1: -1n,
  }));
  cache.update({
    latest: burn.number + 104n,
    readings,
    swaps,
    hours: [{ k: 0n, reading: point(burn.number) }],
    baseline: point(burn.number - 1n),
  });
  const text = s.getItem(CHART_CACHE_KEY)!;
  const saved = JSON.parse(text);
  assert.equal(saved.readings.length, 40);
  assert.equal(saved.readings.at(-1).block, (burn.number + 40n).toString());
  assert.equal(saved.readings[0].marketCap, "100");
  assert.equal(saved.swaps[0].logIndex, "1");
  const reloaded = createChartCache(() => s).get();
  assert.equal(reloaded.readings.at(-1)?.block, burn.number + 40n);
  assert.deepEqual(reloaded.burn, burn);
  assert.equal(reloaded.baseline?.block, burn.number - 1n);
  assert.throws(() =>
    decodeChartCache(text, { ...burn, number: burn.number + 1n }),
  );
  for (const raw of [
    "{bad",
    "{}",
    text.replace('"chain":"1"', '"chain":"2"'),
    text.replace('"balance":"', '"balance":"-'),
  ]) {
    s.setItem(CHART_CACHE_KEY, raw);
    assert.equal(createChartCache(() => s).get().readings.length, 0);
  }
  const unavailable = createChartCache(() => {
    throw Error("SecurityError");
  });
  unavailable.setBurn(burn);
  unavailable.update({ latest: burn.number + 100n });
  unavailable.clear();
  cache.setBurn({ ...burn, number: burn.number + 1n });
  assert.equal(cache.get().readings.length, 0);
});

test("burn confirmation launches exactly three reads in parallel and rejects a changed boundary or nonzero nine total", async () => {
  let active = 0,
    maximum = 0;
  const probe = async (v: bigint) => {
    maximum = Math.max(maximum, ++active);
    await tick();
    active--;
    return v;
  };
  const source = {
    burned: (b: bigint) => probe(b === burn.number ? H0 : H0 - 1n),
    total: () => probe(0n),
    block: async () => {
      throw Error("must not read a header");
    },
  };
  assert.equal(await confirmBurn(burn, source), true);
  assert.equal(maximum, 3);
  assert.equal(
    await confirmBurn(burn, { ...source, total: async () => 1n }),
    false,
  );
  assert.equal(
    await confirmBurn(burn, { ...source, burned: async () => H0 }),
    false,
  );
});

test("hourly history publishes cached receipt immediately, retries missing hours without finishing, and adds the next grid hour", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const cache = createChartCache(storage);
  cache.setBurn(burn);
  cache.update({
    latest: burn.number + 600n,
    hours: [{ k: 0n, reading: point(burn.number) }],
  });
  let latest = {
      number: burn.number + 600n,
      timestamp: burn.timestamp + 7200n,
    },
    failed = true;
  const reads: bigint[] = [];
  const source = {
    burned: async (b: bigint) => (b >= burn.number ? H0 : 0n),
    total: async () => 0n,
    block: async () => {
      throw Error("no search");
    },
    latest: async () => latest,
    point: async (b: bigint) => {
      reads.push(b);
      if (failed && b === burn.number + 300n) throw Error("round failed");
      return point(b);
    },
  };
  const visit = createHourHistory(source, cache);
  assert.deepEqual(visit.getSnapshot().history?.paid, burn);
  const stop = visit.subscribe(() => {});
  await tick();
  assert.equal(visit.getSnapshot().historyPending, true);
  assert.equal(visit.getSnapshot().initialSettled, true);
  assert.equal(visit.getSnapshot().history?.points.length, 2);
  failed = false;
  t.mock.timers.tick(5000);
  await tick();
  assert.equal(visit.getSnapshot().historyPending, false);
  assert.equal(visit.getSnapshot().history?.points.length, 3);
  latest = { number: burn.number + 900n, timestamp: burn.timestamp + 10800n };
  await visit.refresh();
  await tick();
  assert.equal(visit.getSnapshot().history?.points.length, 4);
  assert.deepEqual(reads, [
    burn.number + 300n,
    burn.number + 600n,
    burn.number + 300n,
    burn.number + 900n,
  ]);
  stop();
  visit.dispose();
});

const reply = (id: number, result: unknown) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id, result }));
test("pools keep their exact order, sticky failover, one warn per attempt, no retry of EVM reverts, and reset at ten minutes", async () => {
  assert.equal(PAST_URLS.length, 7);
  assert.equal(LATEST_URLS.length, 7);
  assert.ok(!PAST_URLS.some((u) => u.includes("publicnode")));
  let now = 0,
    fail = true,
    revert = false;
  const calls: string[] = [],
    warnings: unknown[][] = [];
  const pool = createReadPool(PAST_URLS, {
    now: () => now,
    warn: (...args) => warnings.push(args),
    fetch: (async (url, init) => {
      calls.push(String(url));
      const { id } = JSON.parse(String(init?.body));
      if (revert)
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            error: { code: 3, message: "execution reverted", data: "0xdead" },
          }),
        );
      if (fail && String(url) === PAST_URLS[0])
        return new Response("limited", { status: 429 });
      return reply(id, "0x1234");
    }) as typeof fetch,
  });
  await pool.request({ method: "eth_blockNumber" });
  await pool.request({ method: "eth_blockNumber" });
  assert.deepEqual(calls, [PAST_URLS[0], PAST_URLS[1], PAST_URLS[1]]);
  assert.equal(warnings.length, 1);
  revert = true;
  await assert.rejects(
    pool.request({ method: "eth_call", params: [{}, "0x1"] }),
  );
  assert.equal(warnings.length, 1);
  assert.equal(calls.length, 4);
  assert.equal(pool.current(), PAST_URLS[1]);
  revert = false;
  fail = false;
  now = 600000;
  await pool.request({ method: "eth_blockNumber" });
  assert.equal(calls.at(-1), PAST_URLS[0]);
});

test("pool falls through malformed/HTTP/range/state/method replies and a six-second timeout; exhausts one round", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls: string[] = [],
    warnings: unknown[][] = [];
  const pool = createReadPool(PAST_URLS, {
    warn: (...args) => warnings.push(args),
    fetch: (async (url, init) => {
      calls.push(String(url));
      const { id } = JSON.parse(String(init?.body));
      const index = PAST_URLS.indexOf(
        String(url) as (typeof PAST_URLS)[number],
      );
      if (index === 0) return new Promise(() => {});
      if (index === 1) return reply(id, "no hex");
      if (index === 2) return new Response("", { status: 500 });
      if (index < 6)
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            error: {
              code: -32000,
              message: [
                "range unavailable",
                "state unavailable",
                "method unavailable",
              ][index - 3],
            },
          }),
        );
      return reply(id, "0x123");
    }) as typeof fetch,
  });
  const request = pool.request({ method: "eth_blockNumber" });
  t.mock.timers.tick(5999);
  await tick();
  assert.equal(calls.length, 1);
  t.mock.timers.tick(1);
  await request;
  assert.deepEqual(calls, [...PAST_URLS]);
  assert.equal(warnings.length, 6);
  const dead = createReadPool(PAST_URLS, {
    warn: () => {},
    fetch: (async () => new Response("", { status: 503 })) as typeof fetch,
  });
  await assert.rejects(dead.request({ method: "eth_blockNumber" }));
});

test("past points always call the PAST client, use one aggregate and reject mismatched returned block numbers", async (t) => {
  let past = 0;
  t.mock.method(latestReads, "call", async () => {
    throw Error("past state reached LATEST");
  });
  t.mock.method(
    pastReads,
    "call",
    async (request: { blockNumber: bigint; data: `0x${string}` }) => {
      past++;
      assert.equal(request.blockNumber, burn.number);
      assert.equal(
        decodeFunctionData({ abi: aggregateAbi, data: request.data }).args[0]
          .length,
        7,
      );
      // ABI-shape failure must never return a fabricated point.
      return {
        data: encodeFunctionResult({
          abi: aggregateAbi,
          functionName: "aggregate3",
          result: [],
        }),
      };
    },
  );
  await assert.rejects(readSwapMeter(burn.number), /Incomplete aggregate/);
  assert.equal(past, 1);
});

test("catch-up overlaps five covered blocks and stays within 2000; failed past quotes do not fail the tape", async () => {
  assert.deepEqual(catchUpRange(100n, 102n), [96n, 102n]);
  assert.deepEqual(catchUpRange(100n, 9000n), [96n, 2095n]);
  const source: SwapSource = {
    latest: async () => 20000n,
    logs: async () => [
      {
        id: "s",
        block: 19999n,
        amount0: 1n,
        amount1: -1n,
        logIndex: 0,
        transaction: "0x12",
      },
    ],
    meter: async (b) => {
      if (b) throw Error("pool round");
      return point(20000n);
    },
    timestamp: async () => 1n,
  };
  const visit = createSwapVisit(source);
  await visit.poll();
  await tick();
  assert.equal(visit.getSnapshot().historyFailed, false);
  assert.equal(visit.getSnapshot().historyPending, true);
  assert.equal(visit.getSnapshot().initialSettled, true);
  assert.equal(visit.getSnapshot().swaps[0].impact, undefined);
  visit.dispose();
});

test("chart only exposes the specified loading and past-retry lines, keeps the live head on an empty settled series", () => {
  const props = {
    livePoints: [],
    history: [],
    live: point(10n),
    pending: true,
    historyPending: true,
    direction: 0,
    reduced: true,
  };
  const loading = renderToStaticMarkup(
    createElement(LiveSellChart, { ...props, initialSettled: false }),
  );
  assert.match(loading, /loading…/);
  assert.doesNotMatch(loading, /<polyline|Check your connection/);
  const settled = renderToStaticMarkup(
    createElement(LiveSellChart, { ...props, initialSettled: true }),
  );
  assert.match(settled, /<polyline/);
  assert.match(settled, /Past reads are unavailable\. Retrying…/);
  assert.doesNotMatch(settled, /Live reads are unavailable|loading…/);
});

test("LIVE first draw waits for all first attempts or eight seconds, while failed points remain incomplete", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let fail!: () => void;
  const rows = Array.from({ length: 40 }, (_, i) => ({
    id: `s${i}`,
    block: 19900n + BigInt(i),
    amount0: 1n,
    amount1: -1n,
    logIndex: 0,
    transaction: "0x12" as const,
  }));
  const source: SwapSource = {
    latest: async () => 20000n,
    logs: async () => rows,
    timestamp: async () => 1n,
    meter: async (b) => {
      if (b === 19900n)
        await new Promise<void>((_, reject) => {
          fail = () => reject(Error("round failed"));
        });
      return point(b ?? 20000n);
    },
  };
  const visit = createSwapVisit(source);
  await visit.poll();
  await tick();
  assert.equal(visit.getSnapshot().initialSettled, false);
  assert.equal(visit.getSnapshot().points.length, 39);
  t.mock.timers.tick(7999);
  await tick();
  assert.equal(visit.getSnapshot().initialSettled, false);
  t.mock.timers.tick(1);
  await tick();
  assert.equal(visit.getSnapshot().initialSettled, true);
  assert.equal(visit.getSnapshot().historyPending, true);
  fail();
  await tick();
  assert.equal(visit.getSnapshot().historyFailed, false);
  visit.dispose();
  const second = createSwapVisit(source);
  await second.poll();
  await tick();
  assert.equal(second.getSnapshot().initialSettled, false);
  fail();
  await tick();
  assert.equal(second.getSnapshot().initialSettled, true);
  assert.equal(second.getSnapshot().historyPending, true);
  second.dispose();
});

test("reload displays both cached series and receipt before any network response; a changed burn invalidates both", async () => {
  const store = storage(),
    cache = createChartCache(() => store);
  const p = point(burn.number);
  cache.setBurn(burn);
  cache.update({
    latest: burn.number + 1000n,
    readings: [p],
    swaps: [
      {
        id: `0x${"a".repeat(64)}:0`,
        block: p.block,
        logIndex: 0,
        transaction: `0x${"b".repeat(64)}`,
        amount0: 1n,
        amount1: -1n,
      },
    ],
    hours: [{ k: 0n, reading: p }],
  });
  const restored = createChartCache(() => store);
  const never = async (): Promise<never> => new Promise(() => {});
  const swaps = createSwapVisit(
    { latest: never, logs: never, meter: never, timestamp: never },
    Date.now,
    restored,
  );
  const hours = createHourHistory(
    { latest: never, burned: never, total: never, block: never, point: never },
    restored,
  );
  assert.equal(swaps.getSnapshot().points.length, 1);
  assert.equal(swaps.getSnapshot().initialSettled, true);
  assert.deepEqual(hours.getSnapshot().history?.paid, burn);
  assert.equal(hours.getSnapshot().history?.points.length, 1);
  restored.setBurn({ ...burn, number: burn.number + 1n });
  assert.equal(swaps.getSnapshot().points.length, 0);
  assert.equal(restored.get().hours.length, 0);
  swaps.dispose();
  hours.dispose();
});
