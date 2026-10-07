import { ADDR, quoteAbi, tokenAbi } from "./chain";
import { ARCHIVE_URL, archive, marketCalls } from "./paidReads";
import {
  createPublicClient,
  http,
  decodeFunctionResult,
  numberToHex,
  type Hex,
} from "viem";
import { HIS_WALLET } from "./watch";
import { type RecordSource, type RecordReceipt } from "./walletRecord";

// Every historical operation, including receipts and ETH balances, uses dRPC.
const balances = createPublicClient({
  transport: http(ARCHIVE_URL, {
    batch: { batchSize: 3, wait: 0 },
    timeout: 15_000,
    retryCount: 1,
  }),
});
export const recordSource: RecordSource = {
  latest: () => archive.getBlock(),
  block: (blockNumber) => archive.getBlock({ blockNumber }),
  balance: (blockNumber) =>
    balances.readContract({
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
