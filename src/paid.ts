import { hourGrid } from "./chartSampling";
import { CASH_OUT, M0, watchVerdicts, type WatchSnapshot } from "./watch";

export const PAID_START = 26139700n;
export type PaidBlock = { number: bigint; timestamp: bigint };
export type SellPoint = {
  block: bigint;
  timestamp: bigint;
  out: bigint;
  marketCap: number;
};
export type SellReading = SellPoint & { balance: bigint; amount: bigint };
export type PaidHistory = { paid?: PaidBlock; points: SellPoint[] };
export type PaidState = {
  initialSettled?: boolean;
  history?: PaidHistory;
  live?: SellReading;
  historyPending: boolean;
  historyFailed: boolean;
  liveFailed: boolean;
};
export const initialPaidState: PaidState = {
  historyPending: true,
  historyFailed: false,
  liveFailed: false,
};

export const secondRansomPaid = (data?: WatchSnapshot, paid?: PaidBlock) =>
  !!paid || (!!data && watchVerdicts(data).includes("BURNED. ALL OF IT."));
export const sellAmount = (balance: bigint) => (balance < M0 ? balance : M0);
export const maySell = (out: bigint) => out >= CASH_OUT;
export const sellPercentage = (out: bigint) =>
  (Number(out) / Number(CASH_OUT)) * 100;
export const paidTime = (timestamp: bigint) =>
  new Date(Number(timestamp) * 1000)
    .toISOString()
    .replace("T", ", ")
    .replace(".000Z", " UTC");
export const marketDollars = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 0 });

export { recordOfferRules as offerRules } from "./walletRecord";

// The live head has its own slot; historical samples stay on burn + k hours.
export function chartTimes(start: bigint, end: bigint): bigint[] {
  if (end <= start) return [start];
  return [
    ...hourGrid(start, end)
      .map((k) => start + k * 3600n)
      .filter((t) => t < end),
    end,
  ];
}

export function chartPoints(history: readonly SellPoint[], live?: SellReading) {
  if (!live) return history.slice(-48);
  return [
    ...history.filter((point) => point.block < live.block).slice(-47),
    live,
  ];
}
