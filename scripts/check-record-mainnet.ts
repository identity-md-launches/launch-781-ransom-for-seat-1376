import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readWatch, watchTotals, watchTokens, H0 } from "../src/watch";
import { secondRansomPaid } from "../src/paid";
import {
  archive,
  historySource,
  findPaidBlock,
  readLiveSell,
} from "../src/paidReads";
import { recordSource } from "../src/recordReads";
import {
  extendWalletRecord,
  recouped,
  recordOfferRules,
} from "../src/walletRecord";
import { recordVerdicts } from "../src/recordVerdicts";
import { watchVerdicts } from "../src/watch";

const watch = await readWatch();
const totals = watchTotals(watch);
const [record, live, paid] = await Promise.all([
  extendWalletRecord(recordSource),
  readLiveSell(),
  totals.burned >= H0
    ? findPaidBlock(await archive.getBlock(), historySource)
    : undefined,
]);
const state = { data: record, pending: false, failed: false };
const result = {
  checkedAt: new Date().toISOString(),
  watchBlock: watch.block,
  nine: watchTokens(totals.nine),
  his: watchTokens(watch.main),
  burned: totals.burned,
  paid,
  paidLayout: secondRansomPaid(watch, paid),
  record,
  recouped: recouped(record),
  rules: recordOfferRules(state),
  verdicts: recordVerdicts(watchVerdicts(watch), state),
  live,
};
assert.ok(record.through >= watch.block);
if (totals.nine === H0 && totals.burned < H0)
  assert.equal(result.paidLayout, false);
if (totals.nine === 0n && totals.burned >= H0) {
  assert.equal(result.paidLayout, true);
  assert.ok(
    paid,
    "The empty wallets must be verified at the first burn-threshold block",
  );
}
const json = JSON.stringify(
  result,
  (_, value) => (typeof value === "bigint" ? value.toString() : value),
  2,
);
await mkdir("test/scratch", { recursive: true });
await writeFile("test/scratch/record-mainnet.json", json + "\n");
console.log(json);
