import {
  decodeFunctionResult,
  encodeFunctionData,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { aggregateAbi, MULTICALL3 } from "./paidReads";
import { blockInfoAbi, swapRpc } from "./swapReads";

export type LiveCall = {
  target: Address;
  allowFailure: boolean;
  callData: Hex;
};
export type LiveCaller = (request: {
  to: Address;
  data: Hex;
  blockTag: "latest";
}) => Promise<{ data?: Hex }>;
export const contractCall = (
  target: Address,
  abi: Abi,
  functionName: string,
  args?: readonly unknown[],
): LiveCall => ({
  target,
  allowFailure: true,
  callData: encodeFunctionData({ abi, functionName, args }),
});
export const blockCalls = () =>
  (["getBlockNumber", "getCurrentBlockTimestamp"] as const).map((name) =>
    contractCall(MULTICALL3, blockInfoAbi, name),
  );
export async function liveBatch(
  calls: LiveCall[],
  call: LiveCaller = (request) => swapRpc.call(request),
) {
  const response = await call({
    to: MULTICALL3,
    blockTag: "latest",
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
  if (results.length !== calls.length) throw Error("Incomplete aggregate");
  return results;
}
export function required(
  results: Awaited<ReturnType<typeof liveBatch>>,
  index: number,
): Hex {
  const result = results[index];
  if (!result?.success) throw Error("Incomplete aggregate");
  return result.returnData;
}
export function batchBlock(results: Awaited<ReturnType<typeof liveBatch>>) {
  return {
    number: decodeFunctionResult({
      abi: blockInfoAbi,
      functionName: "getBlockNumber",
      data: required(results, results.length - 2),
    }),
    timestamp: decodeFunctionResult({
      abi: blockInfoAbi,
      functionName: "getCurrentBlockTimestamp",
      data: required(results, results.length - 1),
    }),
  };
}
