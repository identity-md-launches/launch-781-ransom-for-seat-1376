import { sellPercentage, type SellPoint } from "./paid";
import { chartRange } from "./swapTape";

export type Dot = { block: bigint; x: number; value: number };
export type ChartFrame = {
  dots: Dot[];
  range: [number, number];
  reveal: number;
};
export function chartTarget(
  points: readonly SellPoint[],
  left: number,
  right: number,
  mode: string,
): ChartFrame {
  const sorted = [...points].sort((a, b) =>
    a.block < b.block ? -1 : a.block > b.block ? 1 : 0,
  );
  const start = Number(sorted[0]?.timestamp ?? 0n),
    end = Number(sorted.at(-1)?.timestamp ?? 0n);
  const dots = sorted.map((p, i) => ({
    block: p.block,
    value: sellPercentage(p.out),
    x:
      sorted.length === 1
        ? right
        : left +
          (right - left) *
            (mode === "live"
              ? i / (sorted.length - 1)
              : (Number(p.timestamp) - start) / Math.max(1, end - start)),
  }));
  return {
    dots,
    range: chartRange(sorted.map((p) => sellPercentage(p.out))),
    reveal: 1,
  };
}
export function chartTransition(
  from: ChartFrame,
  target: ChartFrame,
  left: number,
  right: number,
) {
  const old = new Map(from.dots.map((p) => [p.block, p]));
  const ordered = [...from.dots].sort((a, b) => (a.block < b.block ? -1 : 1));
  const next = new Set(target.dots.map((p) => p.block));
  const step = (right - left) / Math.max(1, target.dots.length - 1);
  const targets = [
    ...from.dots
      .filter((p) => !next.has(p.block))
      .map((p) => ({ ...p, x: left - step })),
    ...target.dots,
  ];
  const starts = targets.map((p) => {
    const existing = old.get(p.block);
    if (existing) return existing;
    const before = ordered.filter((q) => q.block < p.block).at(-1);
    const after = ordered.find((q) => q.block > p.block);
    if (!before) return { ...p, x: left, value: ordered[0]?.value ?? p.value };
    if (!after)
      return { ...p, x: Math.max(right + step, before.x), value: before.value };
    return {
      ...p,
      x: (before.x + after.x) / 2,
      value: (before.value + after.value) / 2,
    };
  });
  return (progress: number): ChartFrame => {
    if (progress >= 1) return target;
    const ease = 1 - (1 - progress) ** 3;
    return {
      range: [
        from.range[0] + (target.range[0] - from.range[0]) * ease,
        from.range[1] + (target.range[1] - from.range[1]) * ease,
      ],
      reveal: from.reveal,
      // Sorting is also necessary for an interrupted transition or a middle point
      // leaving when the hourly stride changes. Identity stays attached to the dot.
      dots: targets
        .map((p, i) => ({
          ...p,
          x: starts[i].x + (p.x - starts[i].x) * ease,
          value: starts[i].value + (p.value - starts[i].value) * ease,
        }))
        .sort((a, b) => a.x - b.x),
    };
  };
}
