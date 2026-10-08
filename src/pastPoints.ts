import type { SellReading } from "./paid";

export const retryDelay = (failures: number) =>
  [5000, 10000, 20000, 40000][failures - 1] ?? 60000;
export function createReadLimit(limit = 4) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(read: () => Promise<T>): Promise<T> => {
    if (active >= limit)
      await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await read();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
export const chartReadLimit = createReadLimit();

// Each first promise settles after one answered attempt; completion remains separate.
// Retries also pass through the shared four-slot limiter and never block new jobs.
export function createPastPoints(
  read: (block: bigint) => Promise<SellReading>,
  limit = chartReadLimit,
) {
  type Entry = {
    first: Promise<void>;
    listeners: Set<(p: SellReading) => void>;
    value?: SellReading;
    timer?: ReturnType<typeof setTimeout>;
  };
  const entries = new Map<bigint, Entry>();
  let disposed = false;
  return {
    request(block: bigint, onPoint: (p: SellReading) => void) {
      let entry = entries.get(block);
      if (!entry) {
        let settle!: () => void;
        entry = {
          first: new Promise<void>((resolve) => {
            settle = resolve;
          }),
          listeners: new Set(),
        };
        entries.set(block, entry);
        const job = entry;
        let failures = 0;
        const attempt = async () => {
          try {
            const point = await limit(() => {
              if (disposed || entries.get(block) !== job)
                throw Error("Discarded point");
              return read(block);
            });
            if (disposed || entries.get(block) !== job) return;
            job.value = point;
            job.listeners.forEach((listener) => listener(point));
            job.listeners.clear();
          } catch {
            if (!disposed && entries.get(block) === job) {
              job.timer = setTimeout(attempt, retryDelay(++failures));
              job.timer.unref?.();
            }
          } finally {
            settle();
          }
        };
        // Register the listener before starting even a synchronously mocked read.
        job.listeners.add(onPoint);
        void attempt();
      } else if (entry.value) onPoint(entry.value);
      else entry.listeners.add(onPoint);
      return entry.first;
    },
    retain(blocks: readonly bigint[]) {
      for (const [block, job] of entries)
        if (!blocks.includes(block)) {
          clearTimeout(job.timer);
          job.listeners.clear();
          entries.delete(block);
        }
    },
    dispose() {
      disposed = true;
      entries.forEach((e) => clearTimeout(e.timer));
      entries.clear();
    },
  };
}

export function firstLoadGate(done: () => void, timeout = 8000) {
  let finished = false;
  const settle = () => {
    if (!finished) {
      finished = true;
      clearTimeout(timer);
      done();
    }
  };
  const timer = setTimeout(settle, timeout);
  timer.unref?.();
  return { settle, cancel: () => clearTimeout(timer) };
}
