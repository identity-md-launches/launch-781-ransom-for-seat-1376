import { decodeFunctionResult } from "viem";
import { ADDR, POOL_ID, stateAbi, tokenAbi } from "./chain";
import { ETH_USD_FEED, feedAbi, freshDollars } from "./dollars";
import { DEAD, HIS_WALLET, NINE_WALLETS, type WatchSnapshot } from "./watch";
import {
  batchBlock,
  blockCalls,
  contractCall,
  liveBatch,
  required,
  type LiveCaller,
} from "./liveBatch";

export async function readBatchedWatch(
  call?: LiveCaller,
): Promise<WatchSnapshot> {
  const owners = [...NINE_WALLETS, HIS_WALLET, DEAD];
  const calls = [
    ...owners.map((owner) =>
      contractCall(ADDR.token, tokenAbi, "balanceOf", [owner]),
    ),
    contractCall(ADDR.token, tokenAbi, "totalSupply"),
    contractCall(ADDR.stateView, stateAbi, "getSlot0", [POOL_ID]),
    contractCall(ETH_USD_FEED, feedAbi, "latestRoundData"),
    ...blockCalls(),
  ];
  const results = await liveBatch(calls, call);
  const balances = owners.map((_, i) =>
    decodeFunctionResult({
      abi: tokenAbi,
      functionName: "balanceOf",
      data: required(results, i),
    }),
  );
  const supply = decodeFunctionResult({
    abi: tokenAbi,
    functionName: "totalSupply",
    data: required(results, 11),
  });
  const [sqrtPriceX96] = decodeFunctionResult({
    abi: stateAbi,
    functionName: "getSlot0",
    data: required(results, 12),
  });
  const round = decodeFunctionResult({
    abi: feedAbi,
    functionName: "latestRoundData",
    data: required(results, 13),
  });
  const block = batchBlock(results);
  if (
    sqrtPriceX96 <= 0n ||
    round[4] < round[0] ||
    freshDollars({ answer: round[1], updatedAt: round[3] }) === undefined
  )
    throw Error("Watch price unavailable");
  return {
    block: block.number,
    timestamp: block.timestamp,
    balances: balances.slice(0, 9),
    main: balances[9],
    dead: balances[10],
    supply,
    sqrtPriceX96,
    ethUsd: round[1],
  };
}
