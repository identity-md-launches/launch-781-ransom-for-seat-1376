import { useEffect, useState } from "react";
import { initialPaidState } from "./paid";
import { createPaidVisit } from "./paidVisit";
import { H0, watchTotals, type WatchState } from "./watch";

export function usePaidRansom(watch: WatchState) {
  const paid = !!watch.data && watchTotals(watch.data).burned >= H0;
  const [visit] = useState(() => createPaidVisit());
  const [state, setState] = useState(initialPaidState);
  useEffect(() => {
    if (paid) return visit(setState);
  }, [paid, visit]);
  return state;
}
