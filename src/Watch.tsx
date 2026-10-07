import { useEffect, useState } from "react";
import {
  watchCountdown,
  watchTokens,
  watchTotals,
  watchValue,
  watchVerdicts,
  type WatchState,
} from "./watch";

export function Watch({ data, failed }: WatchState) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  const totals = data && watchTotals(data);
  return (
    <section className="watch" aria-label="Watch">
      <p className="label watch-countdown">{watchCountdown(now)}</p>
      <dl className="watch-rows" aria-busy={!data && !failed}>
        <div className="contract-row watch-row">
          <dt className="label">nine wallets:</dt>
          <dd>{totals ? watchTokens(totals.nine) : "—"} FREE1376</dd>
        </div>
        <div className="contract-row watch-row">
          <dt className="label">his wallet:</dt>
          <dd>
            {data ? watchTokens(data.main) : "—"} FREE1376 ·{" "}
            {data ? watchValue(data) : "≈ — ETH ($—)"} · cash-out line 8.67 ETH
          </dd>
        </div>
        <div className="contract-row watch-row">
          <dt className="label">burned:</dt>
          <dd>
            {totals
              ? totals.burned === 0n
                ? "0"
                : watchTokens(totals.burned)
              : "—"}{" "}
            FREE1376
          </dd>
        </div>
      </dl>
      <div className="watch-verdict" role="status">
        {data &&
          watchVerdicts(data, now).map((line) => <p key={line}>{line}</p>)}
      </div>
      <p className="label" role="status">
        {failed ? "Live reads are unavailable. Retrying…" : ""}
      </p>
    </section>
  );
}
