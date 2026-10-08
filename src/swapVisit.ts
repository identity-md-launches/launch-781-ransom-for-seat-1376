import { sellPercentage, type SellReading } from "./paid";
import {
  assignImpacts,
  mergePoints,
  observeCrossing,
  swapOrder,
  type Crossing,
  type PoolSwap,
} from "./swapTape";
import { swapSource, type SwapSource } from "./swapReads";
import { chartCache, type createChartCache } from "./chartCache";
import { createPastPoints, firstLoadGate } from "./pastPoints";
import { BURIAL_START } from "./burial";

export type SwapState = {
  block?: bigint;
  live?: SellReading;
  points: import("./paid").SellPoint[];
  swaps: PoolSwap[];
  failed: boolean;
  historyPending: boolean;
  historyFailed: boolean;
  initialSettled?: boolean;
  change: number;
  capChange: number;
  revision: number;
  burst: number;
};
export function catchUpRange(cursor: bigint, latest: bigint): [bigint, bigint] {
  const from = cursor >= 4n ? cursor - 4n : 0n;
  return [from, from + 1999n < latest ? from + 1999n : latest];
}
export function createSwapVisit(
  source: SwapSource = swapSource,
  now = Date.now,
  cache: ReturnType<typeof createChartCache> | undefined = source === swapSource
    ? chartCache
    : undefined,
) {
  const saved = cache?.get();
  let swaps = [...(saved?.swaps ?? [])];
  const readings = new Map((saved?.readings ?? []).map((r) => [r.block, r]));
  if (saved?.baseline) readings.set(saved.baseline.block, saved.baseline);
  let state: SwapState = {
    points: saved?.readings ?? [],
    swaps: assignImpacts(swaps, readings),
    failed: false,
    historyPending: true,
    historyFailed: false,
    initialSettled: !!saved?.readings.length,
    change: 0,
    capChange: 0,
    revision: 0,
    burst: 0,
  };
  const listeners = new Set<() => void>();
  let cursor: bigint | undefined,
    started = false,
    polling = false,
    marketPending = false;
  let lastMeter = -Infinity,
    wantsMeter = false;
  let crossing: Crossing = { fired: false };
  let startupRetryAt = -Infinity,
    catchupRetryAt = -Infinity;
  let startupFailed = false,
    catchupFailed = false,
    logsLoaded = false;
  let gate: ReturnType<typeof firstLoadGate> | undefined;
  const update = (patch: Partial<SwapState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const blockList = () =>
    [...new Set(swaps.map((s) => s.block))]
      .sort((a, b) => (a < b ? -1 : 1))
      .slice(-40);
  const refresh = () => {
    const blocks = blockList();
    const baseline =
      blocks.length && blocks[0] > 0n ? blocks[0] - 1n : undefined;
    swaps = swaps.filter((s) => blocks.includes(s.block));
    update({
      swaps: assignImpacts(swaps, readings),
      points: mergePoints(
        [],
        blocks.flatMap((b) => (readings.has(b) ? [readings.get(b)!] : [])),
      ),
      historyPending:
        !logsLoaded ||
        blocks.some((b) => !readings.has(b)) ||
        (baseline !== undefined && !readings.has(baseline)),
      historyFailed: startupFailed || catchupFailed,
    });
    cache?.update({
      latest: state.block ?? saved?.latest ?? 0n,
      swaps,
      readings: blocks.flatMap((b) =>
        readings.has(b) ? [readings.get(b)!] : [],
      ),
      baseline: baseline === undefined ? undefined : readings.get(baseline),
    });
    // Retain the exact oldest predecessor and the last quiet live anchor for impacts.
    for (const b of readings.keys())
      if (!blocks.includes(b) && b !== baseline && b !== state.live?.block)
        readings.delete(b);
  };
  let loader = createPastPoints((block) => source.meter(block));
  const scheduled = new Map<bigint, Promise<void>>();
  const recover = () => {
    const blocks = blockList();
    const jobs = [
      ...blocks,
      ...(blocks.length && blocks[0] > 0n ? [blocks[0] - 1n] : []),
    ];
    loader.retain(jobs);
    for (const block of scheduled.keys())
      if (!jobs.includes(block)) scheduled.delete(block);
    for (const block of jobs) {
      if (!readings.has(block) && !scheduled.has(block))
        scheduled.set(
          block,
          loader.request(block, (point) => {
            readings.set(block, point);
            refresh();
          }),
        );
    }
    return Promise.all(
      jobs.flatMap((b) => (scheduled.has(b) ? [scheduled.get(b)!] : [])),
    );
  };
  const offReset = cache?.onReset(() => {
    swaps = [];
    readings.clear();
    scheduled.clear();
    loader.dispose();
    loader = createPastPoints((block) => source.meter(block));
    started = false;
    logsLoaded = false;
    gate?.cancel();
    gate = undefined;
    update({
      points: [],
      swaps: [],
      initialSettled: false,
      historyPending: true,
    });
  });
  const addLogs = (incoming: PoolSwap[], fresh: boolean) => {
    swaps = [
      ...new Map(
        [...incoming.map((s) => ({ ...s, fresh })), ...swaps].map((s) => [
          s.id,
          s,
        ]),
      ).values(),
    ].sort(swapOrder);
    refresh();
  };
  const hydrate = async (latest: bigint) => {
    const floor =
      latest >= BURIAL_START
        ? BURIAL_START
        : latest > 9999n
          ? latest - 9999n
          : 0n;
    const found = new Set<bigint>();
    const cachedHead = saved?.readings.at(-1)?.block;
    try {
      for (let end = latest; end >= floor; ) {
        const start = end - 1999n > floor ? end - 1999n : floor;
        const incoming = await source.logs(start, end);
        incoming.forEach((s) => found.add(s.block));
        addLogs(incoming, false);
        // Read finished windows incrementally, while searching for all 40 blocks.
        void recover();
        if (
          found.size >= 40 ||
          (cachedHead !== undefined &&
            start <= cachedHead &&
            blockList().length >= 40) ||
          start === floor
        )
          break;
        end = start - 1n;
      }
      logsLoaded = true;
      startupFailed = false;
      refresh();
      await recover();
    } catch {
      startupFailed = true;
      startupRetryAt = now() + 60_000;
      started = false;
      refresh();
    } finally {
      gate?.settle();
    }
  };
  const market = async () => {
    if (marketPending) {
      wantsMeter = true;
      return;
    }
    marketPending = true;
    wantsMeter = false;
    lastMeter = now();
    try {
      const live = await source.meter();
      const previous = state.live;
      if (!previous || live.block >= previous.block) {
        const [next, burst] = observeCrossing(crossing, live);
        crossing = next;
        readings.set(live.block, live);
        update({
          live,
          failed: false,
          change: previous
            ? sellPercentage(live.out) - sellPercentage(previous.out)
            : 0,
          capChange: previous
            ? live.marketCap - previous.marketCap || state.capChange
            : 0,
          revision: state.revision + 1,
          burst: state.burst + Number(burst),
        });
        refresh();
      }
    } catch {
      update({ failed: true });
      wantsMeter = true;
    } finally {
      marketPending = false;
      void recover();
    }
  };
  async function poll() {
    if (polling) return;
    polling = true;
    gate ??= firstLoadGate(() => update({ initialSettled: true }));
    try {
      const latest = await source.latest();
      update({ block: latest });
      if (!started && now() >= startupRetryAt) {
        started = true;
        void hydrate(latest);
      }
      if (cursor === undefined) {
        cursor = latest;
        void market();
      } else if (latest > cursor && now() >= catchupRetryAt) {
        try {
          const [from, end] = catchUpRange(cursor, latest);
          const incoming = await source.logs(from, end);
          cursor = end;
          catchupFailed = false;
          const seen = new Set(swaps.map((s) => s.id));
          addLogs(incoming, true);
          if (incoming.some((s) => !seen.has(s.id))) void market();
          void recover();
        } catch {
          catchupFailed = true;
          catchupRetryAt = now() + 60_000;
          refresh();
        }
      }
      if (!marketPending && (wantsMeter || now() - lastMeter >= 60_000))
        void market();
      // Promote newly finalized points even in a quiet market.
      refresh();
    } catch {
      update({ failed: true });
    } finally {
      polling = false;
    }
  }
  return {
    poll,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      offReset?.();
      gate?.cancel();
      loader.dispose();
      listeners.clear();
    },
  };
}
