import { useEffect, useRef, useState } from "react";
import type { SellPoint } from "./paid";
import { chartTarget, chartTransition, type ChartFrame } from "./chartMotion";

export function useChartFrame(
  points: readonly SellPoint[],
  left: number,
  right: number,
  reduced: boolean,
  mode: string,
  ready: boolean,
) {
  const [frame, setFrame] = useState<ChartFrame>({
    dots: [],
    range: [0, 0.6],
    reveal: 0,
  });
  const current = useRef(frame),
    lastMode = useRef(mode),
    edges = useRef({ left, right });
  const revealBegan = useRef<number | undefined>(undefined);
  const key = points.map((p) => `${p.block}:${p.timestamp}:${p.out}`).join(",");
  useEffect(() => {
    const target = chartTarget(ready ? points : [], left, right, mode);
    const from = current.current;
    const entrance =
      mode !== lastMode.current ||
      (!from.dots.length && target.dots.length > 0);
    const resized =
      edges.current.left !== left || edges.current.right !== right;
    lastMode.current = mode;
    edges.current = { left, right };
    const commit = (value: ChartFrame) => {
      current.current = value;
      setFrame(value);
    };
    if (reduced || !ready || !target.dots.length) {
      revealBegan.current = undefined;
      commit(target);
      return;
    }
    if (entrance) revealBegan.current = performance.now();
    if (resized && !entrance && revealBegan.current === undefined) {
      commit(target);
      return;
    }
    const began = performance.now();
    const transition = chartTransition(from, target, left, right);
    const next = (time: number) => {
      const reveal =
        revealBegan.current === undefined
          ? 1
          : Math.min(1, (time - revealBegan.current) / 900);
      const progress = Math.min(1, (time - began) / 850);
      // Incoming data during the first stroke must not restart that stroke.
      const value = entrance || reveal < 1 ? target : transition(progress);
      commit({ ...value, reveal });
      if (reveal === 1) revealBegan.current = undefined;
      if (reveal < 1 || (!entrance && progress < 1))
        id = requestAnimationFrame(next);
    };
    commit(entrance ? { ...target, reveal: 0 } : from);
    let id = requestAnimationFrame(next);
    return () => cancelAnimationFrame(id);
    // Point signatures exclude unrelated block/age renders.
  }, [key, left, right, reduced, mode, ready]);
  return frame;
}
