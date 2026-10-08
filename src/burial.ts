import { getAddress, numberToHex, type Hex } from "viem";
import { ADDR, hookAbi } from "./chain";

export const BURIAL_START = 26130900n;
export const CREATOR_PAID =
  "0x12f457cfb647c80d6e273e6691a31625fd025906b82c043614fbff887aea5666";
// Historical state must never fall back to PublicNode.
import { latestReads, pastReads } from "./readPools";
export const archiveRpc = pastReads;
export const burialSource = {
  latest: () => latestReads.getBlockNumber({ cacheTime: 0 }),
  buried: (blockNumber: bigint) =>
    archiveRpc.readContract({
      address: ADDR.hook,
      abi: hookAbi,
      functionName: "buried",
      blockNumber,
    }),
  receipts: (blockNumber: bigint) =>
    archiveRpc.request<{
      Method: "eth_getBlockReceipts";
      Parameters: [Hex];
      ReturnType: Awaited<ReturnType<BurialSource["receipts"]>>;
    }>({ method: "eth_getBlockReceipts", params: [numberToHex(blockNumber)] }),
  block: (blockNumber: bigint) => archiveRpc.getBlock({ blockNumber }),
};
export type BurialSource = {
  latest(): Promise<bigint>;
  buried(block: bigint): Promise<boolean>;
  receipts(block: bigint): Promise<
    readonly {
      from: string;
      transactionHash: Hex;
      logs: readonly { address: string; topics: readonly (string | null)[] }[];
    }[]
  >;
  block(block: bigint): Promise<{ timestamp: bigint }>;
};
export type Burial = {
  sender: string;
  transaction: Hex;
  timestamp: bigint;
  block: bigint;
};

export async function findBurial(
  source: BurialSource = burialSource,
): Promise<Burial> {
  let low = BURIAL_START;
  let high = await source.latest();
  if (high < low || !(await source.buried(high)))
    throw new Error("Burial unavailable");
  while (low < high) {
    const mid = low + (high - low) / 2n;
    if (await source.buried(mid)) high = mid;
    else low = mid + 1n;
  }
  const [receipts, block] = await Promise.all([
    source.receipts(low),
    source.block(low),
  ]);
  const receipt = receipts.find((r) =>
    r.logs.some(
      (log) =>
        log.address.toLowerCase() === ADDR.hook.toLowerCase() &&
        log.topics[0]?.toLowerCase() === CREATOR_PAID,
    ),
  );
  if (!receipt) throw new Error("Burial receipt unavailable");
  return {
    sender: getAddress(receipt.from),
    transaction: receipt.transactionHash,
    timestamp: block.timestamp,
    block: low,
  };
}

// One attempt per document visit, shared across acts and concurrent subscribers.
export function burialForVisit(source: BurialSource = burialSource) {
  let result: Promise<Burial | undefined> | undefined;
  return () => (result ??= findBurial(source).catch(() => undefined));
}
export const readBurial = burialForVisit();

export function elapsedSince(timestamp: bigint, now = Date.now()) {
  const minutes = Math.max(
    0,
    Math.floor((now / 1000 - Number(timestamp)) / 60),
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24
    ? `${hours}h ${minutes % 60}m`
    : `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
export function burialDate(timestamp: bigint) {
  const date = new Date(Number(timestamp) * 1000);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")} UTC`;
}
export function shortAddress(address: string) {
  const checksum = getAddress(address);
  return `${checksum.slice(0, 6)}…${checksum.slice(-4)}`;
}
export function liberatorAddress(
  burial?: Burial,
  key?: { given: boolean; liberator?: string },
) {
  // A given key is authoritative: do not substitute the receipt if its read failed.
  return key?.given ? key.liberator : burial?.sender;
}
