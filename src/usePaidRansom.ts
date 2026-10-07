import { useEffect, useState } from "react";
import { initialPaidState, secondRansomPaid } from "./paid";
import { createPaidVisit } from "./paidVisit";
import type { WatchState } from "./watch";

export function usePaidRansom(watch: WatchState) {
  const paid = secondRansomPaid(watch.data);
  const [visit] = useState(() => createPaidVisit());
  const [state, setState] = useState(initialPaidState);
  useEffect(() => {
    if (paid) return visit(setState);
  }, [paid, visit]);
  return state;
}
