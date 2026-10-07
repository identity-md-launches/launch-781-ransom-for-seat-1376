import { useEffect, useState } from "react";
import { pollWatch, type WatchState } from "./watch";

export function useWatch() {
  const [state, setState] = useState<WatchState>({ failed: false });
  useEffect(() => pollWatch(setState), []);
  return state;
}
