import { chartCache, type createChartCache } from "./chartCache";
import { createPastPoints, firstLoadGate, retryDelay } from "./pastPoints";
import { findBurnPaidBlock, type BurnSource } from "./burnHistory";
import { historySource } from "./paidReads";
import { readSwapMeter } from "./swapReads";
import {
  initialPaidState,
  type PaidBlock,
  type PaidState,
  type SellReading,
} from "./paid";
import { H0 } from "./watch";

import { hourGrid, estimatedBlock } from "./chartSampling";
export { hourGrid, estimatedBlock } from "./chartSampling";

export async function confirmBurn(burn: PaidBlock, source: BurnSource) {
  const [at, before, total] = await Promise.all([
    source.burned(burn.number),
    source.burned(burn.number - 1n),
    source.total(burn.number),
  ]);
  return at >= H0 && before < H0 && total === 0n;
}
export type HourSource = BurnSource & {
  latest: () => Promise<PaidBlock>;
  point: (block: bigint) => Promise<SellReading>;
};
export function createHourHistory(
  source: HourSource = { ...historySource, point: readSwapMeter },
  cache: ReturnType<typeof createChartCache> = chartCache,
) {
  const saved = cache.get();
  let state: PaidState = {
    ...initialPaidState,
    initialSettled: !!saved.hours.length,
    history: saved.burn
      ? { paid: saved.burn, points: saved.hours.map((h) => h.reading) }
      : undefined,
  };
  let burn = saved.burn,
    confirmed = false,
    running = false,
    failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let gate: ReturnType<typeof firstLoadGate> | undefined;
  const hours = new Map(saved.hours.map((h) => [h.k, h.reading]));
  const blocks = new Map(saved.hours.map((h) => [h.k, h.reading.block]));
  const requested = new Map<bigint, Promise<void>>();
  let grid = saved.hours.map((h) => h.k);
  const listeners = new Set<(s: PaidState) => void>();
  const publish = () => listeners.forEach((l) => l(state));
  const update = () => {
    const points = grid
      .flatMap((k) => (hours.has(k) ? [hours.get(k)!] : []))
      .sort((a, b) => (a.block < b.block ? -1 : 1));
    const complete =
      confirmed && grid.length > 0 && grid.every((k) => hours.has(k));
    state = {
      ...state,
      history: burn ? { paid: burn, points } : undefined,
      historyPending: !complete,
      historyFailed: !complete && !!state.initialSettled,
    };
    cache.update({
      hours: grid.flatMap((k) =>
        hours.has(k) ? [{ k, reading: hours.get(k)! }] : [],
      ),
    });
    publish();
  };
  const loader = createPastPoints(source.point);
  async function refresh() {
    if (running) return;
    running = true;
    gate ??= firstLoadGate(() => {
      state = { ...state, initialSettled: true };
      update();
    });
    try {
      // Cached receipt and both series are already available before confirmation.
      if (burn && !confirmed) {
        if (await confirmBurn(burn, source)) confirmed = true;
        else {
          burn = undefined;
          cache.clear();
          hours.clear();
          blocks.clear();
          requested.clear();
          grid = [];
          loader.retain([]);
          update();
        }
      }
      const latest = await source.latest();
      cache.update({ latest: latest.number });
      if (!burn) {
        burn = await findBurnPaidBlock(latest, source);
        if (!burn) throw Error("Burn unavailable");
        confirmed = true;
        cache.setBurn(burn);
        update();
      }
      grid = hourGrid(burn.timestamp, latest.timestamp);
      for (const k of blocks.keys())
        if (!grid.includes(k)) {
          hours.delete(k);
          blocks.delete(k);
          requested.delete(k);
        }
      update();
      const first: Promise<void>[] = [];
      for (const k of grid) {
        if (hours.has(k)) continue;
        if (!blocks.has(k)) blocks.set(k, estimatedBlock(k, burn, latest));
        if (!requested.has(k))
          requested.set(
            k,
            loader.request(blocks.get(k)!, (point) => {
              hours.set(k, point);
              update();
            }),
          );
        first.push(requested.get(k)!);
      }
      loader.retain([...blocks.values()]);
      void Promise.all(first).then(() => gate?.settle());
      failures = 0;
      // Next fixed grid hour, including missed/misaligned browser wakeups.
      const next = Number(
        burn.timestamp +
          ((latest.timestamp - burn.timestamp) / 3600n + 1n) * 3600n,
      );
      timer = setTimeout(
        refresh,
        Math.max(
          1000,
          Math.min(60_000, (next - Number(latest.timestamp)) * 1000),
        ),
      );
    } catch {
      state = { ...state, historyFailed: true };
      publish();
      timer = setTimeout(refresh, retryDelay(++failures));
    } finally {
      running = false;
      timer?.unref?.();
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: (s: PaidState) => void) {
      listeners.add(listener);
      listener(state);
      if (!timer) void refresh();
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    dispose() {
      clearTimeout(timer);
      gate?.cancel();
      loader.dispose();
      listeners.clear();
    },
  };
}
