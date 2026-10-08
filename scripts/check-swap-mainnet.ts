import { mkdir, writeFile } from "node:fs/promises";
import { formatUnits } from "viem";
import { swapSource, readSwapMeter, swapRpc } from "../src/swapReads";
import { ADDR, POOL_KEY, quoteAbi } from "../src/chain";
import { abs, swapSide } from "../src/swapTape";
import { sellPercentage } from "../src/paid";
const live = await readSwapMeter();
const direct = await swapRpc.simulateContract({
  address: ADDR.quoter,
  abi: quoteAbi,
  functionName: "quoteExactInputSingle",
  args: [
    {
      poolKey: POOL_KEY,
      zeroForOne: false,
      exactAmount: live.amount,
      hookData: "0x",
    },
  ],
  blockNumber: live.block,
});
if (direct.result[0] !== live.out) throw Error("Direct quote mismatch");
const recent = [];
for (let end = live.block; end > live.block - 10000n; end -= 2000n) {
  recent.push(...(await swapSource.logs(end - 1999n, end)));
  if (new Set(recent.map((s) => s.block)).size >= 24) break;
}
const swaps = recent
  .sort((a, b) =>
    a.block === b.block ? b.logIndex - a.logIndex : a.block > b.block ? -1 : 1,
  )
  .slice(0, 7);
const report = {
  checkedAt: new Date().toISOString(),
  block: live.block,
  balance: formatUnits(live.balance, 18),
  amount: formatUnits(live.amount, 18),
  quoteETH: formatUnits(live.out, 18),
  percentage: sellPercentage(live.out),
  marketCap: live.marketCap,
  directQuoteMatches: true,
  swaps: swaps.map((s) => ({
    block: s.block,
    logIndex: s.logIndex,
    side: swapSide(s),
    eth: formatUnits(abs(s.amount0), 18),
    tokens: formatUnits(abs(s.amount1), 18),
    transaction: s.transaction,
    etherscan: `https://etherscan.io/tx/${s.transaction}#eventlog`,
  })),
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/swap-mainnet.json",
  JSON.stringify(report, (_, v) => (typeof v === "bigint" ? String(v) : v), 2) +
    "\n",
);
console.log(
  JSON.stringify(report, (_, v) => (typeof v === "bigint" ? String(v) : v), 2),
);
