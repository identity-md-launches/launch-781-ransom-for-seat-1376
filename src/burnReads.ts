import { decodeFunctionResult, encodeFunctionData } from "viem";
import { ADDR, tokenAbi } from "./chain";
import { aggregateAt, type ArchiveCall } from "./paidReads";
import { DEAD, S0 } from "./watch";

export async function burnedAt(block: bigint, call?: ArchiveCall) {
  const [supply, dead] = await aggregateAt(
    block,
    [
      {
        target: ADDR.token,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: tokenAbi,
          functionName: "totalSupply",
        }),
      },
      {
        target: ADDR.token,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: tokenAbi,
          functionName: "balanceOf",
          args: [DEAD],
        }),
      },
    ],
    call,
  );
  return (
    S0 -
    decodeFunctionResult({
      abi: tokenAbi,
      functionName: "totalSupply",
      data: supply,
    }) +
    decodeFunctionResult({
      abi: tokenAbi,
      functionName: "balanceOf",
      data: dead,
    })
  );
}
