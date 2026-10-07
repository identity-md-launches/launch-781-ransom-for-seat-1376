import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";
import {
  ADDR,
  POOL_ID,
  POOL_KEY,
  quoteAbi,
  rpc,
  stateAbi,
  tokenAbi,
} from "./chain";
import { ETH_USD_FEED, feedAbi, freshDollars } from "./dollars";
import { burnedAt } from "./burnReads";
import { findBurnPaidBlock } from "./burnHistory";
import { HIS_WALLET, M0, NINE_WALLETS } from "./watch";
import {
  chartTimes,
  sellAmount,
  type PaidBlock,
  type PaidHistory,
  type SellPoint,
  type SellReading,
} from "./paid";

export const ARCHIVE_URL = "https://eth.drpc.org";
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
export const aggregateAbi = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
]);
export const archive = createPublicClient({
  chain: mainnet,
  transport: http(ARCHIVE_URL, { timeout: 15_000, retryCount: 1 }),
});
type Call = { target: Address; allowFailure: boolean; callData: Hex };
export type ArchiveCall = (request: {
  to: Address;
  data: Hex;
  blockNumber: bigint;
}) => Promise<{ data?: Hex }>;

export async function aggregateAt(
  blockNumber: bigint,
  calls: Call[],
  call: ArchiveCall = (request) => archive.call(request),
) {
  const response = await call({
    to: MULTICALL3,
    blockNumber,
    data: encodeFunctionData({
      abi: aggregateAbi,
      functionName: "aggregate3",
      args: [calls],
    }),
  });
  if (!response.data) throw Error("No aggregate returned");
  const results = decodeFunctionResult({
    abi: aggregateAbi,
    functionName: "aggregate3",
    data: response.data,
  });
  if (
    results.length !== calls.length ||
    results.some((result) => !result.success)
  )
    throw Error("Incomplete aggregate");
  return results.map((result) => result.returnData);
}

const balanceCall = (owner: Address): Call => ({
  target: ADDR.token,
  allowFailure: true,
  callData: encodeFunctionData({
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [owner],
  }),
});
export async function nineTotal(block: bigint, call?: ArchiveCall) {
  const results = await aggregateAt(block, NINE_WALLETS.map(balanceCall), call);
  return results.reduce(
    (total, data) =>
      total +
      decodeFunctionResult({ abi: tokenAbi, functionName: "balanceOf", data }),
    0n,
  );
}

// The fourth entry supplies the actual totalSupply at this block, including supply burns.
// CALL (not STATICCALL) permits the v4 quoter's reverted swap simulation.
export function marketCalls(amount: bigint): Call[] {
  return [
    {
      target: ADDR.quoter,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: quoteAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            poolKey: POOL_KEY,
            zeroForOne: false,
            exactAmount: amount,
            hookData: "0x",
          },
        ],
      }),
    },
    {
      target: ADDR.stateView,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: stateAbi,
        functionName: "getSlot0",
        args: [POOL_ID],
      }),
    },
    {
      target: ETH_USD_FEED,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: feedAbi,
        functionName: "latestRoundData",
      }),
    },
    {
      target: ADDR.token,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: tokenAbi,
        functionName: "totalSupply",
      }),
    },
  ];
}

export async function readSellPoint(
  block: PaidBlock,
  amount = M0,
  call?: ArchiveCall,
): Promise<SellPoint> {
  // A zero bag has zero proceeds; a zero-amount v4 swap would revert.
  const calls = marketCalls(amount);
  const values = await aggregateAt(
    block.number,
    amount === 0n ? calls.slice(1) : calls,
    call,
  );
  const out =
    amount === 0n
      ? 0n
      : decodeFunctionResult({
          abi: quoteAbi,
          functionName: "quoteExactInputSingle",
          data: values.shift()!,
        })[0];
  const [sqrtPriceX96] = decodeFunctionResult({
    abi: stateAbi,
    functionName: "getSlot0",
    data: values[0],
  });
  const [roundId, answer, , updatedAt, answeredInRound] = decodeFunctionResult({
    abi: feedAbi,
    functionName: "latestRoundData",
    data: values[1],
  });
  const supply = decodeFunctionResult({
    abi: tokenAbi,
    functionName: "totalSupply",
    data: values[2],
  });
  // Historical freshness is relative to that block, never the visitor's clock.
  const dollars = freshDollars(
    { answer, updatedAt },
    Number(block.timestamp) * 1000,
  );
  if (
    sqrtPriceX96 <= 0n ||
    dollars === undefined ||
    answeredInRound < roundId ||
    (amount > 0n && out <= 0n)
  )
    throw Error("Market data unavailable");
  const tokensPerEth = (Number(sqrtPriceX96) / 2 ** 96) ** 2;
  const marketCap = (Number(formatUnits(supply, 18)) / tokensPerEth) * dollars;
  if (!Number.isFinite(marketCap)) throw Error("Market data unavailable");
  return { block: block.number, timestamp: block.timestamp, out, marketCap };
}

export type LiveSource = {
  latest: () => Promise<PaidBlock>;
  balance: (block: bigint) => Promise<bigint>;
  point: (block: PaidBlock, amount: bigint) => Promise<SellPoint>;
};
export const liveSource: LiveSource = {
  latest: () => rpc.getBlock(),
  balance: (blockNumber) =>
    archive.readContract({
      address: ADDR.token,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [HIS_WALLET],
      blockNumber,
    }),
  point: readSellPoint,
};
export async function readLiveSell(source = liveSource): Promise<SellReading> {
  const block = await source.latest();
  const balance = await source.balance(block.number);
  const amount = sellAmount(balance);
  return { ...(await source.point(block, amount)), balance, amount };
}

export type HistorySource = {
  latest: () => Promise<PaidBlock>;
  block: (number: bigint) => Promise<PaidBlock>;
  total: (number: bigint) => Promise<bigint>;
  burned: (number: bigint) => Promise<bigint>;
  point: (block: PaidBlock) => Promise<SellPoint>;
};
export const historySource: HistorySource = {
  latest: () => archive.getBlock(),
  block: (blockNumber) => archive.getBlock({ blockNumber }),
  total: nineTotal,
  burned: burnedAt,
  point: (block) => readSellPoint(block, M0),
};

export const findPaidBlock = findBurnPaidBlock;

// Find the last block at/before the requested UTC hour. Interpolation avoids
// hundreds of header requests on Ethereum's approximately twelve-second slots;
// the shrinking bounds keep the result exact even across missed slots.
export async function blockAtTime(
  target: bigint,
  start: PaidBlock,
  end: PaidBlock,
  read: HistorySource["block"],
): Promise<PaidBlock> {
  if (target <= start.timestamp) return start;
  if (target >= end.timestamp) return end;
  let low = start,
    high = end,
    attempts = 0;
  while (high.number - low.number > 1n) {
    const span = high.number - low.number;
    const estimate =
      attempts++ < 8
        ? low.number +
          (span * (target - low.timestamp)) / (high.timestamp - low.timestamp)
        : (low.number + high.number) / 2n;
    const number =
      estimate <= low.number
        ? low.number + 1n
        : estimate >= high.number
          ? high.number - 1n
          : estimate;
    const block = await read(number);
    if (block.timestamp === target) return block;
    if (block.timestamp < target) low = block;
    else high = block;
  }
  return low;
}

export async function readPaidHistory(
  source = historySource,
  onPaid?: (paid: PaidBlock) => void,
): Promise<PaidHistory> {
  const latest = await source.latest();
  const paid = await findPaidBlock(latest, source);
  if (!paid) return { points: [] };
  onPaid?.(paid);
  const headers = new Map<bigint, Promise<PaidBlock>>();
  const block = (number: bigint) => {
    if (!headers.has(number)) headers.set(number, source.block(number));
    return headers.get(number)!;
  };
  const points: SellPoint[] = [];
  const seen = new Set<bigint>();
  const times = chartTimes(paid.timestamp, latest.timestamp);
  // Keep the origin even when payment happens in this visit's latest block;
  // otherwise later live polls would replace the chart's only starting point.
  for (const time of times.length === 1 ? times : times.slice(0, -1)) {
    try {
      const at = await blockAtTime(time, paid, latest, block);
      if (seen.has(at.number)) continue;
      seen.add(at.number);
      points.push(await source.point(at));
    } catch {
      // One unavailable historical block must not hide the other samples.
    }
  }
  return { paid, points };
}
