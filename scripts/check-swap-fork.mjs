import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright-core";
import {
  createPublicClient,
  http,
  parseEther,
  encodeFunctionData,
  maxUint256,
  maxUint160,
} from "viem";
import { mainnet } from "viem/chains";
import {
  ADDR,
  POOL_ID,
  POOL_KEY,
  quoteAbi,
  tokenAbi,
  permitAbi,
  buildTrade,
} from "../src/chain.ts";
import {
  swapRpc,
  readSwapMeter,
  SWAP_EVENT,
  POOL_MANAGER,
} from "../src/swapReads.ts";
import { sellPercentage } from "../src/paid.ts";
const report = {
  checkedAt: new Date().toISOString(),
  checks: [],
  trades: [],
  errors: [],
};
const forkBlock = await swapRpc.getBlockNumber({ cacheTime: 0 });
report.forkBlock = String(forkBlock);
const portServer = createServer();
await new Promise((r) => portServer.listen(0, "127.0.0.1", r));
const port = portServer.address().port;
await new Promise((r) => portServer.close(r));
const anvil = spawn(
  "anvil",
  [
    "--fork-url",
    "https://ethereum-rpc.publicnode.com",
    "--fork-block-number",
    String(forkBlock),
    "--port",
    String(port),
    "--host",
    "127.0.0.1",
    "--chain-id",
    "1",
    "--accounts",
    "0",
    "--no-storage-caching",
    "--no-fork-node-info",
    "--no-rate-limit",
    "--retries",
    "1",
    "--timeout",
    "15000",
    "--silent",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let stderr = "";
anvil.stderr.on("data", (b) => (stderr += b.toString()));
const url = `http://127.0.0.1:${port}`,
  client = createPublicClient({
    chain: mainnet,
    transport: http(url, { timeout: 45000, retryCount: 0 }),
  });
const request = async (method, params = []) =>
  client.request({ method, params });
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const path = resolve(
      "dist",
      pathname.replace(/^\/preview\//, "") || "index.html",
    );
    if (
      !pathname.startsWith("/preview/") ||
      !path.startsWith(resolve("dist") + "/")
    )
      throw Error("path");
    res
      .writeHead(200, {
        "Content-Type":
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".png": "image/png",
            ".svg": "image/svg+xml",
          }[extname(path)] || "text/plain",
      })
      .end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
});
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      await client.getChainId();
      break;
    } catch {
      if (anvil.exitCode !== null) throw Error(stderr);
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  assert.equal(await client.getChainId(), 1);
  await request("anvil_impersonateAccount", [ADDR.creator]);
  await request("anvil_setBalance", [
    ADDR.creator,
    "0x" + parseEther("1000").toString(16),
  ]);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      "/opt/imd-tools/ms-playwright/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  // Local fork owns new state. The same real providers serve the historical pre-fork window.
  await context.route(
    /https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/,
    async (route) => {
      const payload = route.request().postDataJSON();
      async function send(req) {
        const rpc = async (endpoint, r) => {
          const response = await context.request.post(endpoint, {
            data: r,
            timeout: 60000,
          });
          return response.json();
        };
        if (req.method === "eth_getLogs") {
          const from = BigInt(req.params[0].fromBlock),
            to = BigInt(req.params[0].toBlock);
          if (to <= forkBlock) return rpc(route.request().url(), req);
          if (from > forkBlock) return rpc(url, req);
          const old = await rpc(route.request().url(), {
            ...req,
            params: [
              { ...req.params[0], toBlock: "0x" + forkBlock.toString(16) },
            ],
          });
          const fresh = await rpc(url, {
            ...req,
            params: [
              {
                ...req.params[0],
                fromBlock: "0x" + (forkBlock + 1n).toString(16),
              },
            ],
          });
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: [...(old.result ?? []), ...(fresh.result ?? [])],
          };
        }
        const tag =
          req.method === "eth_call" || req.method === "eth_getBalance"
            ? req.params[1]
            : req.method === "eth_getBlockByNumber" ||
                req.method === "eth_getBlockReceipts"
              ? req.params[0]
              : undefined;
        if (
          tag &&
          tag !== "latest" &&
          tag !== "pending" &&
          BigInt(tag) < forkBlock
        )
          return rpc(route.request().url(), req);
        return rpc(url, req);
      }
      try {
        await route.fulfill({
          json: Array.isArray(payload)
            ? await Promise.all(payload.map(send))
            : await send(payload),
        });
      } catch (e) {
        report.errors.push(String(e));
        await route.abort();
      }
    },
  );
  await page.goto(
    `http://127.0.0.1:${server.address().port}/preview/#second-act`,
  );
  await page
    .locator('.live-bag-row [role="img"]')
    .filter({ has: undefined })
    .waitFor();
  await page.waitForFunction(
    () =>
      document
        .querySelector('.live-percentage [role="img"]')
        ?.getAttribute("aria-label") !== "—",
  );
  const initial = await readSwapMeter(undefined, client);
  report.initialPercentage = sellPercentage(initial.out);
  const sendTx = async (tx) => {
    const hash = await request("eth_sendTransaction", [
      {
        from: ADDR.creator,
        to: tx.to,
        data: tx.data,
        value: "0x" + (tx.value ?? 0n).toString(16),
        gas: "0x989680",
      },
    ]);
    const receipt = await client.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    return receipt;
  };
  async function trade(side, amount) {
    const header = await client.getBlock();
    const quoted = await client.simulateContract({
      address: ADDR.quoter,
      abi: quoteAbi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          poolKey: POOL_KEY,
          zeroForOne: side === "buy",
          exactAmount: amount,
          hookData: "0x",
        },
      ],
    });
    const tx = buildTrade(
      side,
      amount,
      (quoted.result[0] * 95n) / 100n,
      header.timestamp,
    );
    const receipt = await sendTx(tx);
    const logs = await client.getLogs({
      address: POOL_MANAGER,
      event: SWAP_EVENT,
      args: { id: POOL_ID },
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
      strict: true,
    });
    assert.ok(logs.length);
    await page
      .locator(
        `.live-swap-row[href="https://etherscan.io/tx/${receipt.transactionHash}"]`,
      )
      .waitFor();
    await page.waitForFunction(
      () => !!document.querySelector(".live-change-chip"),
    );
    const meter = await readSwapMeter(undefined, client);
    report.trades.push({
      side,
      block: String(receipt.blockNumber),
      transaction: receipt.transactionHash,
      amount0: String(logs.at(-1).args.amount0),
      amount1: String(logs.at(-1).args.amount1),
      percentage: sellPercentage(meter.out),
      chip: await page.locator(".live-change-chip").innerText(),
    });
    const row = await page.locator(".live-swap-row").first().innerText();
    assert.ok(row.includes(side.toUpperCase()));
    assert.ok(
      (side === "buy" && logs.at(-1).args.amount0 < 0n) ||
        (side === "sell" && logs.at(-1).args.amount0 > 0n),
    );
    return meter;
  }
  const buy = await trade("buy", parseEther(".05"));
  assert.ok(buy.out > initial.out);
  report.checks.push(
    "Fork buy emits real Swap, tape row, increased real quote and positive chip",
  );
  await sendTx({
    to: ADDR.token,
    data: encodeFunctionData({
      abi: tokenAbi,
      functionName: "approve",
      args: [ADDR.permit2, maxUint256],
    }),
  });
  const header = await client.getBlock();
  await sendTx({
    to: ADDR.permit2,
    data: encodeFunctionData({
      abi: permitAbi,
      functionName: "approve",
      args: [
        ADDR.token,
        ADDR.router,
        maxUint160,
        Number(header.timestamp) + 3600,
      ],
    }),
  });
  const sell = await trade("sell", parseEther("100000"));
  assert.ok(sell.out < buy.out);
  report.checks.push(
    "Fork sell emits real Swap, tape row, decreased real quote and negative chip",
  );
  for (const amount of ["1", "5", "20", "100"]) {
    const pump = await trade("buy", parseEther(amount));
    if (sellPercentage(pump.out) >= 100) {
      await page
        .locator(".live-sell-status")
        .filter({ hasText: "HE MAY SELL." })
        .waitFor();
      assert.equal(await page.locator(".live-burst i").count(), 28);
      report.checks.push(
        "Pumped fork crosses 100%, opens status and emits 28 squares",
      );
      await page
        .locator(".live-paid-sections")
        .screenshot({ path: "artifacts/swap-fork.png" });
      break;
    }
  }
  assert.ok(report.checks.some((s) => s.startsWith("Pumped")));
  assert.equal(report.errors.length, 0);
  report.result = "passed";
} catch (e) {
  report.result = "failed";
  report.failure = String(e);
  report.anvilError = stderr;
  process.exitCode = 1;
} finally {
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/swap-fork.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  await browser?.close();
  if (server.listening) await new Promise((r) => server.close(r));
  anvil.kill("SIGTERM");
}
