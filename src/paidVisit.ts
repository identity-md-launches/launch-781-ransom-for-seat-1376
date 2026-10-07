import { WATCH_INTERVAL } from "./watch";
import { initialPaidState, maySell, type PaidState } from "./paid";
import { readLiveSell, readPaidHistory } from "./paidReads";

// Owned by App for the entire visit: act navigation never resets the evidence.
export function createPaidVisit(
  history = readPaidHistory,
  live = readLiveSell,
) {
  let state = { ...initialPaidState };
  let historyOnce: Promise<void> | undefined;
  let pending = false;
  const listeners = new Set<(state: PaidState) => void>();
  const publish = () => listeners.forEach((listener) => listener(state));
  const refresh = async () => {
    if (pending) return;
    pending = true;
    try {
      const reading = await live();
      state = {
        ...state,
        live: reading,
        liveFailed: false,
        allowed: state.allowed || maySell(reading.out),
      };
    } catch {
      state = { ...state, liveFailed: true };
    } finally {
      pending = false;
      publish();
    }
  };
  return (listener: (state: PaidState) => void) => {
    listeners.add(listener);
    listener(state);
    historyOnce ??= history()
      .then((result) => {
        state = {
          ...state,
          history: result,
          historyPending: false,
          historyFailed: !result.paid,
          allowed:
            state.allowed || result.points.some((point) => maySell(point.out)),
        };
        publish();
      })
      .catch(() => {
        state = { ...state, historyPending: false, historyFailed: true };
        publish();
      });
    void refresh();
    const timer = setInterval(refresh, WATCH_INTERVAL);
    return () => {
      listeners.delete(listener);
      clearInterval(timer);
    };
  };
}
