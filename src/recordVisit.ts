import {
  extendWalletRecord,
  initialRecordState,
  type RecordSource,
  type RecordState,
} from "./walletRecord";
import type { WatchSnapshot } from "./watch";

export function createRecordVisit(source: RecordSource) {
  let state: RecordState = { ...initialRecordState };
  let running = false;
  let started = false;
  let watch: WatchSnapshot | undefined;
  const listeners = new Set<(state: RecordState) => void>();
  const publish = () => listeners.forEach((listener) => listener(state));
  const needsExtension = () =>
    !!watch &&
    !!state.data &&
    watch.block > state.data.through &&
    watch.main !== state.data.balance;
  const refresh = async () => {
    if (running) return;
    running = true;
    const observedAtStart = watch?.block;
    started = true;
    state = { ...state, pending: true };
    publish();
    try {
      const data = await extendWalletRecord(source, state.data);
      state = { data, pending: false, failed: false };
    } catch {
      state = { ...state, pending: false, failed: true };
    } finally {
      running = false;
      publish();
    }
    // A watch update received during a scan must not be lost. Do not loop if
    // the archive head lags the watch; the next watch tick will retry instead.
    if (!state.failed && watch?.block !== observedAtStart && needsExtension())
      void refresh();
  };
  return {
    subscribe(listener: (state: RecordState) => void) {
      listeners.add(listener);
      listener(state);
      if (!started) void refresh();
      return () => {
        listeners.delete(listener);
      };
    },
    observe(snapshot?: WatchSnapshot) {
      watch = snapshot;
      if (!started || state.failed || needsExtension()) void refresh();
    },
  };
}
