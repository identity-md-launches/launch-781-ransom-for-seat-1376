import type { Hex } from "viem";
import {
  maySell,
  sellPercentage,
  type SellPoint,
  type SellReading,
} from "./paid";

export type PoolSwap = {
  id: string;
  block: bigint;
  logIndex: number;
  transaction: Hex;
  amount0: bigint;
  amount1: bigint;
  timestamp?: bigint;
  fresh?: boolean;
  impact?: number;
};
export const swapSide = (swap: Pick<PoolSwap, "amount0">) =>
  swap.amount0 < 0n ? "BUY" : "SELL";
export const abs = (value: bigint) => (value < 0n ? -value : value);
// The hook takes 2% on the ETH side outside the pool's Swap delta.
export const traderEth = (swap: Pick<PoolSwap, "amount0">) =>
  swap.amount0 < 0n
    ? (abs(swap.amount0) * 100n) / 98n
    : (swap.amount0 * 98n) / 100n;
export const swapOrder = (a: PoolSwap, b: PoolSwap) =>
  a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1;
export const pointsToGo = (percentage?: number) =>
  percentage === undefined
    ? "—"
    : percentage >= 100
      ? "UNLOCKED"
      : `${percentage > 0 ? (100 / percentage).toFixed(1) : "∞"}× to go`;
export const pointChange = (value: number) => {
  const magnitude = Math.abs(value).toFixed(2);
  return `${magnitude === "0.00" ? "" : value < 0 ? "−" : "+"}${magnitude}%`;
};
export function swapAge(timestamp: bigint | undefined, now: number) {
  if (timestamp === undefined) return "—";
  const seconds = Math.max(0, Math.floor(now / 1000) - Number(timestamp));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
export function chartRange(values: readonly number[]): [number, number] {
  const valid = values.filter(Number.isFinite);
  const low = valid.length ? Math.min(...valid) : 0;
  const high = valid.length ? Math.max(...valid) : 0;
  const span = Math.max(0.8, high - low);
  const center = (high + low) / 2;
  return [
    Math.max(0, center - span * 0.75),
    Math.max(0.6, center + span * 0.75),
  ];
}
export function mergePoints(
  points: readonly SellPoint[],
  incoming: readonly SellPoint[],
) {
  return [
    ...new Map([...points, ...incoming].map((p) => [p.block, p])).values(),
  ]
    .sort((a, b) => (a.block < b.block ? -1 : a.block > b.block ? 1 : 0))
    .slice(-40);
}
export function assignImpacts(
  swaps: readonly PoolSwap[],
  readings: ReadonlyMap<bigint, SellPoint>,
) {
  const sorted = [...new Map(swaps.map((s) => [s.id, s])).values()].sort(
    swapOrder,
  );
  const blocks = [...new Set(sorted.map((s) => s.block))];
  const impacts = new Map<bigint, number | undefined>();
  blocks.forEach((block, i) => {
    const before = [...readings.values()]
      .filter((p) => p.block < block && (i === 0 || p.block >= blocks[i - 1]))
      .sort((a, b) => (a.block < b.block ? -1 : 1))
      .at(-1);
    const after = readings.get(block);
    impacts.set(
      block,
      before && after
        ? sellPercentage(after.out) - sellPercentage(before.out)
        : undefined,
    );
  });
  return sorted
    .map((swap, i) => ({
      ...swap,
      timestamp: swap.timestamp ?? readings.get(swap.block)?.timestamp,
      impact: sorted[i + 1]?.block === swap.block ? 0 : impacts.get(swap.block),
    }))
    .reverse()
    .slice(0, 7);
}
export type Crossing = { previous?: bigint; fired: boolean };
export function observeCrossing(
  state: Crossing,
  reading: SellReading,
): [Crossing, boolean] {
  const crossed =
    !state.fired &&
    state.previous !== undefined &&
    !maySell(state.previous) &&
    maySell(reading.out);
  return [{ previous: reading.out, fired: state.fired || crossed }, crossed];
}
