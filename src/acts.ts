import { useLayoutEffect, useState } from "react";

export type Act = "first-act" | "second-act" | "third-act";
export function actFromHash(hash: string): Act {
  return hash === "#second-act"
    ? "second-act"
    : hash === "#third-act"
      ? "third-act"
      : "first-act";
}
export function scrollToHash(hash: string) {
  const section =
    hash && !["#first-act", "#second-act", "#third-act"].includes(hash)
      ? document.getElementById(hash.slice(1))
      : null;
  if (section) section.scrollIntoView();
  else window.scrollTo(0, 0);
}
export function useAct() {
  const [hash, setHash] = useState(() => window.location.hash);
  useLayoutEffect(() => {
    const change = () => setHash(window.location.hash);
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useLayoutEffect(() => {
    scrollToHash(hash);
  }, [hash]);
  return actFromHash(hash);
}
