import { useEffect, useRef, useState } from "react";
import {
  marketDollars,
  paidTime,
  sellPercentage,
  type SellPoint,
} from "./paid";

export function SellChart({
  points,
  pending,
}: {
  points: readonly SellPoint[];
  pending: boolean;
}) {
  const container = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(700);
  const [selected, setSelected] = useState<number>();
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(180, entry.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const active = Math.min(selected ?? points.length - 1, points.length - 1);
  const point = points[active];
  const detail = (item: SellPoint) =>
    `${paidTime(item.timestamp)} · ${sellPercentage(item.out).toFixed(1)}% · market cap $${marketDollars(item.marketCap)}`;
  const left = 46,
    right = width - 8,
    top = 18,
    bottom = 186;
  const start = Number(points[0]?.timestamp ?? 0n),
    end = Number(points.at(-1)?.timestamp ?? 0n);
  const ceiling = Math.max(
    125,
    Math.ceil(
      Math.max(0, ...points.map((item) => sellPercentage(item.out))) / 25,
    ) * 25,
  );
  const x = (item: SellPoint) =>
    start === end
      ? right
      : left +
        ((Number(item.timestamp) - start) / (end - start)) * (right - left);
  const y = (value: number) => bottom - (value / ceiling) * (bottom - top);
  const selectAt = (clientX: number, element: SVGSVGElement) => {
    const box = element.getBoundingClientRect();
    const position = ((clientX - box.left) * width) / box.width;
    let nearest = 0;
    points.forEach((item, index) => {
      if (
        Math.abs(x(item) - position) < Math.abs(x(points[nearest]) - position)
      )
        nearest = index;
    });
    setSelected(nearest);
  };
  return (
    <figure ref={container} className="sell-chart" aria-busy={pending}>
      {points.length ? (
        <>
          <svg
            viewBox={`0 0 ${width} 234`}
            role="slider"
            tabIndex={0}
            aria-label="CHART"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={points.length - 1}
            aria-valuenow={active}
            aria-valuetext={detail(point)}
            onPointerMove={(event) =>
              selectAt(event.clientX, event.currentTarget)
            }
            onPointerDown={(event) =>
              selectAt(event.clientX, event.currentTarget)
            }
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") setSelected(undefined);
            }}
            onKeyDown={(event) => {
              let next = active;
              if (event.key === "ArrowLeft" || event.key === "ArrowDown")
                next--;
              else if (event.key === "ArrowRight" || event.key === "ArrowUp")
                next++;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = points.length - 1;
              else return;
              event.preventDefault();
              setSelected(Math.max(0, Math.min(points.length - 1, next)));
            }}
          >
            {[0, 100, ceiling].map((value) => (
              <g key={value}>
                <text x={left - 8} y={y(value) + 4} textAnchor="end">
                  {value}%
                </text>
                <line
                  className={value === 100 ? "chart-threshold" : "chart-axis"}
                  x1={left}
                  x2={right}
                  y1={y(value)}
                  y2={y(value)}
                />
              </g>
            ))}
            <polyline
              className="chart-line"
              points={points
                .map((item) => `${x(item)},${y(sellPercentage(item.out))}`)
                .join(" ")}
            />
            <circle
              className="chart-point"
              cx={x(point)}
              cy={y(sellPercentage(point.out))}
              r={4}
            />
            {[points[0], ...(points.length > 1 ? [points.at(-1)!] : [])].map(
              (item, i) => {
                const date = new Date(
                  Number(item.timestamp) * 1000,
                ).toISOString();
                return (
                  <text
                    key={i}
                    x={i ? right : left}
                    y={bottom + 22}
                    textAnchor={i ? "end" : "start"}
                  >
                    <tspan x={i ? right : left}>{date.slice(0, 10)}</tspan>
                    <tspan x={i ? right : left} dy={16}>
                      {date.slice(11, 16)} UTC
                    </tspan>
                  </text>
                );
              },
            )}
          </svg>
          <figcaption className="label chart-detail">
            {detail(point)}
          </figcaption>
        </>
      ) : (
        <p className="label">—</p>
      )}
    </figure>
  );
}
