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

// Reserve the final slot for the live reading, including in the 48th hour.
export function chartTimes(start: bigint, end: bigint): bigint[] {
  if (end <= start) return [start];
  const elapsed = end - start;
  if (elapsed >= 48n * 3600n)
    return Array.from(
      { length: 48 },
      (_, i) => start + (elapsed * BigInt(i)) / 47n,
    );
  const times: bigint[] = [];
  for (let time = start; time < end && times.length < 47; time += 3600n)
    times.push(time);
  return [...times, end];
}

export function chartPoints(history: readonly SellPoint[], live?: SellReading) {
  if (!live) return history.slice(-48);
  return [
    ...history.filter((point) => point.block < live.block).slice(-47),
    live,
  ];
}
