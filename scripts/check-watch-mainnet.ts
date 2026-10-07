import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { parseEther } from "viem";
import { ADDR, buildTrade, minimumOut, quote, rpc } from "../src/chain";
import {
  H0,
  M0,
  NINE_WALLETS,
  readWatch,
  watchCountdown,
  watchTokens,
  watchTotals,
  watchValue,
  watchVerdicts,
} from "../src/watch";

const data = await readWatch();
const totals = watchTotals(data);
const amount = parseEther("0.001");
const quoted = await quote("buy", amount, data.block);
assert.ok(quoted.out > 0n, "0.001 ETH quote must be positive");
const transaction = buildTrade(
  "buy",
  amount,
  minimumOut(quoted.out, 3),
  data.timestamp,
);
// Only eth_call: the page's own calldata, using a public funded address. Never sends a transaction.
const simulated = await rpc.call({
  ...transaction,
  account: ADDR.creator,
  blockNumber: data.block,
});
const now = Math.floor(Date.now() / 1000);
const verdict = watchVerdicts(data, now);
const report = {
  checkedAt: new Date().toISOString(),
  chainId: await rpc.getChainId(),
  snapshot: data,
  wallets: NINE_WALLETS.map((address, index) => ({
    address,
    balance: data.balances[index],
    formatted: watchTokens(data.balances[index]),
  })),
  nine: watchTokens(totals.nine),
  his: watchTokens(data.main),
  burned: totals.burned,
  value: watchValue(data),
  verdict,
  countdown: watchCountdown(now),
  buy: {
    amountIn: amount,
    quoteOut: quoted.out,
    quoteFREE1376: watchTokens(quoted.out),
    ...transaction,
    account: ADDR.creator,
    simulationResult: simulated.data ?? "0x",
    success: true,
  },
  expectedStateMatches:
    totals.nine === H0 &&
    data.main === M0 &&
    totals.burned === 0n &&
    verdict.join() === "WAITING.",
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/watch-mainnet.json",
  JSON.stringify(
    report,
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      checkedAt: report.checkedAt,
      block: data.block.toString(),
      nine: report.nine,
      his: report.his,
      burned: totals.burned.toString(),
      value: report.value,
      verdict,
      countdown: report.countdown,
      quoteFREE1376: report.buy.quoteFREE1376,
      simulationResult: report.buy.simulationResult,
      expectedStateMatches: report.expectedStateMatches,
    },
    null,
    2,
  ),
);
assert.equal(report.chainId, 1);
assert.equal(
  totals.nine,
  H0,
  "The nine wallets have changed since the assignment",
);
assert.equal(data.main, M0, "His wallet has changed since the assignment");
assert.equal(totals.burned, 0n, "Tokens have burned since the assignment");
assert.deepEqual(
  verdict,
  ["WAITING."],
  "The live verdict has changed since the assignment",
);
