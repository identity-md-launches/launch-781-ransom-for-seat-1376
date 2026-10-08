import { createHourHistory } from "./hourHistory";
import { useEffect, useState } from "react";
import {
  initialPaidState,
  type PaidBlock,
  type PaidHistory,
  type PaidState,
} from "./paid";
import { readPaidHistory } from "./paidReads";
import { H0, WATCH_INTERVAL, watchTotals, type WatchState } from "./watch";

// Keep the existing payment search, hourly samples and visit lifetime. The new
// swap visit owns live quotes; the old 15-second archive quote poll is not started.
export function createPaidHistoryVisit(
  read: (onPaid: (paid: PaidBlock) => void) => Promise<PaidHistory> = (
    onPaid,
  ) => readPaidHistory(undefined, onPaid),
) {
  let state: PaidState = { ...initialPaidState };
  let loaded = false,
    pending = false;
  const listeners = new Set<(state: PaidState) => void>();
  const publish = () => listeners.forEach((listener) => listener(state));
  async function refresh() {
    if (loaded || pending) return;
    pending = true;
    state = { ...state, historyPending: true };
    publish();
    try {
      const history = await read((paid) => {
        state = {
          ...state,
          history: { paid, points: state.history?.points ?? [] },
        };
        publish();
      });
      loaded = !!history.paid;
      state = {
        ...state,
        history: history.paid ? history : state.history,
        historyPending: false,
        historyFailed: !loaded,
      };
    } catch {
      state = { ...state, historyPending: false, historyFailed: true };
    } finally {
      pending = false;
      publish();
    }
  }
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
export function usePaidHistory(watch: WatchState) {
  const paid = !!watch.data && watchTotals(watch.data).burned >= H0;
  const [visit] = useState(() => createHourHistory());
  const [state, setState] = useState(visit.getSnapshot);
  useEffect(() => {
    if (paid || visit.getSnapshot().history?.paid)
      return visit.subscribe(setState);
  }, [paid, visit]);
  return state;
}
