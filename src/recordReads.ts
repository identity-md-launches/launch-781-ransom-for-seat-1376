import { ADDR, quoteAbi, tokenAbi } from "./chain";
import { archive, marketCalls } from "./paidReads";
import { decodeFunctionResult, numberToHex, type Hex } from "viem";
import { HIS_WALLET } from "./watch";
import { type RecordSource, type RecordReceipt } from "./walletRecord";

import { latestReads } from "./readPools";
export const recordSource: RecordSource = {
  latest: () => latestReads.getBlock(),
  block: (blockNumber) => archive.getBlock({ blockNumber }),
  balance: (blockNumber) =>
    archive.readContract({
      address: ADDR.token,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [HIS_WALLET],
      blockNumber,
    }),
  receipts: async (blockNumber) => {
    const receipts = await archive.request<{
      Method: "eth_getBlockReceipts";
      Parameters: [Hex];
      ReturnType: (Omit<RecordReceipt, "gasUsed" | "effectiveGasPrice"> & {
        gasUsed: Hex;
        effectiveGasPrice: Hex;
      })[];
    }>({ method: "eth_getBlockReceipts", params: [numberToHex(blockNumber)] });
    return receipts.map((receipt) => ({
      ...receipt,
      gasUsed: BigInt(receipt.gasUsed),
      effectiveGasPrice: BigInt(receipt.effectiveGasPrice),
    }));
  },
  eth: (blockNumber) =>
    archive.getBalance({ address: HIS_WALLET, blockNumber }),
  quote: async (blockNumber, amount) => {
    if (amount === 0n) return 0n;
    const result = await archive.call({
      to: ADDR.quoter,
      data: marketCalls(amount)[0].callData,
      blockNumber,
    });
    if (!result.data) throw Error("No sell quote");
    return decodeFunctionResult({
      abi: quoteAbi,
      functionName: "quoteExactInputSingle",
      data: result.data,
    })[0];
  },
};
