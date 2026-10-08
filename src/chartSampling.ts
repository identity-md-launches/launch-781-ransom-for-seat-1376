import type { PaidBlock } from "./paid";

export function hourGrid(burn: bigint, latest: bigint) {
  const last = latest > burn ? (latest - burn) / 3600n : 0n;
  const stride = last / 47n + 1n;
  const grid: bigint[] = [];
  for (let k = 0n; k <= last; k += stride) grid.push(k);
  return grid;
}
export function estimatedBlock(k: bigint, burn: PaidBlock, latest: PaidBlock) {
  if (latest.timestamp <= burn.timestamp) return burn.number;
  return (
    burn.number +
    ((latest.number - burn.number) * k * 3600n) /
      (latest.timestamp - burn.timestamp)
  );
}
