import { useEffect, useState } from "react";
import type { Act } from "./acts";
import type { KeyData } from "./key";
import { readKey, readKeyStatus, type KeyStatus } from "./keyReads";

export function useKey(act: Act) {
  const [key, setKey] = useState<KeyData>();
  const [status, setStatus] = useState<KeyStatus>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true,
      pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const detail = act === "third-act" ? await readKey() : undefined;
        const next = detail ?? (await readKeyStatus());
        if (active) {
          setStatus(next);
          if (detail) setKey(detail);
          setFailed(false);
        }
      } catch {
        if (active) {
          setKey(undefined);
          setStatus(undefined);
          setFailed(true);
        }
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [act]);
  return { key, status, given: status?.given ?? false, failed };
}
