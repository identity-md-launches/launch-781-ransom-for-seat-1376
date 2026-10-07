import { Letter, SecondAct } from "./SecondAct";
import { Watch } from "./Watch";
import { SellChart } from "./SellChart";
import { fixedAmount } from "./display";
import { DEAD, NINE_WALLETS, watchTokens, type WatchState } from "./watch";
import {
  chartPoints,
  initialPaidState,
  marketDollars,
  maySell,
  offerRules,
  paidTime,
  secondRansomPaid,
  sellPercentage,
  type PaidState,
  type SellReading,
} from "./paid";

function AddressLink({
  address,
  text = address,
}: {
  address: string;
  text?: string;
}) {
  return (
    <a
      href={`https://etherscan.io/address/${address}`}
      target="_blank"
      rel="noreferrer"
    >
      {text}
    </a>
  );
}

export function SellMeter({
  live,
  failed,
}: {
  live?: SellReading;
  failed: boolean;
}) {
  const percentage = live && sellPercentage(live.out);
  const bag = `his bag sells for ${live ? fixedAmount(live.out, 18, 4, "nearest") : "—"} ETH of 8.67 ETH`;
  return (
    <section className="paid-section" aria-labelledby="may-sell-title">
      <h2 className="label" id="may-sell-title">
        MAY HE SELL
      </h2>
      <p className="paid-line">{bag}</p>
      <div
        className="meter"
        role="progressbar"
        aria-label="MAY HE SELL"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={
          percentage === undefined ? undefined : Math.min(100, percentage)
        }
        aria-valuetext={bag}
      >
        <span style={{ width: `${Math.min(100, percentage ?? 0)}%` }} />
      </div>
      <p className="label sell-percent">
        {percentage === undefined ? "—" : percentage.toFixed(1)}%
      </p>
      <p>market cap ${live ? marketDollars(live.marketCap) : "—"}</p>
      <p className="label">
        measured by the real sell quote: the 2% fee and slippage included.
      </p>
      <p className="sell-status" role="status">
        {live
          ? maySell(live.out)
            ? "HE MAY SELL."
            : "HE MAY NOT SELL YET."
          : "—"}
      </p>
      <p className="label" role="status">
        {failed ? "Live reads are unavailable. Retrying…" : ""}
      </p>
    </section>
  );
}

export function PaidSecondAct({
  watch,
  paid,
}: {
  watch: WatchState;
  paid: PaidState;
}) {
  const data = watch.data!;
  const history = paid.history;
  const rules = offerRules(
    data.main,
    paid.allowed,
    !!history?.paid && !paid.historyPending,
  );
  return (
    <section id="second-act" className="document-section paid-act">
      <div className="testament-body">
        <h1 className="sealed-headline">THE SECOND RANSOM IS PAID.</h1>
        <p className="label paid-receipt" aria-busy={paid.historyPending}>
          189,216,124 $FREE1376 → <AddressLink address={DEAD} text="0x…dEaD" />{" "}
          · {history?.paid ? paidTime(history.paid.timestamp) : "—"}
        </p>
        <details className="paid-disclosure">
          <summary>the nine wallets</summary>
          <div className="letter-wallets">
            {NINE_WALLETS.map((address, index) => (
              <p key={address}>
                <AddressLink address={address} />
                <span className="letter-balance">
                  {" "}
                  · {watchTokens(data.balances[index])} FREE1376
                </span>
              </p>
            ))}
          </div>
        </details>
        <details className="paid-disclosure">
          <summary>read the letter</summary>
          <Letter balances={data.balances} />
          <div className="label">
            my creator leaves hints here:{" "}
            <a
              href="https://x.com/creusseverus"
              target="_blank"
              rel="noreferrer"
            >
              @creusseverus
            </a>
          </div>
        </details>
        <section className="paid-section" aria-labelledby="offer-title">
          <h2 className="label" id="offer-title">
            THE OFFER
          </h2>
          <div className="offer-rows">
            {rules.map((rule, index) => (
              <p className="contract-row offer-row" key={index}>
                {rule}
              </p>
            ))}
          </div>
        </section>
        <SellMeter live={paid.live} failed={paid.liveFailed} />
        <section className="paid-section" aria-labelledby="sell-chart-title">
          <h2 className="label" id="sell-chart-title">
            CHART
          </h2>
          <SellChart
            points={chartPoints(history?.points ?? [], paid.live)}
            pending={paid.historyPending}
          />
          {paid.historyFailed && (
            <p className="label">
              Live reads are unavailable. Check your connection and retry;
              previous values may be out of date.
            </p>
          )}
        </section>
        <section className="paid-section" aria-labelledby="recouped-title">
          <h2 className="label" id="recouped-title">
            RECOUPED
          </h2>
          <p>
            recouped by selling: 0 of 8.67 ETH. The third act opens at 8.67.
          </p>
        </section>
        <Watch {...watch} />
      </div>
    </section>
  );
}

export function SecondActView({
  paid = initialPaidState,
  ...watch
}: WatchState & { paid?: PaidState }) {
  return secondRansomPaid(watch.data) ? (
    <PaidSecondAct watch={watch} paid={paid} />
  ) : (
    <SecondAct {...watch} />
  );
}
