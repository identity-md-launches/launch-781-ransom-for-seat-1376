import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { recordSource } from "../src/recordReads";
import { extendWalletRecord, recordOfferRules } from "../src/walletRecord";

// Count the real transport, including retries, during this record alone.
const originalFetch = globalThis.fetch;
const requests: { methods: string[]; blocks: string[]; status?: number }[] = [];
globalThis.fetch = async (input, init) => {
  assert.equal(String(input), "https://eth.drpc.org");
  const body = JSON.parse(String(init?.body));
  const batch = Array.isArray(body) ? body : [body];
  const request = {
    methods: batch.map((rpc) => String(rpc.method)),
    blocks: batch.map((rpc) =>
      String(
        rpc.method === "eth_getBlockByNumber"
          ? rpc.params[0]
          : rpc.params.at(-1),
      ),
    ),
    status: undefined as number | undefined,
  };
  requests.push(request);
  assert.ok(!request.methods.includes("eth_getLogs"));
  const response = await originalFetch(input, init);
  request.status = response.status;
  return response;
};
const checkedAt = new Date().toISOString();
const started = performance.now();
try {
  const record = await extendWalletRecord(recordSource);
  const seconds = (performance.now() - started) / 1000;
  const rules = recordOfferRules({
    data: record,
    pending: false,
    failed: false,
  });
  const report = {
    checkedAt,
    scope:
      "One live wallet record; excludes watch, paid search, chart and trading",
    seconds,
    httpRequests: requests.length,
    rpcCalls: requests.reduce(
      (total, request) => total + request.methods.length,
      0,
    ),
    balanceReads: requests
      .flatMap((request) => request.methods)
      .filter((method) => method === "eth_call").length,
    requests,
    record,
    rules,
  };
  if (record.changes.length === 0) {
    assert.equal(report.balanceReads, 2);
    assert.equal(report.httpRequests, 3);
  }
  const json =
    JSON.stringify(
      report,
      (_, value) => (typeof value === "bigint" ? String(value) : value),
      2,
    ) + "\n";
  await mkdir("test/scratch", { recursive: true });
  await writeFile("test/scratch/bisection-mainnet.json", json);
  console.log(json);
} finally {
  globalThis.fetch = originalFetch;
}
