import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import {
  decodeFunctionData,
  encodeFunctionResult,
  numberToHex,
  parseEther,
  encodeEventTopics,
  encodeAbiParameters,
} from "viem";
import {
  ADDR,
  POOL_ID,
  hookAbi,
  tokenAbi,
  seatAbi,
  stateAbi,
  quoteAbi,
  permitAbi,
} from "../src/chain.ts";
import { KEY_ADDRESS, keyAbi } from "../src/key.ts";
import { BURIAL_START, CREATOR_PAID } from "../src/burial.ts";
import { ETH_USD_FEED, feedAbi } from "../src/dollars.ts";
import {
  H0,
  M0,
  S0,
  CASH_OUT,
  HIS_WALLET,
  NINE_WALLETS,
  DEAD,
} from "../src/watch.ts";
import { PAID_START, paidTime } from "../src/paid.ts";
import { MULTICALL3, aggregateAbi } from "../src/paidReads.ts";

import { SWAP_EVENT, POOL_MANAGER, blockInfoAbi } from "../src/swapReads.ts";
import { transferEvent } from "../src/walletRecord.ts";

const fixture = JSON.parse(
  await readFile("scripts/fixtures/revision.json", "utf8"),
);
const letter = (
  await readFile("scripts/fixtures/second-act-letter.txt", "utf8")
).trimEnd();
const firstPaid = PAID_START + 300n;
let latest = firstPaid + 3600n;
const now = 1791378000n;
const timeAt = (block) => now + (block - firstPaid - 3600n) * 12n;
const hash = "0x" + "ab".repeat(32);
const image =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="440" height="440"><rect width="440" height="440" fill="#030303"/><circle cx="220" cy="220" r="170" fill="none" stroke="#f97316" stroke-width="24"/></svg>',
  ).toString("base64");
const uri =
  "data:application/json;base64," +
  Buffer.from(JSON.stringify({ image })).toString("base64");
let nine = H0,
  dead = 0n,
  main = M0,
  sell = parseEther("0.9537"),
  failLive = false,
  historyAllowed = false;
const events = [];
const poolEvents = Array.from({ length: 12 }, (_, i) => ({
  block: latest - BigInt(12 - i),
  index: 0,
  amount0: i % 3 ? -parseEther("0.42") : parseEther("0.12"),
  amount1: i % 3 ? parseEther("3910000") : -parseEther("1000000"),
}));
const quoteByBlock = new Map(
  poolEvents.map((s, i) => [s.block, parseEther(String(0.73 + i * 0.01))]),
);
let failLogs = false;
function poolLog(s) {
  return {
    address: POOL_MANAGER,
    blockNumber: numberToHex(s.block),
    blockHash: txHash(s.block),
    transactionHash: txHash(s.block + BigInt(s.index)),
    transactionIndex: "0x0",
    logIndex: numberToHex(s.index),
    removed: false,
    topics: encodeEventTopics({
      abi: [SWAP_EVENT],
      eventName: "Swap",
      args: { id: POOL_ID, sender: ADDR.router },
    }),
    data: encodeAbiParameters(
      [
        { type: "int128" },
        { type: "int128" },
        { type: "uint160" },
        { type: "uint128" },
        { type: "int24" },
        { type: "uint24" },
      ],
      [s.amount0, s.amount1, (1n << 96n) * 3500n, 1000000000n, 0, 3000],
    ),
  };
}
const mainAt = (block) =>
  M0 +
  events
    .filter((event) => event.block <= block)
    .reduce((sum, event) => sum + event.delta, 0n);
const txHash = (block) => "0x" + block.toString(16).padStart(64, "0");
const report = {
  checkedAt: new Date().toISOString(),
  checks: [],
  layouts: [],
  archiveCalls: [],
  quotes: [],
  pageErrors: [],
  consoleErrors: [],
  failedLocalResources: [],
  contrast: [],
  axe: {},
};
const check = (condition, name) => {
  assert.ok(condition, name);
  report.checks.push(name);
  console.log("PASS", name);
};
const countHistory = () =>
  report.archiveCalls.filter((call) => call.kind === "nine").length;
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
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".txt": "text/plain",
    };
    res
      .writeHead(200, {
        "Content-Type": types[extname(path)] || "application/octet-stream",
      })
      .end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROMIUM_PATH ||
    "/opt/imd-tools/ms-playwright/chromium-1246/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
report.browser = browser.version();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  hasTouch: true,
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.on("pageerror", (error) => report.pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") report.consoleErrors.push(message.text());
});
page.on("requestfailed", (request) => {
  if (request.url().includes("127.0.0.1"))
    report.failedLocalResources.push(request.url());
});
await page.clock.install({ time: new Date(Number(now) * 1000) });

function contractResult(tx, block, aggregate = false) {
  const address = tx.to.toLowerCase();
  let abi, values;
  if (address === MULTICALL3.toLowerCase()) {
    abi = blockInfoAbi;
    values = { getBlockNumber: block, getCurrentBlockTimestamp: timeAt(block) };
  } else if (address === ADDR.hook.toLowerCase()) {
    abi = hookAbi;
    values = {
      totalFees: parseEther("2.8"),
      CREATOR_CAP: parseEther("2.8"),
      buried: block >= BURIAL_START + 100n,
      totalIMDBurned: parseEther("500"),
      burnable: parseEther("0.01"),
      MIN_BURN: parseEther("0.002"),
      lastBurnBlock: 1n,
      MIN_BLOCKS_BETWEEN_BURNS: 5n,
      status: "BURIED. 500 IMD burned",
      MANIFESTO: fixture.manifesto,
      MANIFESTO_HASH: fixture.manifestoHash,
      IMD: ADDR.token,
    };
  } else if (address === KEY_ADDRESS.toLowerCase()) {
    abi = keyAbi;
    values = {
      totalSupply: 1n,
      contractURI: uri,
      tokenURI: uri,
      ownerOf: ADDR.creator,
      liberator: ADDR.creator,
      witnesses: 7n,
      panel: 11n,
      oracleRequest: hash,
    };
  } else if (address === ADDR.seat.toLowerCase()) {
    abi = seatAbi;
    values = { tokenURI: fixture.uri, getApproved: ADDR.zero };
  } else if (address === ADDR.stateView.toLowerCase()) {
    abi = stateAbi;
    values = { getSlot0: [(1n << 96n) * 3500n, 0, 0, 3000] };
  } else if (address === ETH_USD_FEED.toLowerCase()) {
    abi = feedAbi;
    const timestamp = timeAt(block);
    values = {
      latestRoundData: [1n, 2500_00000000n, timestamp, timestamp, 1n],
    };
  } else if (address === ADDR.quoter.toLowerCase()) {
    abi = quoteAbi;
    const params = decodeFunctionData({ abi, data: tx.data }).args[0];
    let out = params.zeroForOne ? parseEther("135564.15499") : sell;
    if (
      !params.zeroForOne &&
      events.some((event) => event.block - 1n === block)
    )
      out = events.find((event) => event.block - 1n === block).quote ?? sell;
    else if (aggregate && block < latest)
      out =
        historyAllowed && block === firstPaid + 600n
          ? CASH_OUT
          : parseEther("0.4") + (block - firstPaid) * 150000000000000n;
    if (quoteByBlock.has(block) && !params.zeroForOne)
      out = quoteByBlock.get(block);
    if (aggregate)
      report.quotes.push({
        block: String(block),
        amount: String(params.exactAmount),
        out: String(out),
      });
    values = { quoteExactInputSingle: [out, 150000n] };
  } else if (address === ADDR.permit2.toLowerCase()) {
    abi = permitAbi;
    values = { allowance: [0n, 0, 0] };
  } else {
    abi = tokenAbi;
    values = {
      decimals: 18,
      totalSupply: S0,
      balanceOf: parseEther("1000"),
      allowance: 0n,
    };
  }
  const { functionName, args } = decodeFunctionData({ abi, data: tx.data });
  if (address === ADDR.token.toLowerCase() && functionName === "balanceOf") {
    const owner = args[0].toLowerCase();
    const index = NINE_WALLETS.findIndex(
      (wallet) => wallet.toLowerCase() === owner,
    );
    if (index >= 0)
      values.balanceOf =
        index === 0
          ? block < firstPaid
            ? H0
            : block === latest
              ? nine
              : 0n
          : 0n;
    if (owner === HIS_WALLET.toLowerCase()) values.balanceOf = mainAt(block);
    if (owner === DEAD.toLowerCase())
      values.balanceOf = block < firstPaid ? 0n : dead;
  }
  assert.ok(functionName in values, functionName);
  return encodeFunctionResult({
    abi,
    functionName,
    result: values[functionName],
  });
}
function transferLog(event) {
  return {
    address: ADDR.token,
    blockNumber: numberToHex(event.block),
    blockHash: hash,
    transactionHash: txHash(event.block),
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
    topics: encodeEventTopics({
      abi: [transferEvent],
      eventName: "Transfer",
      args: {
        from: event.delta < 0n ? HIS_WALLET : ADDR.router,
        to: event.delta < 0n ? ADDR.router : HIS_WALLET,
      },
    }),
    data: encodeAbiParameters(
      [{ type: "uint256" }],
      [event.delta < 0n ? -event.delta : event.delta],
    ),
  };
}
await context.route(
  /https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/,
  async (route) => {
    const payload = route.request().postDataJSON();
    async function handle(req) {
      const respond = (result) => ({ jsonrpc: "2.0", id: req.id, result });
      const error = () => ({
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32000, message: "Mock read unavailable" },
      });
      if (req.method === "eth_chainId") return respond("0x1");
      if (req.method === "eth_blockNumber") return respond(numberToHex(latest));
      if (req.method === "eth_getBlockByNumber") {
        const block =
          req.params[0] === "latest" ? latest : BigInt(req.params[0]);
        return respond({
          number: numberToHex(block),
          timestamp: numberToHex(timeAt(block)),
          hash,
          transactions: [],
        });
      }
      if (req.method === "eth_getLogs") {
        assert.equal(
          new URL(route.request().url()).host,
          "ethereum-rpc.publicnode.com",
        );
        assert.equal(
          req.params[0].address.toLowerCase(),
          POOL_MANAGER.toLowerCase(),
        );
        assert.equal(req.params[0].topics[1], POOL_ID);
        const from = BigInt(req.params[0].fromBlock),
          to = BigInt(req.params[0].toBlock);
        assert.ok(to - from < 2000n);
        if (failLogs) return error();
        return respond(
          poolEvents
            .filter((s) => s.block >= from && s.block <= to)
            .map(poolLog),
        );
      }
      if (req.method === "eth_getBlockReceipts") {
        const block = BigInt(req.params[0]);
        const event = events.find((event) => event.block === block);
        return respond(
          event
            ? [
                {
                  from: event.own === false ? ADDR.router : HIS_WALLET,
                  transactionHash: txHash(block),
                  gasUsed: "0x5208",
                  effectiveGasPrice: numberToHex(1_000_000_000n),
                  logs: [transferLog(event)],
                },
              ]
            : [
                {
                  from: ADDR.creator,
                  transactionHash: hash,
                  gasUsed: "0x5208",
                  effectiveGasPrice: "0x1",
                  logs: [{ address: ADDR.hook, topics: [CREATOR_PAID] }],
                },
              ],
        );
      }
      if (req.method === "eth_getBalance") {
        const block =
          req.params[1] === "latest" ? latest : BigInt(req.params[1]);
        const balance =
          parseEther("10") +
          events
            .filter((event) => event.block <= block)
            .reduce(
              (sum, event) =>
                sum +
                (event.proceeds ?? 0n) -
                (event.own === false ? 0n : 21000n * 1_000_000_000n),
              0n,
            );
        return respond(numberToHex(balance));
      }
      assert.equal(req.method, "eth_call", "read-only RPC only");
      const tx = req.params[0],
        block = req.params[1] === "latest" ? latest : BigInt(req.params[1]);
      if (tx.to.toLowerCase() === MULTICALL3.toLowerCase()) {
        const calls = decodeFunctionData({ abi: aggregateAbi, data: tx.data })
          .args[0];
        const kind =
          calls.length === 16 ? "watch" : calls.length === 21 ? "snapshot" : calls.length === 9 ? "nine" : calls.length === 2 ? "burn" : "market";
        report.archiveCalls.push({
          host: new URL(route.request().url()).host,
          block: String(block),
          kind,
          length: calls.length,
        });
        if (kind === "market" && failLive && block === latest) return error();
        return respond(
          encodeFunctionResult({
            abi: aggregateAbi,
            functionName: "aggregate3",
            result: calls.map((call) => ({
              success: true,
              returnData: contractResult(
                { to: call.target, data: call.callData },
                block,
                true,
              ),
            })),
          }),
        );
      }
      return respond(contractResult(tx, block));
    }
    try {
      const result = Array.isArray(payload)
        ? await Promise.all(payload.map(handle))
        : await handle(payload);
      await route.fulfill({ json: result });
    } catch (error) {
      report.pageErrors.push(String(error));
      await route.abort();
    }
  },
);
const root = `http://127.0.0.1:${server.address().port}/preview/`;
const settle = () => new Promise((r) => setTimeout(r, 200));
const advance = async (out, amounts = [-parseEther(".42")]) => {
  latest++;
  sell = out;
  quoteByBlock.set(latest, out);
  poolEvents.push(
    ...amounts.map((amount0, index) => ({
      block: latest,
      index,
      amount0,
      amount1: amount0 < 0n ? parseEther("3910000") : -parseEther("1200000"),
    })),
  );
  await page.clock.fastForward(4000);
  await settle();
  await page.waitForFunction(
    (b) => document.querySelector(".live-block-pill")?.textContent.includes(b),
    latest.toLocaleString("en-US"),
  );

  await settle();
};
await mkdir("artifacts", { recursive: true });
await mkdir("test/scratch", { recursive: true });
try {
  nine = 0n;
  dead = H0;
  await page.goto(root + "#second-act");
  await page.locator(".live-swap-row").nth(6).waitFor();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".live-chart svg")
        ?.getAttribute("aria-valuemax") === "11",
  );
  await page.waitForFunction(
    () =>
      !document.querySelector(".live-chart")?.getAttribute("aria-busy") ||
      document.querySelector(".live-chart")?.getAttribute("aria-busy") ===
        "false",
  );
  check(
    (await page.locator(".live-burst").count()) === 0,
    "No burst on initial load",
  );
  check(
    (await page.locator(".live-swap-row").count()) === 7,
    "Seven newest swaps",
  );
  check(
    (await page
      .getByRole("button", { name: "LIVE", exact: true })
      .getAttribute("aria-pressed")) === "true",
    "LIVE selected by default",
  );
  await page.clock.runFor(1000);
  await page
    .locator(".live-paid-sections")
    .screenshot({ path: "artifacts/swap-desktop.png" });
  report.punctuation = [];
  for (const font of ['Liberation Mono', 'DejaVu Sans Mono', 'FreeMono', 'monospace']) {
    await page.locator('.live-odometer').evaluateAll((els, family)=>els.forEach(e=>e.style.fontFamily=family),font);
    const slots = await page.locator('.live-punctuation').evaluateAll(els=>els.map(e=>{
      const style=getComputedStyle(e), slot=e.getBoundingClientRect();
      const range=document.createRange();range.selectNodeContents(e);
      const glyph=range.getBoundingClientRect();
      return {text:e.textContent,font:style.fontFamily,display:style.display,justify:style.justifyContent,overflow:style.overflow,offset:((glyph.left+glyph.right)-(slot.left+slot.right))/2,width:slot.width,size:parseFloat(style.fontSize),big:!!e.closest('.live-percentage')};
    }));
    report.punctuation.push(...slots);
    check(slots.length >= 3 && slots.every(s=>['flex','inline-flex'].includes(s.display) && s.justify==='center' && s.overflow==='visible' && Math.abs(s.offset)<1), `Percentage, bag and cap punctuation centered in ${font}`);
    check(slots.filter(s=>s.big).every(s=>Math.abs(s.width/s.size-.3)<.001), `Percentage retains .3em point slot in ${font}`);
  }
  await page.locator('.live-odometer').evaluateAll(els=>els.forEach(e=>e.style.removeProperty('font-family')));
  const quietCount = report.archiveCalls.filter(
    (c) => c.host === "ethereum-rpc.publicnode.com" && c.kind === "market",
  ).length;
  latest++;
  await page.clock.runFor(16000);
  await settle();
  check(
    report.archiveCalls.filter(
      (c) => c.host === "ethereum-rpc.publicnode.com" && c.kind === "market",
    ).length === quietCount,
    "Quiet blocks do not trigger live market multicalls before heartbeat",
  );
  const initial = sell;
  await advance(initial + (CASH_OUT * 31n) / 10000n);
  check(
    (await page.locator(".live-change-chip").innerText()).includes("▲ +0.31%"),
    "Buy floats +0.31 percentage-point chip",
  );
  check(
    (await page.locator(".live-swap-row").first().innerText()).includes("BUY"),
    "Buy row appears first",
  );
  check(
    (await page.locator(".live-swap-row").first().innerText()).includes(
      "0.4286 ETH",
    ),
    "Tape BUY ETH restores the hook fee",
  );
  check(
    (await page.locator(".live-swap-row").first().innerText()).includes(
      "+3.91M FREE1376",
    ),
    "Tape tokens come from absolute amount1",
  );
  check(
    (
      await page.locator(".live-swap-row").first().getAttribute("href")
    ).startsWith("https://etherscan.io/tx/"),
    "Transaction links point to Etherscan",
  );
  const reel = await page
    .locator(".live-percentage .live-reel")
    .last()
    .evaluate((el) => ({
      transform: getComputedStyle(el).transform,
      transition: getComputedStyle(el).transitionDuration,
    }));
  check(reel.transition === "0.8s", "Odometer reel has 0.8-second transition");
  await advance(sell - (CASH_OUT * 12n) / 10000n, [
    parseEther(".12"),
    parseEther(".06"),
  ]);
  check(
    (await page.locator(".live-change-chip").innerText()).includes("▼ −0.12%"),
    "Sell floats negative chip",
  );
  check(
    (await page.locator(".live-swap-impact").nth(0).innerText()) === "−0.12%",
    "Final swap carries block impact",
  );
  check(
    (await page.locator(".live-swap-impact").nth(1).innerText()) === "0.00%",
    "Earlier swap in same block carries zero impact",
  );
  const age1 = await page.locator(".live-swap-row time").first().innerText();
  await page.clock.runFor(30000);
  await settle();
  check(
    (await page.locator(".live-swap-row time").first().innerText()) !== age1,
    "Tape ages tick every second",
  );
  await page.getByRole("button", { name: "SINCE THE BURN" }).click();
  const chart = page.getByRole("slider", { name: "CHART" });
  await chart.focus();
  await page.keyboard.press("Home");
  check(
    (await chart.getAttribute("aria-valuenow")) === "0",
    "Hourly chart supports Home",
  );
  await page.keyboard.press("ArrowRight");
  check(
    (await chart.getAttribute("aria-valuenow")) === "1",
    "Hourly chart supports arrow keys",
  );
  check(
    (await page.locator(".live-chart-detail").innerText()).includes("UTC"),
    "Hourly hover/keyboard detail retained",
  );
  await chart.tap({ position: { x: 50, y: 100 } });
  check(
    (await chart.getAttribute("aria-valuenow")) === "0",
    "Hourly chart supports tap",
  );
  await page.getByRole("button", { name: "LIVE", exact: true }).click();
  await advance(CASH_OUT);
  check(
    (await page.locator(".live-sell-status").innerText()).includes(
      "HE MAY SELL.",
    ),
    "Exact threshold opens lock/status",
  );
  check(
    (await page.locator(".live-distance").innerText()) === "UNLOCKED",
    "Threshold pill says UNLOCKED",
  );
  check(
    (await page.locator(".live-burst i").count()) === 28,
    "Upward crossing emits 28 squares",
  );
  check(
    await page.evaluate(() =>
      document.body
        .getAnimations()
        .some((a) => a.effect.getTiming().duration === 600),
    ),
    "Crossing shakes page for 0.6 seconds",
  );
  await page.clock.runFor(1700);
  await advance((CASH_OUT * 99n) / 100n);
  await advance((CASH_OUT * 101n) / 100n);
  check(
    (await page.locator(".live-burst").count()) === 0,
    "Second upward crossing never repeats burst",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (let i = 0; i < 30; i++)
    await advance((CASH_OUT * BigInt(80 + i)) / 100n);
  check(
    (await chart.getAttribute("aria-valuemax")) === "39",
    "LIVE caps at forty swap blocks",
  );
  check(
    (await page.locator(".live-swap-row").count()) === 7,
    "Tape stays capped at seven after many blocks",
  );
  check(
    (await page
      .locator(".live-paid-sections")
      .evaluate((el) => el.getAnimations({ subtree: true }).length)) === 0,
    "Reduced motion disables all section animations",
  );
  check(
    (await page.locator(".live-change-chip").count()) === 0,
    "Reduced motion has no moving chip",
  );
  const before = await page
    .locator('.live-bag-row [role="img"]')
    .getAttribute("aria-label");
  failLive = true;
  await advance((CASH_OUT * 90n) / 100n);
  check(
    (await page
      .locator('.live-bag-row [role="img"]')
      .getAttribute("aria-label")) === before,
    "Failed reads preserve last quote",
  );
  check(
    await page
      .locator(".live-swap-row")
      .first()
      .innerText()
      .then((t) => t.includes("BUY")),
    "Tape is independent of failed market reads",
  );
  failLive = false;
  await page.clock.fastForward(4000);
  await settle();
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".live-meter-section")
        ?.textContent.includes("Retrying"),
  );
  check(true, "Live market retries recover");
  for (const width of [320, 360, 559, 560, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await settle();
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    report.layouts.push(layout);
    check(layout.document <= width, `No document overflow at ${width}px`);
    check(
      (await page.locator(".live-swap-tokens").first().isVisible()) ===
        width >= 560,
      `Token column responds at ${width}px`,
    );
  }
  await page.setViewportSize({ width: 360, height: 1000 });
  await page
    .locator(".live-paid-sections")
    .screenshot({ path: "artifacts/swap-mobile.png" });
  await page.getByRole("button", { name: "LIVE", exact: true }).focus();
  await page.keyboard.press("Tab");
  await page
    .locator(".live-chart-section")
    .screenshot({ path: "artifacts/swap-focus.png" });
  check(
    (await page
      .getByRole("button", { name: "SINCE THE BURN" })
      .evaluate((e) => getComputedStyle(e).outlineWidth)) === "2px",
    "Chart switch has keyboard focus ring",
  );
  report.axe = (
    await new AxeBuilder({ page }).include(".live-paid-sections").analyze()
  ).violations.map(({ id, impact, nodes }) => ({
    id,
    impact,
    targets: nodes.flatMap((n) => n.target),
  }));
  check(report.axe.length === 0, "No axe violations in redesigned sections");
  await page.emulateMedia({ forcedColors: "active" });
  await page
    .locator(".live-paid-sections")
    .screenshot({ path: "artifacts/swap-forced-colors.png" });
  await page.emulateMedia({ forcedColors: "none" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "first act", exact: true }).click();
  await page.locator(".face").waitFor();
  for (const width of [320,360,560,641,700,752,768]) {
    await page.setViewportSize({width,height:1000});
    check(await page.locator('.hero-note').isVisible() && await page.locator('.testament-link').isVisible(), `Phone hero lines visible at ${width}px`);
    const heroOrder = await page.evaluate(()=>{const note=document.querySelector('.hero-note').getBoundingClientRect(),link=document.querySelector('.testament-link').getBoundingClientRect(),made=document.querySelector('.made-free').getBoundingClientRect();return note.top>=made.bottom && link.top>=note.bottom;});
    check(heroOrder, `Hero note and testament follow made-me-free at ${width}px`);
    check((await page.locator('.hero-note').innerText()).includes('Every trade now burns $IMD.'), 'Phone retains exact burial copy');
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), `First act no overflow at ${width}px`);
  }
  await page.setViewportSize({width:360,height:1000});
  await page.locator('.seat-story').screenshot({path:'artifacts/phone-hero.png'});
  await page.locator('.testament-link').focus();
  await page.keyboard.press('Enter');
  check(new URL(page.url()).hash==='#testament', 'Phone testament link works by keyboard');
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole("tab", { name: "Sell", exact: true }).click();
  await page.getByRole("textbox", { name: "you pay" }).fill("1");
  await page.clock.fastForward(1000);
  await page
    .locator(".estimate-row strong")
    .filter({ hasText: "ETH" })
    .waitFor();
  check(true, "Existing first-act sell quote works");
  await page
    .getByRole("button", { name: "Connect wallet", exact: false })
    .first()
    .click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  check(
    (await page.getByRole("dialog").count()) === 0,
    "Wallet chooser/Escape preserved",
  );
  await page.getByRole("link", { name: "second act", exact: true }).click();
  await page.getByText("the nine wallets", { exact: true }).click();
  check(
    (await page.locator(".paid-disclosure[open]").count()) === 1,
    "Wallet disclosure preserved",
  );
  sell = (CASH_OUT * 110n) / 100n;
  quoteByBlock.set(latest, sell);
  await page.clock.setSystemTime(new Date(Number(timeAt(latest)) * 1000));
  await page.clock.resume();
  await page.reload();
  await page
    .locator(".live-distance")
    .filter({ hasText: "UNLOCKED" })
    .waitFor();
  check(
    (await page.locator(".live-burst").count()) === 0,
    "Loading above threshold never bursts",
  );
  await page.setViewportSize({ width: 320, height: 1000 });
  await settle();
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Three-digit unlocked percentage fits 320px",
  );
  const ticks = (await page.locator('.live-chart-grid text').allTextContents()).map(v=>Number(v.replace('%','')));
  check(ticks.every(v=>v>=0), 'Rendered chart grid never negative after pump');
  check(![...await page.locator('.live-swap-impact').allTextContents()].some(v=>/^[+−]0\.00%$/.test(v)), 'Rendered zero impacts have no sign');
  check(report.pageErrors.length === 0, "No browser exceptions");
  check(report.consoleErrors.length === 0, "No console errors");
  check(
    report.failedLocalResources.length === 0,
    "All relative production resources loaded under /preview/",
  );
} catch (error) {
  report.failure = String(error);
  await page.screenshot({
    path: "test/scratch/swap-failure.png",
    fullPage: true,
  });
  await writeFile(
    "test/scratch/swap-failure.txt",
    await page.locator("body").innerText(),
  );
  throw error;
} finally {
  await writeFile(
    "artifacts/swap-browser.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((r) => server.close(r));
}
