import { useEffect, useState } from "react";
import { createRecordVisit } from "./recordVisit";
import { recordSource } from "./recordReads";
import { initialRecordState } from "./walletRecord";
import type { WatchState } from "./watch";

export function useWalletRecord(watch: WatchState) {
  const [visit] = useState(() => createRecordVisit(recordSource));
  const [state, setState] = useState(initialRecordState);
  useEffect(() => visit.subscribe(setState), [visit]);
  useEffect(() => visit.observe(watch.data), [visit, watch.data]);
  return state;
}
