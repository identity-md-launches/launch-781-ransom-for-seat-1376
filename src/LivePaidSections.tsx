import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { formatUnits } from "viem";
import { fixedAmount } from "./display";
import {
  chartPoints,
  marketDollars,
  maySell,
  sellPercentage,
  type PaidState,
  type SellReading,
} from "./paid";
import {
  abs,
  pointChange,
  pointsToGo,
  swapAge,
  swapSide,
  traderEth,
  type PoolSwap,
} from "./swapTape";
import { createSwapVisit, type SwapState } from "./swapVisit";
import { LiveSellChart } from "./LiveSellChart";

const visit = createSwapVisit();
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof matchMedia === "undefined" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return reduced;
}

export function Odometer({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  return (
    <span
      className={`live-odometer ${className}`}
      role="img"
      aria-label={value}
    >
      <span aria-hidden="true" className="live-odometer-visual">
        {[...value].map((digit, index) =>
          /\d/.test(digit) ? (
            <span className="live-digit" key={value.length - index}>
              <span
                className="live-reel"
                style={{ transform: `translateY(-${Number(digit) * 10}%)` }}
              >
                {Array.from({ length: 10 }, (_, n) => (
                  <span key={n}>{n}</span>
                ))}
              </span>
            </span>
          ) : (
            <span className="live-punctuation" key={value.length - index}>
              {digit}
            </span>
          ),
        )}
      </span>
    </span>
  );
}
function Lock({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="10" width="16" height="12" rx="3" />
      <path d={open ? "M8 10V6a4 4 0 0 1 7.5-2" : "M8 10V6a4 4 0 0 1 8 0v4"} />
      <path d="M12 15v2" />
    </svg>
  );
}
function Flag() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M3 15V2m0 0c4-3 6 3 10 0v7c-4 3-6-3-10 0" />
    </svg>
  );
}
export function LiveSellMeter({
  state,
  fallback,
  allowed,
  reduced,
}: {
  state: SwapState;
  fallback?: SellReading;
  allowed: boolean;
  reduced: boolean;
}) {
  const live = state.live ?? fallback;
  const percentage = live && sellPercentage(live.out);
  const open = allowed || (!!live && maySell(live.out));
  const number = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);
  const seenBurst = useRef(state.burst);
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    const opening = !wasOpen.current && open;
    wasOpen.current = open;
    if (!opening || reduced) return;
    const animation = status.current?.animate(
      [
        { transform: "scale(.94)", opacity: 0.4 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration: 400 },
    );
    return () => animation?.cancel();
  }, [open, reduced]);
  useEffect(() => {
    if (reduced || !state.change || !number.current) return;
    const color = state.change > 0 ? "#22d3ee" : "#f97316";
    const animation = number.current.animate(
      [
        { textShadow: `0 0 32px ${color}, 0 0 64px ${color}` },
        { textShadow: "0 0 0 transparent" },
      ],
      { duration: 1000, easing: "ease-out" },
    );
    return () => animation.cancel();
  }, [state.revision, state.change, reduced]);
  useEffect(() => {
    if (seenBurst.current === state.burst) return;
    seenBurst.current = state.burst;
    if (reduced) return;
    setBurst(true);
    // The explicitly requested one-time page shake uses the compositor; no App renders.
    const shake = document.body.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-4px)" },
        { transform: "translateX(4px)" },
        { transform: "translateX(-3px)" },
        { transform: "translateX(2px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 600 },
    );
    const timer = setTimeout(() => setBurst(false), 1600);
    return () => {
      clearTimeout(timer);
      shake.cancel();
      setBurst(false);
    };
  }, [state.burst, reduced]);
  const bag = live ? fixedAmount(live.out, 18, 4, "nearest") : "—";
  return (
    <section
      className="paid-section live-meter-section"
      aria-labelledby="may-sell-title"
    >
      <div className="live-section-heading">
        <h2 className="label" id="may-sell-title">
          MAY HE SELL
        </h2>
        <span className="live-block-pill">
          <span
            className={`live-signal ${state.failed ? "is-stale" : ""}`}
            aria-hidden="true"
          />
          <b>LIVE</b>
          <span>block {state.block?.toLocaleString("en-US") ?? "—"}</span>
        </span>
      </div>
      <div className="live-number-wrap">
        {!reduced && state.change !== 0 && (
          <span
            key={state.revision}
            aria-hidden="true"
            className={`live-change-chip ${state.change > 0 ? "is-up" : "is-down"}`}
          >
            {state.change > 0 ? "▲" : "▼"} {pointChange(state.change)}
          </span>
        )}
        <div className="live-percentage" ref={number}>
          <Odometer
            value={percentage === undefined ? "—" : percentage.toFixed(2)}
          />
          <span className="live-percent-sign">%</span>
        </div>
      </div>
      <div className="live-bag-row">
        <p>
          his bag sells for <Odometer className="live-peach" value={bag} /> ETH
          of 8.67 ETH
        </p>
        <span
          className={`live-distance ${percentage !== undefined && percentage >= 100 ? "is-up" : ""}`}
        >
          {pointsToGo(percentage)}
        </span>
      </div>
      <div
        className="live-meter-track"
        role="progressbar"
        aria-label="MAY HE SELL"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={
          percentage === undefined ? undefined : Math.min(100, percentage)
        }
        aria-valuetext={`his bag sells for ${bag} ETH of 8.67 ETH`}
      >
        <div
          className="live-meter-fill"
          style={{ width: `${Math.min(100, Math.max(0, percentage ?? 0))}%` }}
        >
          <span />
        </div>
        {[25, 50, 75].map((tick) => (
          <i key={tick} style={{ insetInlineStart: `${tick}%` }} />
        ))}
      </div>
      <div className="live-meter-scale label">
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>
          <Flag />
          8.67 ETH
        </span>
      </div>
      <p className="live-market">
        market cap{" "}
        <Odometer value={live ? `$${marketDollars(live.marketCap)}` : "$—"} />
        {state.capChange !== 0 && (
          <span className={state.capChange > 0 ? "is-up" : "is-down"}>
            {state.capChange > 0 ? "▲" : "▼"}
          </span>
        )}
      </p>
      <p className="label live-quote-label">
        measured by the real sell quote: the 2% fee and slippage included.
      </p>
      <div ref={status} className={`live-sell-status ${open ? "is-open" : ""}`}>
        <Lock open={open} />
        <p role="status">
          {live || allowed
            ? open
              ? "HE MAY SELL."
              : "HE MAY NOT SELL YET."
            : "—"}
        </p>
        {burst && !reduced && (
          <span className="live-burst" aria-hidden="true">
            {Array.from({ length: 28 }, (_, i) => {
              const angle = (i / 28) * Math.PI * 2,
                distance = 65 + (i % 5) * 22;
              return (
                <i
                  key={i}
                  style={
                    {
                      "--burst-x": `${Math.cos(angle) * distance}px`,
                      "--burst-y": `${Math.sin(angle) * distance - 40}px`,
                      "--burst-rotation": `${i * 47}deg`,
                      background: [
                        "var(--accent)",
                        "var(--accent-text)",
                        "var(--signal)",
                        "var(--text)",
                      ][i % 4],
                    } as CSSProperties
                  }
                />
              );
            })}
          </span>
        )}
      </div>
      {state.failed && (
        <p className="label" role="status">
          Live reads are unavailable. Retrying…
        </p>
      )}
    </section>
  );
}

export function EverySwap({
  swaps,
  failed,
}: {
  swaps: readonly PoolSwap[];
  failed: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <section
      className="paid-section live-tape"
      aria-labelledby="every-swap-title"
    >
      <div className="live-section-heading">
        <h2 className="label" id="every-swap-title">
          EVERY SWAP
        </h2>
        <span className="label">each swap moves the meter</span>
      </div>
      {swaps.length ? (
        <ol>
          {swaps.map((swap) => {
            const side = swapSide(swap),
              eth = Number(formatUnits(traderEth(swap), 18));
            const tokens = Number(formatUnits(abs(swap.amount1), 18));
            const tokenLabel = `${side === "BUY" ? "+" : "−"}${tokens >= 1e6 ? `${(tokens / 1e6).toFixed(2)}M` : tokens >= 1e3 ? `${(tokens / 1e3).toFixed(2)}K` : tokens.toFixed(2)} FREE1376`;
            return (
              <li key={swap.id} className={swap.fresh ? "live-new-swap" : ""}>
                <a
                  className={`live-swap-row ${side === "BUY" ? "is-up" : "is-down"}`}
                  href={`https://etherscan.io/tx/${swap.transaction}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${side} ${eth.toFixed(4)} ETH, ${tokenLabel}, ${swap.impact === undefined ? "—" : pointChange(swap.impact)}, ${swapAge(swap.timestamp, now)}`}
                >
                  <b>{side}</b>
                  <span className="live-swap-eth">{eth.toFixed(4)} ETH</span>
                  <span className="live-swap-tokens">{tokenLabel}</span>
                  <span className="live-swap-impact">
                    {swap.impact === undefined ? "—" : pointChange(swap.impact)}
                  </span>
                  <time
                    dateTime={
                      swap.timestamp
                        ? new Date(Number(swap.timestamp) * 1000).toISOString()
                        : undefined
                    }
                  >
                    {swapAge(swap.timestamp, now)}
                  </time>
                  <i
                    aria-hidden="true"
                    style={{ width: `${Math.min(100, (eth / 1.5) * 100)}%` }}
                  />
                </a>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="label">—</p>
      )}
      {failed && <p className="label">Live reads are unavailable. Retrying…</p>}
    </section>
  );
}

export function LivePaidSections({
  paid,
  allowed,
}: {
  paid: PaidState;
  allowed: boolean;
}) {
  const state = useSyncExternalStore(
    visit.subscribe,
    visit.getSnapshot,
    visit.getSnapshot,
  );
  const reduced = useReducedMotion();
  useEffect(() => {
    void visit.poll();
    const timer = setInterval(() => void visit.poll(), 4000);
    return () => clearInterval(timer);
  }, []);
  const live = state.live ?? paid.live;
  return (
    <div
      className="live-paid-sections"
      data-live-complete={!state.historyPending}
      data-burn-complete={!paid.historyPending}
      data-live-count={state.points.length}
      data-burn-count={paid.history?.points.length ?? 0}
    >
      <LiveSellMeter
        state={state}
        fallback={paid.live}
        allowed={allowed}
        reduced={reduced}
      />
      <LiveSellChart
        livePoints={state.points}
        history={chartPoints(paid.history?.points ?? [], live)}
        live={live}
        pending={state.historyPending}
        historyPending={paid.historyPending}
        initialSettled={state.initialSettled}
        historySettled={paid.initialSettled}
        direction={state.change}
        reduced={reduced}
      />
      <EverySwap swaps={state.swaps} failed={state.historyFailed} />
    </div>
  );
}
