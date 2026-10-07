import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { decodeFunctionResult, formatUnits, parseEther } from "viem";
import {
  ADDR,
  buildTrade,
  minimumOut,
  quote,
  quoteAbi,
  rpc,
} from "../src/chain";
import {
  H0,
  M0,
  readWatch,
  watchTotals,
  watchTokens,
  watchVerdicts,
} from "../src/watch";
import { PAID_START, secondRansomPaid, sellPercentage } from "../src/paid";
import {
  ARCHIVE_URL,
  archive,
  marketCalls,
  nineTotal,
  readLiveSell,
  readSellPoint,
} from "../src/paidReads";

const watch = await readWatch();
const totals = watchTotals(watch);
const live = await readLiveSell();
const direct = await archive.call({
  to: ADDR.quoter,
  data: marketCalls(live.amount)[0].callData,
  blockNumber: live.block,
});
const directOut = decodeFunctionResult({
  abi: quoteAbi,
  functionName: "quoteExactInputSingle",
  data: direct.data!,
})[0];
const historicBlock = await archive.getBlock({ blockNumber: PAID_START });
const historical = await readSellPoint(historicBlock);
const historicalNine = await nineTotal(PAID_START);
const input = parseEther("0.001");
const bought = await quote("buy", input, watch.block);
const transaction = buildTrade(
  "buy",
  input,
  minimumOut(bought.out, 3),
  watch.timestamp,
);
// Simulation only, from the same public address as the existing mainnet check.
const simulation = await rpc.call({
  ...transaction,
  account: ADDR.creator,
  blockNumber: watch.block,
});
const report = {
  checkedAt: new Date().toISOString(),
  chainId: await rpc.getChainId(),
  watch,
  nine: watchTokens(totals.nine),
  his: watchTokens(watch.main),
  burned: totals.burned,
  verdicts: watchVerdicts(watch),
  paidLayout: secondRansomPaid(watch),
  live,
  sellETH: formatUnits(live.out, 18),
  percent: sellPercentage(live.out),
  directOut,
  aggregateMatchesDirect: directOut === live.out,
  archive: { url: ARCHIVE_URL, historical, nine: historicalNine },
  buy: {
    input,
    output: bought.out,
    ...transaction,
    account: ADDR.creator,
    result: simulation.data ?? "0x",
  },
};
await mkdir("artifacts", { recursive: true });
const json = JSON.stringify(
  report,
  (_, value) => (typeof value === "bigint" ? value.toString() : value),
  2,
);
await writeFile("artifacts/paid-mainnet.json", json + "\n");
console.log(
  JSON.stringify(
    {
      checkedAt: report.checkedAt,
      block: String(live.block),
      nine: report.nine,
      his: report.his,
      burned: String(totals.burned),
      verdicts: report.verdicts,
      paidLayout: report.paidLayout,
      sellETH: report.sellETH,
      percent: report.percent,
      aggregateMatchesDirect: report.aggregateMatchesDirect,
      historicalBlock: String(historical.block),
      historicalSellETH: formatUnits(historical.out, 18),
      buyFREE1376: formatUnits(bought.out, 18),
      buySimulation: report.buy.result,
    },
    null,
    2,
  ),
);
assert.equal(report.chainId, 1);
assert.equal(
  totals.nine,
  H0,
  "Live holdings changed; report actual mainnet state",
);
assert.equal(watch.main, M0, "His live holdings changed");
assert.equal(secondRansomPaid(watch), false);
assert.equal(totals.burned, 0n);
assert.equal(directOut, live.out);
assert.ok(live.out > 0n);
assert.ok(bought.out > 0n);
