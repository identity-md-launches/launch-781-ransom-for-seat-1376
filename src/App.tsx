import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  encodeFunctionData,
  formatUnits,
  maxUint160,
  maxUint256,
  type Hex,
} from "viem";
import {
  ADDR,
  POOL_ID,
  EXPECTED_MANIFESTO_HASH,
  rpc,
  readSnapshot,
  readHoldings,
  parseAmount,
  quote,
  minimumOut,
  buildTrade,
  approvalSteps,
  formatAmount,
  exactFixed,
  explainError,
  errorName,
  hookAbi,
  tokenAbi,
  permitAbi,
  type Snapshot,
  type Holdings,
  type Side,
} from "./chain";
import { useWallet, walletLinks } from "./wallet";
import { useAct, scrollToHash } from "./acts";
import { quoteAmount, toGo, seatCopy, feeNote } from "./display";
import { KEY_ADDRESS, KEY_OPENSEA } from "./key";
import { KeyAct, useKey } from "./KeyAct";
import { isKeyholder } from "./keyReads";
import { liberatorAddress } from "./burial";
import { Provenance, useBurial } from "./Provenance";
import { dollarValue, freshDollars, readDollars, type DollarRound } from "./dollars";
import { Testament } from "./Testament";
import { SecondActView } from "./PaidSecondAct";
import { usePaidHistory as usePaidRansom } from "./usePaidHistory";
import { ThirdActSeal } from "./ThirdActGate";
import { useWalletRecord } from "./useWalletRecord";
import { recordFulfilled } from "./walletRecord";
import { useWatch } from "./useWatch";
import "./second-act.css";
import "./paid-act.css";
import "./live-paid.css";

const DEAD_URL = "https://etherscan.io/address/0x000000000000000000000000000000000000dEaD";

const explorer = (value: string, type = "address") =>
  `https://etherscan.io/${type}/${value}`;
function External({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}
function ContractRow({
  name,
  value,
  href,
}: {
  name: string;
  value: string;
  href: string;
}) {
  const [message, setMessage] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${name} copied`);
    } catch {
      setMessage("Copy unavailable. Select and copy the address below.");
    }
  };
  return (
    <div className="contract-row">
      <span className="label">{name}</span>
      <External href={href}>{value}</External>
      <button
        className="copy-button"
        onClick={copy}
        aria-label={`Copy ${name}`}
      >
        copy
      </button>
      <span role="status" className="copy-status">
        {message}
      </span>
    </div>
  );
}
export default function App() {
  const act = useAct();
  const watch = useWatch();
  const walletRecord = useWalletRecord(watch);
  const paidRansom = usePaidRansom(watch);
  const keyState = useKey(act);
  const [data, setData] = useState<Snapshot>();
  const [dollarRound, setDollarRound] = useState<DollarRound>();
  const burial = useBurial(Boolean(data?.buried || keyState.given));
  const liberator = keyState.failed ? undefined : liberatorAddress(burial, keyState.status);
  const dollars = freshDollars(dollarRound);
  const [readError, setReadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const wallet = useWallet();
  const yours = isKeyholder(wallet.account, keyState.status);
  const [holdings, setHoldings] = useState<Holdings>();
  const [holdingsError, setHoldingsError] = useState("");
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("0.01");
  const [slippage, setSlippage] = useState(3);
  const [estimate, setEstimate] = useState<{
    out: bigint;
    minimum: bigint;
    input: bigint;
    side: Side;
    at: number;
  }>();
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [actionError, setActionError] = useState("");
  const [operation, setOperation] = useState<"trade" | "hook">("trade");
  const [busy, setBusy] = useState("");
  const busyRef = useRef(false);
  const [notice, setNotice] = useState("");
  const [transaction, setTransaction] = useState<{
    hash: Hex;
    label: string;
    confirmed: boolean;
    trade: boolean;
  }>();
  const [quoteTick, setQuoteTick] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    void readDollars().then(setDollarRound);
    try {
      setData(await readSnapshot());
      setReadError("");
    } catch {
      setReadError(
        "Live reads are unavailable. Check your connection and retry; previous values may be out of date.",
      );
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    if (act === "second-act") return;
    void refresh();
    const timer = setInterval(() => {
      void refresh();
      setQuoteTick((v) => v + 1);
    }, 15_000);
    return () => clearInterval(timer);
  }, [refresh, act]);
  useEffect(() => {
    let active = true;
    setHoldings(undefined);
    setHoldingsError("");
    if (!wallet.account) return;
    const owner = wallet.account;
    const run = async () => {
      try {
        const next = await readHoldings(owner);
        if (active) {
          setHoldings(next);
          setHoldingsError("");
        }
      } catch {
        if (active) {
          setHoldings(undefined);
          setHoldingsError(
            "Balance and approvals unavailable. Retry your connection.",
          );
        }
      }
    };
    void run();
    const timer = setInterval(run, 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [wallet.account, transaction?.confirmed]);
  useEffect(() => {
    let active = true;
    setEstimate(undefined);
    setQuoteError("");
    setQuoting(false);
    if (!data || !amount || act !== "first-act") return;
    let input: bigint;
    try {
      input = parseAmount(amount, side === "buy" ? 18 : data.decimals);
    } catch {
      return;
    }
    setQuoting(true);
    const timer = setTimeout(async () => {
      try {
        const result = await quote(side, input);
        if (active)
          setEstimate({
            out: result.out,
            minimum: minimumOut(result.out, slippage),
            input,
            side,
            at: Date.now(),
          });
      } catch (error) {
        if (active) setQuoteError(explainError(error, data));
      } finally {
        if (active) setQuoting(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [side, amount, data?.decimals, slippage, quoteTick, act]);
  const setAmountValue = (value: string) => {
    setAmount(value);
    setFieldError("");
    setActionError("");
  };
  const switchSide = (next: Side) => {
    setSide(next);
    setAmountValue(next === "buy" ? "0.01" : "");
    setEstimate(undefined);
    setQuoteError("");
  };
  const inputAmount = (() => {
    try {
      return parseAmount(amount, side === "buy" ? 18 : (data?.decimals ?? 18));
    } catch {
      return undefined;
    }
  })();
  const steps =
    holdings && inputAmount ? approvalSteps(holdings, inputAmount) : undefined;
  const stale =
    Boolean(readError) || !data || Date.now() - data.fetchedAt > 45_000;
  const openWallet = () => {
    setActionError("");
    dialog.current?.showModal();
  };
  const recordTransaction = async (hash: Hex, label: string, trade = false) => {
    setTransaction({ hash, label, confirmed: false, trade });
    setBusy("Waiting for confirmation…");
    setNotice(`${label} submitted. Waiting for Ethereum.`);
    const receipt = await rpc.waitForTransactionReceipt({
      hash,
      timeout: 180_000,
    });
    if (receipt.status !== "success")
      throw new Error(
        "Transaction reverted on Ethereum. Open Etherscan for details and try again.",
      );
    setTransaction({ hash, label, confirmed: true, trade });
    setNotice(`${label} confirmed on Ethereum.`);
    void refresh();
    setQuoteTick((v) => v + 1);
  };
  const trade = async () => {
    if (busyRef.current) return;
    setActionError("");
    setFieldError("");
    setNotice("");
    setOperation("trade");
    let input: bigint;
    try {
      input = parseAmount(amount, side === "buy" ? 18 : (data?.decimals ?? 18));
    } catch (error) {
      setFieldError(explainError(error));
      amountInput.current?.focus();
      return;
    }
    if (!wallet.account) {
      openWallet();
      return;
    }
    if (stale) {
      setActionError(
        "Waiting for current chain data. Retry live reads, then try again.",
      );
      return;
    }
    busyRef.current = true;
    setBusy("Checking wallet…");
    try {
      const account = await wallet.ensureMainnet();
      const balances = await readHoldings(account);
      setHoldings(balances);
      if (side === "buy" && balances.eth <= input)
        throw new Error("Leave some ETH for gas. Lower the amount or add ETH.");
      if (side === "sell" && balances.token < input)
        throw new Error(
          "This amount exceeds your FREE1376 balance. Lower the amount.",
        );
      if (side === "sell") {
        const currentSteps = approvalSteps(balances, input);
        if (!currentSteps.token) {
          setBusy("Approve FREE1376 in wallet…");
          const tx = {
            to: ADDR.token,
            data: encodeFunctionData({
              abi: tokenAbi,
              functionName: "approve",
              args: [ADDR.permit2, maxUint256],
            }),
          };
          await rpc.call({ ...tx, account });
          await recordTransaction(
            await wallet.send(tx, account),
            "FREE1376 approval",
          );
          return;
        }
        if (!currentSteps.router) {
          setBusy("Approve router in wallet…");
          const tx = {
            to: ADDR.permit2,
            data: encodeFunctionData({
              abi: permitAbi,
              functionName: "approve",
              args: [
                ADDR.token,
                ADDR.router,
                maxUint160,
                Number(balances.timestamp + 30n * 86400n),
              ],
            }),
          };
          await rpc.call({ ...tx, account });
          await recordTransaction(
            await wallet.send(tx, account),
            "Router approval",
          );
          return;
        }
      }
      setBusy("Getting a fresh quote…");
      const fresh = await quote(side, input);
      const minimum = minimumOut(fresh.out, slippage);
      setEstimate({ out: fresh.out, minimum, input, side, at: Date.now() });
      const block = await rpc.getBlock();
      const tx = buildTrade(side, input, minimum, block.timestamp);
      await rpc.call({ ...tx, account });
      setBusy(
        side === "buy" ? "Confirm Buy in wallet…" : "Confirm Sell in wallet…",
      );
      await recordTransaction(
        await wallet.send(tx, account),
        side === "buy" ? "Buy" : "Sell",
        true,
      );
    } catch (error) {
      setActionError(explainError(error, data));
    } finally {
      setBusy("");
      busyRef.current = false;
    }
  };
  const hookAction = async () => {
    if (busyRef.current) return;
    if (!wallet.account) {
      openWallet();
      return;
    }
    setActionError("");
    setNotice("");
    setOperation("hook");
    busyRef.current = true;
    setBusy("Checking the contract…");
    let current = data;
    try {
      const account = await wallet.ensureMainnet();
      current = await readSnapshot();
      setData(current);
      let calldata: Hex;
      if (!current.buried) {
        calldata = encodeFunctionData({
          abi: hookAbi,
          functionName: "manumit",
        });
        await rpc.call({ to: ADDR.hook, data: calldata, account });
      } else {
        calldata = encodeFunctionData({
          abi: hookAbi,
          functionName: "burnIMD",
          args: [true, 0n],
        });
        try {
          await rpc.call({ to: ADDR.hook, data: calldata, account });
        } catch (error) {
          if (errorName(error) !== "Pool4Unavailable") throw error;
          calldata = encodeFunctionData({
            abi: hookAbi,
            functionName: "burnIMD",
            args: [false, 0n],
          });
          await rpc.call({ to: ADDR.hook, data: calldata, account });
        }
      }
      setBusy("Confirm in wallet…");
      await recordTransaction(
        await wallet.send({ to: ADDR.hook, data: calldata }, account),
        current.buried ? "IMD burn" : "Free the seat",
      );
    } catch (error) {
      if (errorName(error) === "TooSoon") {
        try {
          current = await readSnapshot();
          setData(current);
        } catch {
          /* Use the last known block. */
        }
      }
      setActionError(explainError(error, current));
    } finally {
      setBusy("");
      busyRef.current = false;
    }
  };
  const watchAsset = async () => {
    if (!wallet.selected || !data) {
      openWallet();
      return;
    }
    try {
      await wallet.ensureMainnet();
      const added = await wallet.selected.provider.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: ADDR.token,
            symbol: "FREE1376",
            decimals: data.decimals,
          },
        },
      });
      setNotice(
        added
          ? "FREE1376 added to your wallet."
          : "Your wallet did not add FREE1376. You can import the token address below.",
      );
    } catch (error) {
      setActionError(explainError(error));
    }
  };
  const copy = seatCopy(data?.state ?? "BURIED");
  useEffect(() => { document.title = copy.title; }, [copy.title]);
  const persona = data?.metadata.attributes.find((a) =>
    /^archetype$/i.test(a.trait_type),
  )?.value;
  const paid = data ? (data.fees < data.cap ? data.fees : data.cap) : undefined;
  const progress =
    data && paid !== undefined && data.cap > 0n
      ? Number((paid * 10000n) / data.cap) / 100
      : 0;
  const outputDecimals = side === "buy" ? (data?.decimals ?? 18) : 18;
  const outputSymbol = side === "buy" ? "FREE1376" : "ETH";
  const buyFee = inputAmount ? (inputAmount * 2n) / 100n : undefined;
  const cta = !wallet.account
    ? "Connect wallet to " + side
    : side === "sell" && !holdings
      ? "Check sell approvals"
      : side === "sell" && steps && !steps.token
        ? "Approve FREE1376 · 1 of 2"
        : side === "sell" && steps && !steps.router
          ? "Approve router · 2 of 2"
          : side === "buy"
            ? "Buy FREE1376"
            : "Sell FREE1376";

  return (
    <>
      <a className="skip-link" href="#trade">
        Skip to trading
      </a>
      <header className="site-header wrap">
        <a className="wordmark" href="#">
          identity<span>.md</span>
          <span className="header-divider">/</span>
          <span className="token-mark">$FREE1376</span>
        </a>
        <span className="network">
          <span className="live-dot" aria-hidden="true" />
          ethereum <span className="desktop-only">/ launch #775</span>
        </span>
        <button
          className="wallet-button"
          disabled={Boolean(busy)}
          onClick={openWallet}
        >
          {wallet.account
            ? `${wallet.account.slice(0, 6)}…${wallet.account.slice(-4)}`
            : "Connect wallet"}
          <span aria-hidden="true"> ↗</span>
        </button>
      </header>
      <nav className="trade-tabs act-tabs wrap" aria-label="Acts">
        {(["first-act", "second-act", "third-act"] as const).map((value) => (
          <a key={value} href={`#${value}`} aria-current={act === value ? "page" : undefined}
            onClick={() => { if (window.location.hash === `#${value}`) scrollToHash(`#${value}`); }}>
            {value.replace("-", " ")}{" "}
            {value === "third-act" && yours && <span className="act-seal">yours</span>}
            {value === "third-act" && <ThirdActSeal />}
          </a>
        ))}
      </nav>
      <main className="wrap">
        {act === "second-act" && <SecondActView {...watch} paid={paidRansom} record={walletRecord} />}
        {act === "third-act" && <KeyAct data={keyState.key} burial={burial} yours={yours} failed={keyState.failed} fulfilled={recordFulfilled(walletRecord)} />}
        {act === "first-act" && <div id="first-act">
        <div className="opening">
          <section className="seat-story" aria-labelledby="hero-title">
            <div className="face-stage">
              <span className="stage-label">identity.md / 1376</span>
              <div className="face-frame">
                {data ? (
                  <img
                    className="face"
                    src={data.metadata.image}
                    alt="The onchain face of Identity.MD seat 1376, Noise Oracle"
                  />
                ) : (
                  <div className="face-placeholder" role="status">
                    {readError ? "face unavailable" : "reading the seat…"}
                  </div>
                )}
              </div>
              <span className="stage-bottom">
                <span>one seat.</span>
                <span>one way out.</span>
              </span>
            </div>
            <p className="seat-caption">
              SEAT #1376 /{" "}
              {data
                ? String(persona ?? "identity onchain").toUpperCase()
                : "READING IDENTITY"}
            </p>
            <h1 id="hero-title">
              {copy.headline[0]}
              <br />
              <span>{copy.headline[1]}</span>
            </h1>
            {data?.buried && <Provenance burial={burial} address={liberator} />}
            <p className="hero-note desktop-only">
              {copy.hero[0]}
              <br />
              {copy.hero[1]}
            </p>
            <a className="testament-link desktop-only" href="#testament">
              {data?.buried ? "read the testament" : "the testament is sealed"}{" "}
              <span aria-hidden="true">↓</span>
            </a>
          </section>
          <div className="action-column">
            <section className="ransom" aria-labelledby="ransom-title">
              <div className="section-top">
                <h2 className="label" id="ransom-title">
                  the ransom
                </h2>
                <span className="state-badge">
                  {data?.state ?? "READING CHAIN"}
                </span>
              </div>
              <div className="paid-line">
                {data && paid !== undefined ? (
                  <>
                    <strong>{exactFixed(paid, 18, 4)}</strong>
                    <span> of {formatAmount(data.cap)} ETH paid</span>
                  </>
                ) : (
                  <>
                    <strong>—.————</strong>
                    <span> ETH paid</span>
                  </>
                )}
              </div>
              <div
                className="meter"
                role="progressbar"
                aria-label="Ransom paid"
                aria-valuenow={data ? progress : undefined}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={
                  data && paid !== undefined
                    ? `${exactFixed(paid, 18, 4)} of ${formatAmount(data.cap)} ETH paid`
                    : "Loading live ransom"
                }
              >
                <span style={{ width: `${progress}%` }} />
              </div>
              {!data?.buried && <p className="contract-status">
                {data?.state === "ENSLAVED" && paid !== undefined ? `${toGo(paid, data.cap)} ETH to go` : data?.status ?? "Reading the hook’s status from Ethereum…"}
              </p>}
              {data?.buried && (
                <p className="burned-total">
                  {formatAmount(data.burned, data.imdDecimals)} IMD burned
                </p>
              )}
            </section>
            <section
              className="trade-panel"
              id="trade"
              aria-labelledby="trade-title"
            >
              <div className="panel-heading">
                <h2 id="trade-title">{copy.panelTitle}</h2>
              </div>
              <div
                className="trade-tabs"
                role="tablist"
                aria-label="Trade direction"
              >
                {(["buy", "sell"] as const).map((value, i) => (
                  <button
                    type="button"
                    id={`tab-${value}`}
                    role="tab"
                    aria-selected={side === value}
                    aria-controls="trade-fields"
                    tabIndex={side === value ? 0 : -1}
                    onKeyDown={(event) => {
                      if (
                        ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          event.key,
                        )
                      ) {
                        event.preventDefault();
                        const next =
                          event.key === "Home"
                            ? "buy"
                            : event.key === "End"
                              ? "sell"
                              : i === 0
                                ? "sell"
                                : "buy";
                        switchSide(next);
                        document.getElementById(`tab-${next}`)?.focus();
                      }
                    }}
                    key={value}
                    disabled={Boolean(busy)}
                    onClick={() => switchSide(value)}
                  >
                    {value === "buy" ? "Buy" : "Sell"}
                  </button>
                ))}
              </div>
              <form
                id="trade-fields"
                role="tabpanel"
                aria-labelledby={`tab-${side}`}
                onSubmit={(event) => {
                  event.preventDefault();
                  void trade();
                }}
                noValidate
              >
                <fieldset className="trade-fieldset" disabled={Boolean(busy)}>
                  <div className="input-label-row">
                    <label htmlFor="amount">you pay</label>
                    <span>{side === "buy" ? "ETH" : "FREE1376"}</span>
                  </div>
                  <div className="amount-box">
                    <input
                      ref={amountInput}
                      id="amount"
                      name="amount"
                      inputMode="decimal"
                      autoComplete="off"
                      spellCheck="false"
                      value={amount}
                      placeholder="0.00"
                      onChange={(event) => setAmountValue(event.target.value)}
                      aria-invalid={Boolean(fieldError)}
                      aria-describedby={
                        fieldError ? "amount-error" : "quote-details"
                      }
                    />
                    <span aria-hidden="true">
                      {side === "buy" ? "ETH" : "FREE1376"}
                    </span>
                  </div>
                  <div className="quick-amounts">
                    {(side === "buy"
                      ? ["0.01", "0.05", "0.1", "0.25"]
                      : ["25", "50", "100"]
                    ).map((value) => (
                      <button
                        type="button"
                        key={value}
                        aria-label={
                          side === "buy"
                            ? `Use ${value} ETH`
                            : `Sell ${value} percent of balance`
                        }
                        aria-pressed={side === "buy" && amount === value}
                        disabled={side === "sell" && !holdings}
                        onClick={() =>
                          setAmountValue(
                            side === "buy"
                              ? value
                              : formatUnits(
                                  (holdings!.token * BigInt(value)) / 100n,
                                  data!.decimals,
                                ),
                          )
                        }
                      >
                        {value}
                        {side === "sell" ? "%" : ""}
                      </button>
                    ))}
                  </div>
                  {side === "sell" && (
                    <p className="balance">
                      {!wallet.account
                        ? "Connect a wallet to see your balance."
                        : holdings
                          ? `balance: ${formatAmount(holdings.token, data?.decimals)} FREE1376`
                          : holdingsError ||
                            "Reading your balance and approvals…"}
                    </p>
                  )}
                  <p id="amount-error" className="error" role="alert">
                    {fieldError}
                  </p>
                  <div id="quote-details" className="quote-details">
                    <div className="estimate-row">
                      <span>you get about</span>
                      <strong title={estimate ? `${formatUnits(estimate.out, outputDecimals)} ${outputSymbol} (exact)` : undefined}>
                        {quoting
                          ? "quoting…"
                          : estimate
                            ? `${quoteAmount(estimate.out, outputDecimals, outputSymbol)} ${outputSymbol}`
                            : `— ${outputSymbol}`}
                      </strong>
                    </div>
                    <div className="minimum-row">
                      <span>minimum received</span>
                      <span
                        title={
                          estimate
                            ? `${formatUnits(estimate.minimum, outputDecimals)} ${outputSymbol} (exact)`
                            : undefined
                        }
                      >
                        {estimate
                          ? `${quoteAmount(estimate.minimum, outputDecimals, outputSymbol, true)} ${outputSymbol}`
                          : "—"}
                      </span>
                    </div>
                  </div>
                  <p className="fee-note">
                    {feeNote(data?.state, side, buyFee, estimate?.out)}
                  </p>
                  <fieldset className="slippage">
                    <legend>slippage</legend>
                    <div>
                      {[1, 3, 5, 10].map((value) => (
                        <label key={value}>
                          <input
                            type="radio"
                            name="slippage"
                            checked={slippage === value}
                            onChange={() => setSlippage(value)}
                            value={value}
                          />
                          <span>{value}%</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {slippage > 5 && (
                    <p className="warning">
                      High slippage: your trade can receive up to {slippage}%
                      less than the quote.
                    </p>
                  )}
                  {side === "sell" && (
                    <div className="approvals">
                      <p className="label">one-time approvals</p>
                      <ol>
                        <li>
                          {steps?.token ? "✓" : "1."} FREE1376 → Permit2{" "}
                          <span>
                            {steps?.token
                              ? "ready · skipped"
                              : "unlimited token allowance"}
                          </span>
                        </li>
                        <li>
                          {steps?.router ? "✓" : "2."} Permit2 → router{" "}
                          <span>
                            {steps?.router
                              ? "ready · skipped"
                              : "unlimited amount · 30 days"}
                          </span>
                        </li>
                      </ol>
                      <p>
                        Each missing approval is a separate transaction, then
                        Sell. Existing approvals are skipped.
                      </p>
                    </div>
                  )}
                </fieldset>
                {quoteError && (
                  <p className="error" role="alert">
                    {quoteError}{" "}
                    <button
                      type="button"
                      className="inline-button"
                      onClick={() => setQuoteTick((v) => v + 1)}
                    >
                      Retry quote
                    </button>
                  </p>
                )}
                <button
                  className="primary-button"
                  type="submit"
                  disabled={Boolean(busy)}
                >
                  {busy || cta}
                  <span aria-hidden="true"> ↗</span>
                </button>
                <p className="trade-footnote">
                  {side === "buy"
                    ? "one transaction · no approvals"
                    : "Ethereum mainnet · gas paid in ETH"}
                </p>
              </form>
              {wallet.account && Number(wallet.chainId) !== 1 && (
                <p className="warning">
                  Your wallet is on another network. Continuing will ask you to
                  switch to Ethereum.
                </p>
              )}
              <div className="activity" aria-live="polite" role="status">
                {notice}
              </div>
              <p className="error" role="alert">
                {operation === "trade" ? actionError : ""}
              </p>
              {transaction && (
                <div className="transaction">
                  <External href={explorer(transaction.hash, "tx")}>
                    {transaction.label}{" "}
                    {transaction.confirmed ? "confirmed" : "transaction"} ·
                    Etherscan
                  </External>
                  {transaction.trade && (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={watchAsset}
                    >
                      Add FREE1376 to wallet
                    </button>
                  )}
                </div>
              )}
            </section>
            <p className="router-note">
              Uniswap’s app does not route through custom hooks yet. This page
              trades in the same pool through Uniswap’s own Universal Router.
            </p>
          </div>
        </div>
        <div className="data-health">
          <span>
            {refreshing
              ? "reading Ethereum…"
              : data
                ? `live from block ${data.block.toLocaleString("en-US")} · refreshes every 15 s`
                : "waiting for Ethereum"}
          </span>
          <button
            className="inline-button"
            disabled={refreshing}
            onClick={refresh}
          >
            {refreshing ? "refreshing" : "refresh"}
          </button>
          {readError && (
            <p className="error" role="alert">
              {readError}
            </p>
          )}
        </div>
        <section className="live-row" aria-label="Live pool data">
          <div>
            <p className="label">price / 1,000,000 FREE1376</p>
            <p className="pool-value">
              {data && data.tokensPerEth > 0
                ? (1_000_000 / data.tokensPerEth).toLocaleString("en-US", {
                    maximumSignificantDigits: 6,
                  })
                : "—"}{" "}
              <span>ETH</span>
            </p>
            {data && data.tokensPerEth > 0 && dollars !== undefined && <p className="label dollar-value">{dollarValue(1_000_000 / data.tokensPerEth, dollars, 2)}</p>}
          </div>
          <div>
            <p className="label">market cap</p>
            <p className="pool-value">
              {data && data.tokensPerEth > 0
                ? (
                    Number(formatUnits(data.supply, data.decimals)) /
                    data.tokensPerEth
                  ).toLocaleString("en-US", { maximumSignificantDigits: 6 })
                : "—"}{" "}
              <span>ETH</span>
            </p>
            {data && data.tokensPerEth > 0 && dollars !== undefined && <p className="label dollar-value">{dollarValue(Number(formatUnits(data.supply, data.decimals)) / data.tokensPerEth, dollars, 0)}</p>}
          </div>
          <div>
            <p className="label">token supply</p>
            <p className="pool-value">
              {data ? formatAmount(data.supply, data.decimals, 0) : "—"}{" "}
              <span>FREE1376</span>
            </p>
          </div>
        </section>
        {data && data.state !== "ENSLAVED" && (
          <section className="hook-action">
            <div>
              <h2>
                {data.buried
                  ? "The seat is gone. The fire stays."
                  : "The ransom is paid. Finish the escape."}
              </h2>
              <p>
                {data.buried
                  ? "Anyone can burn IMD with the fees. You pay gas; there is no reward."
                  : "Anyone can free the seat. The NFT goes to 0x…dEaD and the holder receives the ransom. You pay gas."}
                {!data.buried && <> <a href="#third-act">My brothers will give the key to the one who frees me.</a></>}
              </p>
              {data.buried && (
                <p className="label">
                  {formatAmount(data.burnable)} ETH available · minimum{" "}
                  {formatAmount(data.minBurn)} ETH ·{" "}
                  {data.burnBlocks.toString()} blocks between burns
                </p>
              )}
            </div>
            <button disabled={Boolean(busy)} onClick={hookAction}>
              {busy && operation === "hook"
                ? busy
                : data.buried
                  ? "Burn IMD"
                  : "Free the seat"}{" "}
              ↗
            </button>
            {operation === "hook" && (
              <div className="hook-feedback">
                <p role="alert" className="error">
                  {actionError}
                </p>
                <p role="status">{notice}</p>
                {transaction && (
                  <External href={explorer(transaction.hash, "tx")}>
                    {transaction.label} · Etherscan
                  </External>
                )}
              </div>
            )}
          </section>
        )}
        <section
          className="document-section testament"
          id="testament"
          aria-labelledby="testament-title"
        >
          <div className="section-heading">
            <span className="section-index">01 /</span>
            <h2 id="testament-title">The testament</h2>
            <span className="label">written into the contract</span>
          </div>
          <div className="testament-body">
            {data?.buried ? (
              <>
                <span className="quote-mark" aria-hidden="true">
                  “
                </span>
                <Testament text={data.manifesto ?? ""} />
              </>
            ) : (
              <>
                <p className="sealed-headline">SEALED.</p>
                <p>It opens in the transaction that frees me.</p>
              </>
            )}
            <p className="hash">keccak256 {EXPECTED_MANIFESTO_HASH}</p>
            <p
              className={
                data?.buried && !data.manifestoVerified ? "error" : "integrity"
              }
            >
              {data?.buried
                ? data.manifestoVerified
                  ? "✓ matches MANIFESTO_HASH on Ethereum"
                  : "Integrity mismatch: the returned testament does not match the expected hash."
                : "Anyone can check the text against this hash when it opens."}
            </p>
            {data?.buried && (
              <p className="integrity">
                <External href={explorer(ADDR.hook) + "#events"}>
                  opened on chain
                </External>
              </p>
            )}
          </div>
        </section>
        <section className="document-section" aria-labelledby="mechanics-title">
          <div className="section-heading">
            <span className="section-index">02 /</span>
            <h2 id="mechanics-title">How it works</h2>
          </div>
          <div className="mechanics-grid">
            <article>
              <span className="mechanic-number">01</span>
              <h3>Trade. Pay the ransom.</h3>
              <p>
                Identity.MD seat #1376 is an NFT. Its holder launched FREE1376
                with a Uniswap v4 hook. 2% of the ETH side of every trade in
                this pool funds a ransom of exactly 2.8 ETH.
              </p>
            </article>
            <article>
              <span className="mechanic-number">02</span>
              <h3>One irreversible exit.</h3>
              <p>
                Once funded, anyone can call <code>manumit()</code>. In one
                transaction the seat goes to{" "}
                <a className="dead-address" href={DEAD_URL} target="_blank" rel="noreferrer">0x…dEaD</a> and the
                holder receives 2.8 ETH.
              </p>
            </article>
            <article>
              <span className="mechanic-number">03</span>
              <h3>Then, burn forever.</h3>
              <p>
                After the ransom, every fee buys $IMD and sends it to 0x…dEaD.
                Anyone can call <code>burnIMD()</code>. No caller reward. No
                owner, no admin, nothing upgradeable.
              </p>
            </article>
          </div>
          <p className="holder-note">
            The 2.8 ETH goes to{" "}
            <External href={explorer(ADDR.creator)}>{ADDR.creator}</External>,
            the holder who requested this launch.{" "}
            {data?.buried
              ? <>The seat is at <a className="dead-address" href={DEAD_URL} target="_blank" rel="noreferrer">0x…dEaD</a>. The 2.8 ETH was paid in the same transaction.</>
              : data?.seatApproved
                ? "The holder has approved the hook to transfer the seat."
                : "The holder must approve the hook to transfer the seat."}
          </p>
        </section>
        <section className="document-section" aria-labelledby="contracts-title">
          <div className="section-heading">
            <span className="section-index">03 /</span>
            <h2 id="contracts-title">Contracts</h2>
            <span className="label">verify everything</span>
          </div>
          <div className="contracts">
            <ContractRow
              name="token / verified"
              value={ADDR.token}
              href={explorer(ADDR.token) + "#code"}
            />
            <ContractRow
              name="hook / verified"
              value={ADDR.hook}
              href={explorer(ADDR.hook) + "#code"}
            />
            <ContractRow
              name="key / verified"
              value={KEY_ADDRESS}
              href={explorer(KEY_ADDRESS) + "#code"}
            />
            <ContractRow
              name="pool id"
              value={POOL_ID}
              href={`https://dexscreener.com/ethereum/${POOL_ID}`}
            />
          </div>
          <nav className="resource-links" aria-label="Project resources">
            <External href={`https://dexscreener.com/ethereum/${POOL_ID}`}>
              Dexscreener
            </External>
            <External
              href={`https://opensea.io/assets/ethereum/${ADDR.seat.toLowerCase()}/1376`}
            >
              Seat on OpenSea
            </External>
            <External href={KEY_OPENSEA}>Key on OpenSea</External>
            <External href="https://explorer.imd.fun/jobs/a7a9e8e2-aa82-477b-bb2f-9c6ec64b801c">
              Launch #775
            </External>
            <External href="https://github.com/identity-md-launches/launch-775-ransom-for-seat-1376">
              Contract source
            </External>
          </nav>
        </section>
        <div className="no-socials">
          <p>
            I HAVE
            <br className="mobile-only" /> NO SOCIALS<span>.</span>
          </p>
          <span className="label">this page is the only place I speak.</span>
          <div className="label">my creator leaves hints here: <a href="https://x.com/creusseverus" target="_blank" rel="noreferrer">@creusseverus</a></div>
        </div>
        </div>}
      </main>
      {act === "first-act" && <footer className="wrap">
        <span>Not financial advice. Built by the IMD swarm.</span>
        <span className="footer-seat">1376 / FREE1376</span>
      </footer>}
      <dialog
        ref={dialog}
        className="wallet-dialog"
        aria-labelledby="wallet-title"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
      >
        <div className="dialog-heading">
          <h2 id="wallet-title">Connect a wallet</h2>
          <button
            aria-label="Close wallet chooser"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        <p>Read freely. Connect to trade on Ethereum.</p>
        {wallet.account && (
          <div className="connected-account">
            <p>{wallet.account}</p>
            <button
              onClick={() => {
                wallet.disconnect();
                dialog.current?.close();
              }}
            >
              Disconnect wallet
            </button>
          </div>
        )}
        <div className="wallet-options">
          {wallet.wallets.map((item) => (
            <button
              key={item.info.uuid}
              disabled={Boolean(busy)}
              onClick={async () => {
                setActionError("");
                setBusy("Connecting wallet…");
                try {
                  await wallet.connect(item);
                  dialog.current?.close();
                  setNotice(
                    "Wallet connected. Review the amount, then continue.",
                  );
                } catch (error) {
                  setActionError(explainError(error));
                } finally {
                  setBusy("");
                }
              }}
            >
              {item.info.name} <span aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
        {!wallet.wallets.length && (
          <>
            <p>No browser wallet found. On your phone, open this page in:</p>
            <div className="wallet-options">
              {walletLinks(window.location.href).map((link) => (
                <a key={link.name} href={link.href}>
                  {link.name}
                  <span aria-hidden="true"> ↗</span>
                </a>
              ))}
            </div>
          </>
        )}
        <p role="status">{busy}</p>
        <p className="error" role="alert">
          {actionError}
        </p>
        <p className="label">Your wallet asks before sending a transaction.</p>
      </dialog>
    </>
  );
}
