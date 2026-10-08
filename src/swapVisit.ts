import { sellPercentage, type SellPoint, type SellReading } from "./paid";
import {
  assignImpacts,
  mergePoints,
  observeCrossing,
  swapOrder,
  type Crossing,
  type PoolSwap,
} from "./swapTape";
import { swapSource, type SwapSource } from "./swapReads";

export type SwapState = {
  block?: bigint;
  live?: SellReading;
  points: SellPoint[];
  swaps: PoolSwap[];
  failed: boolean;
  historyPending: boolean;
  historyFailed: boolean;
  change: number;
  capChange: number;
  revision: number;
  burst: number;
};
export function createSwapVisit(
  source: SwapSource = swapSource,
  now = Date.now,
) {
  let state: SwapState = {
    points: [],
    swaps: [],
    failed: false,
    historyPending: true,
    historyFailed: false,
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
  let swaps: PoolSwap[] = [];
  const readings = new Map<bigint, SellPoint>();
  const pending = new Set<bigint>();
  const failedBlocks = new Set<bigint>();
  let recovering = false;
  const update = (patch: Partial<SwapState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const refresh = () => {
    const blocks = new Set(swaps.map((s) => s.block));
    update({
      swaps: assignImpacts(swaps, readings),
      points: mergePoints(
        [],
        [...readings.values()].filter((p) => blocks.has(p.block)),
      ),
    });
    // Bound visit memory while retaining the predecessor required for impacts.
    if (blocks.size > 80) {
      const cutoff = [...blocks].sort((a, b) => (a < b ? -1 : 1)).at(-80)!;
      swaps = swaps.filter((s) => s.block >= cutoff);
      const anchor = [...readings.keys()]
        .filter((b) => b < cutoff)
        .sort((a, b) => (a < b ? -1 : 1))
        .at(-1);
      for (const b of readings.keys())
        if (b < cutoff && b !== anchor) readings.delete(b);
    }
    const idle = [...readings.keys()]
      .filter((b) => !blocks.has(b))
      .sort((a, b) => (a < b ? -1 : 1));
    // Keep the oldest baseline and the latest quiet-block anchor, not every heartbeat.
    for (const b of idle.slice(1, -1)) readings.delete(b);
  };
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
    const top = new Set(
      state.swaps.filter((s) => s.timestamp === undefined).map((s) => s.block),
    );
    for (const block of top)
      void source
        .timestamp(block)
        .then((timestamp) => {
          swaps = swaps.map((s) =>
            s.block === block ? { ...s, timestamp } : s,
          );
          refresh();
        })
        .catch(() => {
          /* The quote also supplies the timestamp when it succeeds. */
        });
  };
  const past = async (block: bigint) => {
    if (readings.has(block) || pending.has(block)) return;
    pending.add(block);
    try {
      readings.set(block, await source.meter(block));
      failedBlocks.delete(block);
      if (!failedBlocks.size) update({ historyFailed: false });
      refresh();
    } catch {
      failedBlocks.add(block);
      update({ historyFailed: true });
    } finally {
      pending.delete(block);
    }
  };
  const recover = async () => {
    if (recovering) return;
    recovering = true;
    const jobs = [
      ...new Set(
        swaps.filter((s) => !readings.has(s.block)).map((s) => s.block),
      ),
    ].reverse();
    let index = 0;
    try {
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          while (index < jobs.length) await past(jobs[index++]);
        }),
      );
    } finally {
      recovering = false;
    }
  };
  const hydrate = async (latest: bigint) => {
    const floor = latest > 9999n ? latest - 9999n : 0n;
    const found: PoolSwap[] = [];
    try {
      for (let end = latest; end >= floor; ) {
        const start = end - 1999n > floor ? end - 1999n : floor;
        found.push(...(await source.logs(start, end)));
        if (new Set(found.map((s) => s.block)).size >= 24 || start === floor)
          break;
        end = start - 1n;
      }
      const blocks = [...new Set(found.map((s) => s.block))]
        .sort((a, b) => (a > b ? -1 : 1))
        .slice(0, 24);
      addLogs(
        found.filter((s) => blocks.includes(s.block)),
        false,
      );
      const jobs = [
        ...blocks,
        ...(blocks.length && blocks.at(-1)! > 0n ? [blocks.at(-1)! - 1n] : []),
      ];
      // Three independent archive reads at a time; polling and live UI never await them.
      let index = 0;
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          while (index < jobs.length) await past(jobs[index++]);
        }),
      );
    } catch {
      update({ historyFailed: true });
      started = false;
    } finally {
      update({ historyPending: false });
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
      // If latest advanced during the call, recover exact per-block points from archive.
      void recover();
    }
  };
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      const latest = await source.latest();
      update({ block: latest });
      if (!started) {
        started = true;
        void hydrate(latest);
      }
      if (cursor === undefined) {
        cursor = latest;
        void market();
      } else if (latest > cursor) {
        const end = cursor + 2000n < latest ? cursor + 2000n : latest;
        const incoming = await source.logs(cursor + 1n, end);
        cursor = end;
        if (incoming.length) {
          addLogs(incoming, true);
          void market();
        }
      }
      if (!marketPending && (wantsMeter || now() - lastMeter >= 60_000)) {
        void market();
        for (const block of [...failedBlocks].slice(-3)) void past(block);
      }
    } catch {
      update({ failed: true });
    } finally {
      polling = false;
    }
  }
  return {
    poll,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
