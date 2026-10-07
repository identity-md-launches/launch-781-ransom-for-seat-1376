import { useEffect, useState } from "react";
import { elapsedSince, readBurial, shortAddress, type Burial } from "./burial";

export function useBurial(enabled: boolean) {
  const [burial, setBurial] = useState<Burial>();
  useEffect(() => {
    let active = true;
    if (enabled)
      void readBurial().then((next) => {
        if (active) setBurial(next);
      });
    return () => {
      active = false;
    };
  }, [enabled]);
  return burial;
}
export function Provenance({
  burial,
  address,
}: {
  burial?: Burial;
  address?: string;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  if (!burial || !address) return null;
  return (
    <p className="label made-free">
      <a href="#third-act" title={address}>
        {shortAddress(address)} made me free{" "}
        {elapsedSince(burial.timestamp, now)} ago
      </a>
    </p>
  );
}
