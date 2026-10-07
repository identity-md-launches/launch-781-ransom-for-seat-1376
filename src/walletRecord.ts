import { decodeEventLog, parseAbiItem, type Hex } from "viem";
import { ADDR } from "./chain";
import { PAID_START, sellAmount, type PaidBlock } from "./paid";
import { CASH_OUT, HIS_WALLET } from "./watch";

export const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
export type BalanceChange = { block: bigint; before: bigint; after: bigint };
export type RecordReceipt = {
  from: string;
  transactionHash: Hex;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  logs: readonly { address: string; topics: readonly Hex[]; data: Hex }[];
};
export type WalletChange = BalanceChange & {
  timestamp: bigint;
  kind: "sale" | "move" | "buy" | "gift";
  proceeds: bigint;
  transaction?: Hex;
};
export type WalletRecord = {
  through: bigint;
  balance: bigint;
  changes: WalletChange[];
  firstDecreaseAllowed?: boolean;
  firstDecreaseQuote?: bigint;
};
export type RecordState = {
  data?: WalletRecord;
  pending: boolean;
  failed: boolean;
};
export const initialRecordState: RecordState = { pending: true, failed: false };
export type RecordSource = {
  latest: () => Promise<PaidBlock>;
  block: (number: bigint) => Promise<PaidBlock>;
  balance: (block: bigint) => Promise<bigint>;
  receipts: (block: bigint) => Promise<readonly RecordReceipt[]>;
  eth: (block: bigint) => Promise<bigint>;
  quote: (block: bigint, amount: bigint) => Promise<bigint>;
};

// Equal endpoints finish a range immediately; exact cancellations are invisible.
// Only differing endpoints are bisected down to adjacent block states.
export async function findBalanceChanges(
  before: bigint,
  end: bigint,
  balance: RecordSource["balance"],
): Promise<BalanceChange[]> {
  const cache = new Map<bigint, Promise<bigint>>();
  const read = (block: bigint) => {
    if (!cache.has(block)) cache.set(block, balance(block));
    return cache.get(block)!;
  };
  const changes: BalanceChange[] = [];
  async function split(low: bigint, high: bigint): Promise<void> {
    if (low >= high) return;
    const [a, b] = await Promise.all([read(low), read(high)]);
    if (a === b) return;
    if (high - low === 1n) {
      changes.push({ block: high, before: a, after: b });
      return;
    }
    const middle = (low + high) / 2n;
    await split(low, middle);
    await split(middle, high);
  }
  await split(before, end);
  return changes;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export function walletTransfers(receipt: RecordReceipt) {
  return receipt.logs.flatMap((log) => {
    if (!same(log.address, ADDR.token)) return [];
    try {
      const { args } = decodeEventLog({
        abi: [transferEvent],
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      return args.value > 0n ? [args] : [];
    } catch {
      return [];
    }
  });
}

export async function extendWalletRecord(
  source: RecordSource,
  previous?: WalletRecord,
): Promise<WalletRecord> {
  const latest = await source.latest();
  const start = previous?.through ?? PAID_START - 1n;
  if (previous && latest.number <= start) return previous;
  const balance = await source.balance(latest.number);
  const changes = await findBalanceChanges(start, latest.number, (block) =>
    block === latest.number ? Promise.resolve(balance) : source.balance(block),
  );
  const result: WalletRecord = {
    through: latest.number,
    balance,
    changes: [...(previous?.changes ?? [])],
    firstDecreaseAllowed: previous?.firstDecreaseAllowed,
    firstDecreaseQuote: previous?.firstDecreaseQuote,
  };
  for (const change of changes) {
    const [block, receipts, ethBefore, ethAfter] = await Promise.all([
      source.block(change.block),
      source.receipts(change.block),
      source.eth(change.block - 1n),
      source.eth(change.block),
    ]);
    let kind: WalletChange["kind"];
    let proceeds = 0n;
    let transaction: Hex | undefined;
    if (change.after < change.before) {
      if (result.firstDecreaseAllowed === undefined) {
        result.firstDecreaseQuote = await source.quote(
          change.block - 1n,
          sellAmount(change.before),
        );
        result.firstDecreaseAllowed = result.firstDecreaseQuote >= CASH_OUT;
      }
      const gas = receipts
        .filter((receipt) => same(receipt.from, HIS_WALLET))
        .reduce(
          (sum, receipt) => sum + receipt.gasUsed * receipt.effectiveGasPrice,
          0n,
        );
      const gain = ethAfter - ethBefore + gas;
      kind = gain > 0n ? "sale" : "move";
      proceeds = gain > 0n ? gain : 0n;
      const outgoing = receipts.filter((receipt) =>
        walletTransfers(receipt).some(
          (transfer) =>
            same(transfer.from, HIS_WALLET) && !same(transfer.to, HIS_WALLET),
        ),
      );
      transaction = (
        outgoing.find((receipt) => same(receipt.from, HIS_WALLET)) ??
        outgoing[0]
      )?.transactionHash;
      if (!transaction) throw Error("Missing outgoing transfer receipt");
    } else {
      const ownBuy = receipts.find(
        (receipt) =>
          same(receipt.from, HIS_WALLET) &&
          walletTransfers(receipt).some(
            (transfer) =>
              same(transfer.to, HIS_WALLET) && !same(transfer.from, HIS_WALLET),
          ),
      );
      kind = ownBuy ? "buy" : "gift";
      transaction = ownBuy?.transactionHash;
    }
    result.changes.push({
      ...change,
      timestamp: block.timestamp,
      kind,
      proceeds,
      transaction,
    });
  }
  return result;
}

export const recordHasBuy = (record?: WalletRecord) =>
  !!record?.changes.some((change) => change.kind === "buy");
export const recouped = (record?: WalletRecord) =>
  record?.changes.reduce((sum, change) => sum + change.proceeds, 0n) ?? 0n;
export const recordFulfilled = (state: RecordState) =>
  !!state.data &&
  !state.pending &&
  !state.failed &&
  !recordHasBuy(state.data) &&
  state.data.firstDecreaseAllowed !== false &&
  recouped(state.data) >= CASH_OUT;
export function recordOfferRules(state: RecordState) {
  const known = !!state.data && !state.pending && !state.failed;
  const bought = !known
    ? "—"
    : recordHasBuy(state.data)
      ? "✗ HE BOUGHT AGAIN."
      : "✓";
  const sold = !known
    ? "—"
    : state.data?.firstDecreaseAllowed === false
      ? "✗ HE SOLD EARLY."
      : "✓";
  return [
    `1. keeps only the 12.16M · ${bought}`,
    `2. never buys again · ${bought}`,
    `3. sells nothing before he may · ${sold}`,
  ];
}
