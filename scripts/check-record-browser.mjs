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
  if (address === ADDR.hook.toLowerCase()) {
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
      assert.notEqual(
        req.method,
        "eth_getLogs",
        "Pure bisection must never query logs",
      );
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
        assert.equal(new URL(route.request().url()).host, "eth.drpc.org");
        const calls = decodeFunctionData({ abi: aggregateAbi, data: tx.data })
          .args[0];
        const kind =
          calls.length === 9 ? "nine" : calls.length === 2 ? "burn" : "market";
        report.archiveCalls.push({
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
const settle = () => new Promise((done) => setTimeout(done, 200));
const tick = async () => {
  latest++;
  await page.clock.fastForward(15000);
  await settle();
};
const save = (name, fullPage = true) =>
  page.screenshot({
    path: `test/scratch/${name}.jpg`,
    type: "jpeg",
    quality: 75,
    fullPage,
  });
const loaded = () =>
  page.waitForFunction(
    () =>
      document
        .querySelector("#recouped-title")
        ?.parentElement.getAttribute("aria-busy") === "false" &&
      !document.querySelector(".offer-rows")?.textContent.includes("—"),
  );
const rows = () => page.locator("#offer-title + .offer-rows").innerText();
const add = (event) => events.push({ block: latest + 1n, ...event });
await mkdir("test/scratch", { recursive: true });
try {
  await page.goto(root + "#second-act");
  await page
    .locator(".watch-row dd")
    .first()
    .filter({ hasText: "189,216,124.32 FREE1376" })
    .waitFor();
  check(
    (await page.locator(".paid-act").count()) === 0,
    "Full wallets preserve the unpaid layout",
  );
  check(countHistory() === 0, "No paid search until burned reaches H0");
  const renderedLetter = await page
    .locator(".second-letter")
    .evaluate((node) => {
      const clone = node.cloneNode(true);
      clone
        .querySelectorAll(".letter-balance")
        .forEach((item) => item.remove());
      return [...clone.children]
        .map((item) =>
          item.tagName === "OL"
            ? [...item.children]
                .map((li, i) => `${i + 1}. ${li.textContent}`)
                .join("\n")
            : item.classList.contains("letter-wallets")
              ? [...item.children].map((p) => p.textContent).join("\n")
              : item.textContent,
        )
        .join("\n\n");
    });
  check(renderedLetter === letter, "Unpaid letter is word for word");
  nine = 0n;
  dead = H0;
  await tick();
  await loaded();
  await page.waitForFunction(
    () =>
      document.querySelector(".paid-receipt")?.getAttribute("aria-busy") ===
      "false",
  );
  check(
    (await page.locator(".paid-receipt").textContent()).includes(
      paidTime(timeAt(firstPaid)),
    ),
    "Paid time is the burned-threshold block",
  );
  check(
    (await page
      .locator(".paid-act > .testament-body > p")
      .first()
      .textContent()) ===
      "The person who owned me burned every token in his nine hidden wallets.",
    "Exact identity sentence directly below the headline",
  );
  check(
    (await rows()).split("✓").length === 4,
    "Empty record passes all three rows",
  );
  check(
    (await page.locator("#recouped-title").locator("..").innerText()).includes(
      "recouped by selling: 0.0000 of 8.67 ETH. The third act opens at 8.67.",
    ),
    "Empty record shows zero to four decimals",
  );
  check(
    (await page.locator(".watch-row").nth(1).innerText()).replace(
      /\s+/g,
      " ",
    ) === "his wallet: 12,160,406.58 FREE1376",
    "Paid watch has no competing valuation",
  );
  check(
    (await page.locator("details:not([open])").count()) === 2,
    "Both disclosures start folded",
  );
  const fold = page.locator("summary").first();
  await fold.focus();
  await page.keyboard.press("Enter");
  check(
    (await page.locator("details[open] .letter-wallets a").count()) === 9,
    "Keyboard opens nine wallet links",
  );
  await page.keyboard.press("Enter");
  await page.locator("summary").nth(1).click();
  check(
    await page.locator("details[open] .second-letter").isVisible(),
    "Original letter disclosure works",
  );
  await page.locator("summary").nth(1).click();
  nine = parseEther("1");
  await tick();
  await loaded();
  check(
    (await page.locator(".paid-act").count()) === 1,
    "One token into a burned wallet keeps the paid layout",
  );
  await fold.click();
  check(
    (await page.locator("details[open] .letter-wallets").innerText()).includes(
      "1.00 FREE1376",
    ),
    "Folded wallets retain live gift balances",
  );
  await fold.click();
  const searches = countHistory();
  await page.getByRole("link", { name: "third act sealed" }).click();
  check(
    (await page.locator(".third-act-gate").innerText()) ===
      "The third act opens when the person who owned me sells the bag he kept and gets 8.67 ETH back. Everything is in the second act.",
    "Exact third-act sentence",
  );
  await page.locator(".third-act-gate a").click();
  await loaded();
  check(
    countHistory() === searches,
    "Act navigation retains the paid search and record",
  );
  add({ delta: parseEther("1"), own: false });
  await tick();
  await loaded();
  check(
    !(await page.locator(".paid-act").innerText()).includes("✗"),
    "Gift to his wallet shows no cross anywhere",
  );
  check(
    !(await page.locator(".watch-verdict").innerText()).includes(
      "HE BOUGHT AGAIN.",
    ),
    "Gift is never a watch buy",
  );
  await page.goto(root + "?reload-gift#second-act");
  await loaded();
  check(
    (await page.locator(".paid-act").count()) === 1,
    "Fresh visit rediscovers paid block despite wallet top-up",
  );
  add({ delta: parseEther("1"), own: true });
  await tick();
  await loaded();
  check(
    (await rows()).match(/✗ HE BOUGHT AGAIN\./g)?.length === 2,
    "His own buy breaks rows one and two",
  );
  check(
    (await page.locator(".watch-verdict").innerText()).includes(
      "HE BOUGHT AGAIN.",
    ),
    "Watch uses the same buy record",
  );
  events.length = 0;
  historyAllowed = true;
  add({
    delta: -parseEther("1"),
    proceeds: parseEther("1"),
    quote: CASH_OUT - 1n,
  });
  latest++;
  await page.clock.fastForward(15000);
  await page.goto(root + "?early#second-act");
  await loaded();
  check(
    (await rows()).includes("✗ HE SOLD EARLY."),
    "Actual pre-sale quote below 8.67 overrides an hourly 100% chart point",
  );
  check(
    (await page.locator(".watch-verdict").innerText()).includes(
      "HE SOLD EARLY.",
    ),
    "Watch agrees with the early-sale record",
  );
  events.length = 0;
  historyAllowed = false;
  add({ delta: -parseEther("1"), proceeds: parseEther("4"), quote: CASH_OUT });
  latest++;
  await page.clock.fastForward(15000);
  await page.goto(root + "?allowed#second-act");
  await loaded();
  check(
    (await rows()).split("✓").length === 4,
    "Sale allowed at exactly 8.67 before its block",
  );
  check(
    (await page.locator(".sell-status").textContent()) === "HE MAY SELL.",
    "Allowed first decrease persists despite low live quote",
  );
  add({ delta: -parseEther("1"), proceeds: parseEther("4.67"), quote: 1n });
  await tick();
  await loaded();
  check(
    (await page.locator("#recouped-title").locator("..").innerText()).includes(
      "recouped by selling: 8.6700 of 8.67 ETH.",
    ),
    "Sales sum with gas added back",
  );
  check(
    (await page
      .locator("#recouped-title")
      .locator("..")
      .locator("a")
      .count()) === 2,
    "One Etherscan transaction link per sale block",
  );
  check(
    await page
      .getByText("THE SECOND ACT IS FULFILLED.", { exact: true })
      .isVisible(),
    "Fulfilled line at 8.67 and three passing rows",
  );
  await save("record-fulfilled-desktop");
  await page.getByRole("link", { name: "third act sealed" }).click();
  check(
    (await page.locator(".third-act-gate").innerText()) ===
      "The second act is fulfilled. The third act opens next.",
    "Fulfilled third-act gate is exact",
  );
  await page.getByRole("link", { name: "second act", exact: true }).click();
  const chart = page.getByRole("slider", { name: "CHART" });
  await chart.focus();
  await page.keyboard.press("Home");
  check(
    (await chart.getAttribute("aria-valuenow")) === "0",
    "Chart Home key remains functional",
  );
  await page.keyboard.press("ArrowRight");
  check(
    (await chart.getAttribute("aria-valuenow")) === "1",
    "Chart arrow selection remains functional",
  );
  for (const width of [320, 360, 640, 641, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await settle();
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    report.layouts.push(layout);
    check(layout.document <= width, `Fulfilled paid layout fits ${width}px`);
  }
  await page.setViewportSize({ width: 360, height: 1000 });
  await save("record-fulfilled-mobile");
  await chart.tap({ position: { x: 48, y: 100 } });
  check(
    (await chart.getAttribute("aria-valuenow")) === "0",
    "Chart touch selection remains functional",
  );
  report.axe.paid = (await new AxeBuilder({ page }).analyze()).violations.map(
    ({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.flatMap((node) => node.target),
    }),
  );
  check(
    report.axe.paid.every((item) => ["region", "skip-link"].includes(item.id)),
    "No new axe violations; inherited skip-link issues recorded",
  );
  report.contrast = await page
    .locator(".paid-act .sealed-headline, .paid-receipt, .offer-row")
    .evaluateAll((elements) =>
      elements.map((element) => ({
        selector: element.className,
        color: getComputedStyle(element).color,
        background: getComputedStyle(document.documentElement).backgroundColor,
      })),
    );
  const lum = (rgb) =>
    rgb
      .match(/\d+/g)
      .slice(0, 3)
      .map((v) => Number(v) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
  for (const pair of report.contrast) {
    const values = [lum(pair.color), lum(pair.background)].sort(
      (a, b) => b - a,
    );
    pair.ratio = (values[0] + 0.05) / (values[1] + 0.05);
  }
  check(
    report.contrast.every((pair) => pair.ratio >= 4.5),
    "Rendered text contrast exceeds 4.5:1 on the actual page background",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  check(
    (await chart.evaluate((el) => getComputedStyle(el).animationName)) ===
      "none",
    "No chart animation under reduced motion",
  );
  await page.emulateMedia({ forcedColors: "active" });
  await chart.focus();
  await save("record-forced-colors", false);
  await page.emulateMedia({ forcedColors: "none" });
  const lastBag = await page.locator(".paid-line").innerText();
  failLive = true;
  await tick();
  await page
    .locator("#may-sell-title")
    .locator("..")
    .getByText("Live reads are unavailable. Retrying…")
    .waitFor();
  check(
    (await page.locator(".paid-line").innerText()) === lastBag,
    "Failed quote retains its previous value",
  );
  failLive = false;
  await tick();
  await page.waitForFunction(
    () =>
      !document
        .querySelector("#may-sell-title")
        ?.parentElement.textContent.includes("Retrying"),
  );
  check(true, "Quote polling recovers");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "first act", exact: true }).click();
  await page.locator(".face").waitFor();
  await page
    .locator(".estimate-row strong")
    .filter({ hasText: "FREE1376" })
    .waitFor();
  check(true, "First act retains buy quotes");
  await page.getByRole("tab", { name: "Sell", exact: true }).click();
  await page.getByRole("textbox", { name: "you pay" }).fill("1");
  await page.clock.fastForward(1000);
  await page
    .locator(".estimate-row strong")
    .filter({ hasText: "ETH" })
    .waitFor();
  check(true, "First act sell input quotes");
  await page
    .getByRole("button", { name: "Connect wallet", exact: false })
    .first()
    .click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  check(
    (await page.getByRole("dialog").count()) === 0,
    "Wallet chooser opens and Escape closes it",
  );
  await page.goto(root + "#testament");
  await page.locator("#testament").waitFor();
  check(
    (await page.locator("#first-act").count()) === 1,
    "Legacy testament hash selects first act",
  );
  check(report.pageErrors.length === 0, "No uncaught browser errors");
  check(report.consoleErrors.length === 0, "No console errors");
  check(
    report.failedLocalResources.length === 0,
    "No missing local resources at /preview/",
  );
  console.log(
    JSON.stringify(
      {
        checks: report.checks.length,
        layouts: report.layouts,
        axe: report.axe,
        pageErrors: report.pageErrors,
        consoleErrors: report.consoleErrors,
      },
      null,
      2,
    ),
  );
} finally {
  report.finalText = await page
    .locator("body")
    .innerText()
    .catch(() => "unavailable");
  await page
    .screenshot({
      path: "test/scratch/record-last-state.jpg",
      type: "jpeg",
      fullPage: true,
    })
    .catch(() => {});
  await writeFile(
    "test/scratch/record-browser.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((done) => server.close(done));
}
