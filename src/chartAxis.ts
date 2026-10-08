export const ROUND_STEPS = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 25, 50] as const;

// Recompute ticks from the animated range too: labels never interpolate into
// fractional, arbitrary steps while the plotted line glides to its new range.
export function chartTicks([low, high]: readonly [number, number]) {
  const ideal = (high - low) / 4;
  const step = ROUND_STEPS.find((candidate) => candidate >= ideal) ?? 50;
  const first = Math.ceil(Math.max(0, low) / step);
  const last = Math.floor(high / step);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) =>
    Number(((first + i) * step).toFixed(2)),
  );
}
export const tickLabel = (value: number) =>
  `${value.toFixed(Number.isInteger(value * 10) ? 1 : 2)}%`;
