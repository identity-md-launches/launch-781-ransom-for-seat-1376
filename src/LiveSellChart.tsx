import { useEffect, useId, useRef, useState } from "react";
import {
  marketDollars,
  paidTime,
  sellPercentage,
  type SellPoint,
  type SellReading,
} from "./paid";
import { chartRange } from "./swapTape";
import { chartTicks, tickLabel } from "./chartAxis";

type Dot = { block: bigint; x: number; value: number };
type Frame = { dots: Dot[]; range: [number, number] };
function useChartFrame(
  points: readonly SellPoint[],
  left: number,
  right: number,
  reduced: boolean,
  mode: string,
) {
  const [frame, setFrame] = useState<Frame>({
    dots: [],
    range: chartRange([]),
  });
  const current = useRef(frame),
    lastMode = useRef(mode);
  const edges = useRef({ left, right });
  const key = points.map((p) => `${p.block}:${p.out}`).join(",");
  useEffect(() => {
    const range = chartRange(points.map((p) => sellPercentage(p.out)));
    const start = Number(points[0]?.timestamp ?? 0n),
      end = Number(points.at(-1)?.timestamp ?? 0n);
    const dots = points.map((p, i) => ({
      block: p.block,
      value: sellPercentage(p.out),
      x:
        points.length === 1
          ? right
          : left +
            (right - left) *
              (mode === "live"
                ? i / (points.length - 1)
                : (Number(p.timestamp) - start) / Math.max(1, end - start)),
    }));
    const target: Frame = { dots, range };
    const from = current.current;
    const snap =
      reduced ||
      !from.dots.length ||
      mode !== lastMode.current ||
      edges.current.right !== right;
    edges.current = { left, right };
    lastMode.current = mode;
    if (snap) {
      current.current = target;
      setFrame(target);
      return;
    }
    const step = (right - left) / Math.max(1, dots.length - 1);
    const old = new Map(from.dots.map((p) => [p.block, p]));
    const next = new Set(dots.map((p) => p.block));
    const exiting =
      mode === "live"
        ? from.dots
            .filter((p) => !next.has(p.block))
            .map((p) => ({ ...p, x: left - step }))
        : [];
    const targets = [...exiting, ...dots];
    const starts = targets.map(
      (p) =>
        old.get(p.block) ?? {
          ...p,
          x: right + step,
          value: from.dots.at(-1)!.value,
        },
    );
    let id = 0,
      began: number | undefined;
    const animate = (time: number) => {
      began ??= time;
      const t = Math.min(1, (time - began) / 850),
        ease = 1 - (1 - t) ** 3;
      const value: Frame = {
        range: [
          from.range[0] + (range[0] - from.range[0]) * ease,
          from.range[1] + (range[1] - from.range[1]) * ease,
        ],
        dots: targets.map((p, i) => ({
          ...p,
          x: starts[i].x + (p.x - starts[i].x) * ease,
          value: starts[i].value + (p.value - starts[i].value) * ease,
        })),
      };
      current.current = t === 1 ? target : value;
      setFrame(current.current);
      if (t < 1) id = requestAnimationFrame(animate);
    };
    id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
    // Data signature prevents unrelated block/age updates from restarting motion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, left, right, reduced, mode]);
  return frame;
}

export function LiveSellChart({
  livePoints,
  history,
  live,
  pending,
  historyPending,
  failed,
  direction,
  reduced,
}: {
  livePoints: readonly SellPoint[];
  history: readonly SellPoint[];
  live?: SellReading;
  pending: boolean;
  historyPending: boolean;
  failed: boolean;
  direction: number;
  reduced: boolean;
}) {
  const [mode, setMode] = useState<"live" | "burn">("live");
  const [selected, setSelected] = useState<number>();
  const [width, setWidth] = useState(680);
  const container = useRef<HTMLElement>(null);
  const id = useId().replaceAll(":", "");
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(220, entry.contentRect.width)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const points = mode === "live" ? livePoints : history;
  const labelWidth =
    Math.max(
      ...chartRange(points.map((p) => sellPercentage(p.out))).map(
        (value) => `${value.toFixed(1)}%`.length,
      ),
    ) *
      7 +
    8;
  const left = Math.max(46, labelWidth),
    right = width - 76,
    top = 48,
    bottom = 230;
  const frame = useChartFrame(points, left, right, reduced, mode);
  const y = (value: number) =>
    bottom -
    ((value - frame.range[0]) / (frame.range[1] - frame.range[0])) *
      (bottom - top);
  const line = frame.dots.map((p) => `${p.x},${y(p.value)}`).join(" ");
  const head = frame.dots.at(-1);
  const current = live ? sellPercentage(live.out) : head?.value;
  const active = Math.max(
    0,
    Math.min(selected ?? points.length - 1, points.length - 1),
  );
  const point = points[active];
  const detail = (p: SellPoint) =>
    `${paidTime(p.timestamp)} · ${sellPercentage(p.out).toFixed(2)}% · market cap $${marketDollars(p.marketCap)}`;
  const selectAt = (clientX: number, element: SVGSVGElement) => {
    const box = element.getBoundingClientRect(),
      x = ((clientX - box.left) * width) / box.width;
    let best = 0;
    const data = frame.dots.filter((p) =>
      points.some((q) => q.block === p.block),
    );
    data.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(data[best].x - x)) best = i;
    });
    setSelected(best);
  };
  const lastMove =
    direction ||
    (points.length > 1
      ? sellPercentage(points.at(-1)!.out) - sellPercentage(points.at(-2)!.out)
      : 0);
  const arrow = lastMove < 0 ? "is-down" : "is-up";
  return (
    <section
      className="paid-section live-chart-section"
      aria-labelledby="sell-chart-title"
    >
      <div className="live-section-heading">
        <h2 className="label" id="sell-chart-title">
          CHART
        </h2>
        <div className="live-chart-switch" role="group" aria-label="CHART">
          <button
            type="button"
            aria-pressed={mode === "live"}
            onClick={() => {
              setMode("live");
              setSelected(undefined);
            }}
          >
            LIVE
          </button>
          <button
            type="button"
            aria-pressed={mode === "burn"}
            onClick={() => {
              setMode("burn");
              setSelected(undefined);
            }}
          >
            SINCE THE BURN
          </button>
        </div>
      </div>
      <figure
        ref={container}
        className="live-chart"
        aria-busy={mode === "live" ? pending : historyPending}
      >
        {points.length > 0 ? (
          <>
            {frame.range[1] < 100 && (
              <p className="live-threshold-note label">
                ↑ 100% = 8.67 ETH ·{" "}
                {current && current > 0 ? (100 / current).toFixed(1) : "∞"}×
                above
              </p>
            )}
            <svg
              viewBox={`0 0 ${width} 262`}
              role="slider"
              tabIndex={0}
              aria-label="CHART"
              aria-orientation="horizontal"
              aria-valuemin={0}
              aria-valuemax={Math.max(0, points.length - 1)}
              aria-valuenow={active}
              aria-valuetext={point && detail(point)}
              onPointerMove={(e) => selectAt(e.clientX, e.currentTarget)}
              onPointerDown={(e) => selectAt(e.clientX, e.currentTarget)}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") setSelected(undefined);
              }}
              onKeyDown={(e) => {
                let next = active;
                if (e.key === "ArrowLeft" || e.key === "ArrowDown") next--;
                else if (e.key === "ArrowRight" || e.key === "ArrowUp") next++;
                else if (e.key === "Home") next = 0;
                else if (e.key === "End") next = points.length - 1;
                else return;
                e.preventDefault();
                setSelected(Math.max(0, Math.min(points.length - 1, next)));
              }}
            >
              <defs>
                <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity=".3" />
                  <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
                </linearGradient>
                <clipPath id={`${id}-clip`}>
                  <rect
                    x={left}
                    y={top - 12}
                    width={right - left}
                    height={bottom - top + 24}
                  />
                </clipPath>
              </defs>
              {chartTicks(frame.range).map((value) => {
                return (
                  <g key={value} className="live-chart-grid">
                    <text x={left - 8} y={y(value) + 4} textAnchor="end">
                      {tickLabel(value)}
                    </text>
                    <line x1={left} x2={right} y1={y(value)} y2={y(value)} />
                  </g>
                );
              })}
              {frame.range[1] >= 100 && frame.range[0] <= 100 && (
                <g className="live-chart-threshold">
                  <line x1={left} x2={right} y1={y(100)} y2={y(100)} />
                  <text x={right} y={y(100) - 8} textAnchor="end">
                    100%
                  </text>
                </g>
              )}
              <g clipPath={`url(#${id}-clip)`}>
                {head && (
                  <polygon
                    points={`${frame.dots[0].x},${bottom} ${line} ${head.x},${bottom}`}
                    fill={`url(#${id}-area)`}
                  />
                )}
                <polyline points={line} className="live-chart-line" />
              </g>
              {head && (
                <g className={`live-chart-head ${arrow}`}>
                  <circle
                    className="live-head-ring"
                    cx={head.x}
                    cy={y(head.value)}
                    r="10"
                  />
                  <circle cx={head.x} cy={y(head.value)} r="4" />
                </g>
              )}
              {selected !== undefined &&
                point &&
                (() => {
                  const dot = frame.dots.find((p) => p.block === point.block);
                  return dot ? (
                    <g className="live-chart-selected">
                      <line x1={dot.x} x2={dot.x} y1={top} y2={bottom} />
                      <circle cx={dot.x} cy={y(dot.value)} r="4" />
                    </g>
                  ) : null;
                })()}
              {current !== undefined && (
                <g
                  className="live-value-tag"
                  transform={`translate(${right + 7},${Math.max(top, Math.min(bottom, y(current))) - 13})`}
                >
                  <path d="M0 13L6 0H66V26H6Z" />
                  <text x="36" y="17" textAnchor="middle">
                    {current.toFixed(2)}%
                  </text>
                </g>
              )}
            </svg>
            <div className="live-chart-captions label">
              <span>
                {mode === "live"
                  ? "the last 40 blocks with a swap"
                  : "15:43 UTC 7 Oct · the burn"}
              </span>
              <span>now</span>
            </div>
            {mode === "burn" && point && (
              <figcaption className="label live-chart-detail">
                {detail(point)}
              </figcaption>
            )}
          </>
        ) : (
          <p className="live-chart-empty label">—</p>
        )}
      </figure>
      {failed && (
        <p className="label">
          Live reads are unavailable. Check your connection and retry; previous
          values may be out of date.
        </p>
      )}
    </section>
  );
}
