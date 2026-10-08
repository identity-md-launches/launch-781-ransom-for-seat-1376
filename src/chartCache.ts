import type { PaidBlock, SellReading } from "./paid";
import { PAID_START, sellAmount } from "./paid";
import type { PoolSwap } from "./swapTape";

export const CHART_CACHE_KEY = "free1376:chart:v1";
export type ChartCache = {
  burn?: PaidBlock;
  latest: bigint;
  swaps: PoolSwap[];
  readings: SellReading[];
  baseline?: SellReading;
  hours: { k: bigint; reading: SellReading }[];
};
const empty = (): ChartCache => ({
  latest: 0n,
  swaps: [],
  readings: [],
  hours: [],
});
const decimal = (s: unknown): bigint => {
  if (typeof s !== "string" || !/^(0|[1-9]\d{0,79})$/.test(s))
    throw Error("Invalid decimal");
  return BigInt(s);
};
const reading = (v: Record<string, unknown>): SellReading => {
  const result = {
    block: decimal(v.block),
    timestamp: decimal(v.timestamp),
    out: decimal(v.out),
    balance: decimal(v.balance),
    amount: decimal(v.amount),
    marketCap: Number(v.marketCap),
  };
  if (
    typeof v.marketCap !== "string" ||
    !/^\d+(\.\d+)?(e[+-]?\d+)?$/i.test(v.marketCap) ||
    !Number.isFinite(result.marketCap) ||
    result.marketCap < 0 ||
    result.timestamp <= 0n ||
    result.amount !== sellAmount(result.balance)
  )
    throw Error("Invalid reading");
  return result;
};
export function decodeChartCache(text: string, burn?: PaidBlock): ChartCache {
  if (text.length > 250_000) throw Error("Oversized cache");
  const v = JSON.parse(text);
  if (v.version !== 1 || v.chain !== "1" || !v.burn)
    throw Error("Foreign cache");
  const savedBurn = {
    number: decimal(v.burn.number),
    timestamp: decimal(v.burn.timestamp),
  };
  if (
    savedBurn.number < PAID_START ||
    savedBurn.timestamp <= 0n ||
    (burn &&
      (burn.number !== savedBurn.number ||
        burn.timestamp !== savedBurn.timestamp))
  )
    throw Error("Different burn");
  const latest = decimal(v.latest);
  if (
    latest < savedBurn.number + 64n ||
    !Array.isArray(v.readings) ||
    v.readings.length > 40 ||
    !Array.isArray(v.hours) ||
    v.hours.length > 47 ||
    !Array.isArray(v.swaps) ||
    v.swaps.length > 4000
  )
    throw Error("Invalid cache size/finality");
  const readings = v.readings.map(reading) as SellReading[];
  const baseline = v.baseline ? reading(v.baseline) : undefined;
  const hours = v.hours.map(
    (h: { k: unknown; reading: Record<string, unknown> }) => ({
      k: decimal(h.k),
      reading: reading(h.reading),
    }),
  ) as ChartCache["hours"];
  const blocks = new Set(readings.map((r) => r.block));
  if (
    blocks.size !== readings.length ||
    new Set(hours.map((h) => h.k)).size !== hours.length ||
    [
      ...readings,
      ...hours.map((h) => h.reading),
      ...(baseline ? [baseline] : []),
    ].some((p) => p.block > latest - 64n) ||
    hours.some(
      (h) =>
        h.reading.block < savedBurn.number ||
        h.k > (h.reading.timestamp - savedBurn.timestamp) / 3600n + 1n,
    )
  )
    throw Error("Invalid cached points");
  const swaps: PoolSwap[] = v.swaps.map((s: Record<string, unknown>) => {
    if (
      typeof s.id !== "string" ||
      !/^0x[\da-f]{64}:\d+$/i.test(s.id) ||
      typeof s.transaction !== "string" ||
      !/^0x[\da-f]{64}$/i.test(s.transaction) ||
      typeof s.logIndex !== "string" ||
      !/^\d+$/.test(s.logIndex) ||
      typeof s.amount0 !== "string" ||
      !/^-?\d+$/.test(s.amount0) ||
      typeof s.amount1 !== "string" ||
      !/^-?\d+$/.test(s.amount1)
    )
      throw Error("Invalid swap");
    const block = decimal(s.block);
    if (!blocks.has(block)) throw Error("Unfinalized swap");
    return {
      id: s.id,
      transaction: s.transaction as `0x${string}`,
      block,
      logIndex: Number(s.logIndex),
      amount0: BigInt(s.amount0),
      amount1: BigInt(s.amount1),
      timestamp: readings.find((r) => r.block === block)!.timestamp,
    };
  });
  if (
    new Set(swaps.map((s) => s.id)).size !== swaps.length ||
    readings.some((r) => !swaps.some((s) => s.block === r.block))
  )
    throw Error("Invalid swap membership");
  return { burn: savedBurn, latest, readings, baseline, hours, swaps };
}

export function createChartCache(
  storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem"> = () =>
    localStorage,
) {
  let state: ChartCache | undefined;
  const resets = new Set<() => void>();
  const get = () => {
    if (!state) {
      state = empty();
      try {
        const saved = storage().getItem(CHART_CACHE_KEY);
        if (saved) state = decodeChartCache(saved);
      } catch {
        /* Private mode, eviction or malformed data: start empty. */
      }
    }
    return state;
  };
  const save = () => {
    const v = get();
    if (!v.burn || v.latest < v.burn.number + 64n) return;
    const final = (p: SellReading) => p.block <= v.latest - 64n;
    const readings = v.readings.filter(final).slice(-40);
    try {
      storage().setItem(
        CHART_CACHE_KEY,
        JSON.stringify(
          {
            version: 1,
            chain: "1",
            burn: v.burn,
            latest: v.latest,
            readings: readings.map((r) => ({
              ...r,
              marketCap: String(r.marketCap),
            })),
            baseline:
              v.baseline && final(v.baseline)
                ? { ...v.baseline, marketCap: String(v.baseline.marketCap) }
                : undefined,
            hours: v.hours
              .filter((h) => final(h.reading))
              .map((h) => ({
                k: h.k,
                reading: {
                  ...h.reading,
                  marketCap: String(h.reading.marketCap),
                },
              })),
            swaps: v.swaps
              .filter((s) => readings.some((r) => r.block === s.block))
              .slice(-4000)
              .map((s) => ({
                id: s.id,
                block: s.block,
                transaction: s.transaction,
                logIndex: String(s.logIndex),
                amount0: s.amount0,
                amount1: s.amount1,
              })),
          },
          (_, value) => (typeof value === "bigint" ? value.toString() : value),
        ),
      );
    } catch {
      /* Storage is optional; never interrupt display reads. */
    }
  };
  return {
    get,
    update(patch: Partial<ChartCache>) {
      state = { ...get(), ...patch };
      save();
    },
    setBurn(burn: PaidBlock) {
      const old = get().burn;
      if (
        old &&
        (old.number !== burn.number || old.timestamp !== burn.timestamp)
      ) {
        state = empty();
        resets.forEach((reset) => reset());
      }
      state = { ...get(), burn };
      save();
    },
    onReset(reset: () => void) {
      resets.add(reset);
      return () => {
        resets.delete(reset);
      };
    },
    clear() {
      state = empty();
      try {
        storage().removeItem(CHART_CACHE_KEY);
      } catch {
        /* optional */
      }
      resets.forEach((reset) => reset());
    },
  };
}
export const chartCache = createChartCache();
