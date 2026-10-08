import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  http,
  parseAbi,
  parseAbiItem,
} from "viem";
import { mainnet } from "viem/chains";
import { ADDR, POOL_ID, quoteAbi, stateAbi, tokenAbi } from "./chain";
import { feedAbi, freshDollars } from "./dollars";
import { aggregateAbi, marketCalls, MULTICALL3 } from "./paidReads";
import { sellAmount, type SellReading } from "./paid";
import { HIS_WALLET } from "./watch";
import type { PoolSwap } from "./swapTape";

export const POOL_MANAGER = "0x000000000004444c5dc75cB358380D2e3dE08A90";
export const SWAP_EVENT = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
);
export const blockInfoAbi = parseAbi([
  "function getBlockNumber() view returns (uint256)",
  "function getCurrentBlockTimestamp() view returns (uint256)",
]);
const makeClient = (url: string) =>
  createPublicClient({
    chain: mainnet,
    transport: http(url, { timeout: 9000, retryCount: 0 }),
  });
export const swapRpc = makeClient("https://ethereum-rpc.publicnode.com");
export const swapArchive = makeClient("https://eth.drpc.org");

// Balance must be known before encoding the quoter's input. Repeat it inside the
// single market aggregate and reject a race, so a partial sale cannot overquote.
export async function readSwapMeter(
  block?: bigint,
  client = block === undefined ? swapRpc : swapArchive,
): Promise<SellReading> {
  const at =
    block === undefined
      ? { blockTag: "latest" as const }
      : { blockNumber: block };
  const balanceCall = {
    target: ADDR.token,
    allowFailure: false,
    callData: encodeFunctionData({
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [HIS_WALLET],
    }),
  };
  const balance = await client.readContract({
    address: ADDR.token,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [HIS_WALLET],
    ...at,
  });
  const amount = sellAmount(balance);
  const market = marketCalls(amount);
  const calls = [
    ...(amount === 0n ? market.slice(1) : market),
    balanceCall,
    ...(["getBlockNumber", "getCurrentBlockTimestamp"] as const).map(
      (functionName) => ({
        target: MULTICALL3 as `0x${string}`,
        allowFailure: false,
        callData: encodeFunctionData({ abi: blockInfoAbi, functionName }),
      }),
    ),
  ];
  const response = await client.call({
    to: MULTICALL3,
    ...at,
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
  if (results.length !== calls.length || results.some((r) => !r.success))
    throw Error("Incomplete aggregate");
  const data = results.map((r) => r.returnData);
  const out =
    amount === 0n
      ? 0n
      : decodeFunctionResult({
          abi: quoteAbi,
          functionName: "quoteExactInputSingle",
          data: data.shift()!,
        })[0];
  const [sqrt] = decodeFunctionResult({
    abi: stateAbi,
    functionName: "getSlot0",
    data: data[0],
  });
  const [round, answer, , updatedAt, answered] = decodeFunctionResult({
    abi: feedAbi,
    functionName: "latestRoundData",
    data: data[1],
  });
  const supply = decodeFunctionResult({
    abi: tokenAbi,
    functionName: "totalSupply",
    data: data[2],
  });
  const confirmedBalance = decodeFunctionResult({
    abi: tokenAbi,
    functionName: "balanceOf",
    data: data[3],
  });
  const number = decodeFunctionResult({
    abi: blockInfoAbi,
    functionName: "getBlockNumber",
    data: data[4],
  });
  const timestamp = decodeFunctionResult({
    abi: blockInfoAbi,
    functionName: "getCurrentBlockTimestamp",
    data: data[5],
  });
  const dollars = freshDollars({ answer, updatedAt }, Number(timestamp) * 1000);
  if (
    sellAmount(confirmedBalance) !== amount ||
    sqrt <= 0n ||
    dollars === undefined ||
    answered < round ||
    (block !== undefined && number !== block) ||
    (amount > 0n && out <= 0n)
  )
    throw Error("Market data unavailable");
  const marketCap =
    (Number(formatUnits(supply, 18)) / (Number(sqrt) / 2 ** 96) ** 2) * dollars;
  if (!Number.isFinite(marketCap)) throw Error("Market data unavailable");
  return {
    block: number,
    timestamp,
    out,
    marketCap,
    balance: confirmedBalance,
    amount,
  };
}
export async function readPoolSwaps(
  fromBlock: bigint,
  toBlock: bigint,
): Promise<PoolSwap[]> {
  const logs = await swapRpc.getLogs({
    address: POOL_MANAGER,
    event: SWAP_EVENT,
    args: { id: POOL_ID },
    fromBlock,
    toBlock,
    strict: true,
  });
  return logs
    .filter((log) => !log.removed && log.args.amount0 !== 0n)
    .map((log) => ({
      id: `${log.blockHash}:${log.logIndex}`,
      block: log.blockNumber,
      logIndex: log.logIndex,
      transaction: log.transactionHash,
      amount0: log.args.amount0,
      amount1: log.args.amount1,
    }));
}
export const swapSource = {
  latest: () => swapRpc.getBlockNumber({ cacheTime: 0 }),
  logs: readPoolSwaps,
  meter: readSwapMeter,
  timestamp: async (block: bigint) =>
    (await swapRpc.getBlock({ blockNumber: block })).timestamp,
};
export type SwapSource = typeof swapSource;
