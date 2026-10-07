import { WATCH_INTERVAL } from "./watch";
import {
  initialPaidState,
  type PaidBlock,
  type PaidHistory,
  type PaidState,
} from "./paid";
import { readLiveSell, readPaidHistory } from "./paidReads";

// Owned by App for the visit. Chart samples are presentation, never permission.
export function createBurnVisit(
  history: (onPaid: (paid: PaidBlock) => void) => Promise<PaidHistory> = (
    onPaid,
  ) => readPaidHistory(undefined, onPaid),
  live = readLiveSell,
) {
  let state = { ...initialPaidState };
  let historyOnce: Promise<void> | undefined;
  let pending = false;
  const listeners = new Set<(state: PaidState) => void>();
  const publish = () => listeners.forEach((listener) => listener(state));
  const loadHistory = () => {
    if (historyOnce) return;
    state = { ...state, historyPending: true };
    historyOnce = history((paid) => {
      state = {
        ...state,
        history: { paid, points: state.history?.points ?? [] },
      };
      publish();
    })
      .then((result) => {
        state = {
          ...state,
          history: result.paid ? result : state.history,
          historyPending: false,
          historyFailed: !result.paid,
        };
        if (!result.paid) historyOnce = undefined;
        publish();
      })
      .catch(() => {
        state = { ...state, historyPending: false, historyFailed: true };
        historyOnce = undefined;
        publish();
      });
  };
  const refresh = async () => {
    loadHistory();
    if (pending) return;
    pending = true;
    try {
      const reading = await live();
      state = { ...state, live: reading, liveFailed: false };
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
    void refresh();
    const timer = setInterval(refresh, WATCH_INTERVAL);
    return () => {
      listeners.delete(listener);
      clearInterval(timer);
    };
  };
}
