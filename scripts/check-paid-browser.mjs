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
    if (aggregate && block < latest)
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
        index === 0 ? (aggregate && block < firstPaid ? H0 : nine) : 0n;
    if (owner === HIS_WALLET.toLowerCase()) values.balanceOf = main;
    if (owner === DEAD.toLowerCase()) values.balanceOf = dead;
  }
  assert.ok(functionName in values, functionName);
  return encodeFunctionResult({
    abi,
    functionName,
    result: values[functionName],
  });
}
await context.route(
  /https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/,
  async (route) => {
    const req = route.request().postDataJSON();
    const respond = (result) =>
      route.fulfill({ json: { jsonrpc: "2.0", id: req.id, result } });
    const error = () =>
      route.fulfill({
        json: {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32000, message: "Mock read unavailable" },
        },
      });
    if (req.method === "eth_chainId") return respond("0x1");
    if (req.method === "eth_blockNumber") return respond(numberToHex(latest));
    if (req.method === "eth_getBlockByNumber") {
      const block = req.params[0] === "latest" ? latest : BigInt(req.params[0]);
      return respond({
        number: numberToHex(block),
        timestamp: numberToHex(timeAt(block)),
        hash,
        transactions: [],
      });
    }
    if (req.method === "eth_getBlockReceipts")
      return respond([
        {
          from: ADDR.creator,
          transactionHash: hash,
          logs: [{ address: ADDR.hook, topics: [CREATOR_PAID] }],
        },
      ]);
    if (req.method === "eth_getBalance")
      return respond(numberToHex(parseEther("10")));
    assert.equal(req.method, "eth_call", "only read-only RPC methods");
    const tx = req.params[0],
      block = req.params[1] === "latest" ? latest : BigInt(req.params[1]);
    if (tx.to.toLowerCase() === MULTICALL3.toLowerCase()) {
      assert.equal(new URL(route.request().url()).host, "eth.drpc.org");
      const calls = decodeFunctionData({ abi: aggregateAbi, data: tx.data })
        .args[0];
      const kind = calls.length === 9 ? "nine" : "market";
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
  },
);
const root = `http://127.0.0.1:${server.address().port}/preview/`;
const settle = () => new Promise((done) => setTimeout(done, 150));
const tick = async () => {
  latest++;
  await page.clock.fastForward(15000);
  await settle();
};
const save = (name, fullPage = false) =>
  page.screenshot({
    path: `artifacts/${name}.jpg`,
    type: "jpeg",
    quality: 78,
    fullPage,
  });
const waitPaid = () =>
  page.waitForFunction(
    () =>
      document.querySelector(".paid-receipt")?.getAttribute("aria-busy") ===
        "false" &&
      document.querySelector(".sell-status")?.textContent ===
        "HE MAY NOT SELL YET.",
  );

await mkdir("artifacts", { recursive: true });
try {
  await page.goto(root + "#second-act");
  await page
    .getByText("189,216,124.32 FREE1376", { exact: true })
    .last()
    .waitFor();
  check(
    (await page.locator(".paid-act").count()) === 0,
    "Full nine wallets retain the original second act",
  );
  check(
    countHistory() === 0,
    "No paid-block or chart reads before the full-burn verdict",
  );
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
                .map((li, index) => `${index + 1}. ${li.textContent}`)
                .join("\n")
            : item.classList.contains("letter-wallets")
              ? [...item.children].map((p) => p.textContent).join("\n")
              : item.textContent,
        )
        .join("\n\n");
    });
  check(
    renderedLetter === letter,
    "Unpaid letter matches the independent word-for-word fixture",
  );
  await save("unpaid-desktop");
  nine = 0n;
  dead = H0 - 1n;
  await tick();
  check(
    (await page.locator(".paid-act").count()) === 0,
    "Empty wallets with one wei too little burned do not open the paid layout",
  );
  dead = H0;
  await tick();
  await waitPaid();
  check(
    (await page.locator(".paid-receipt").textContent()).includes(
      paidTime(timeAt(firstPaid)),
    ),
    "Paid receipt uses the first zero-balance block timestamp in UTC",
  );
  check(
    (await page.locator("details:not([open])").count()) === 2,
    "Both disclosures start closed",
  );
  check(
    (await page.locator(".offer-row").count()) === 3,
    "Offer has one contract row per rule",
  );
  check(
    (await page.locator(".sell-percent").textContent()) === "11.0%",
    "Real quoted proceeds render an 11.0% meter",
  );
  check(
    (await page
      .getByRole("progressbar", { name: "MAY HE SELL" })
      .getAttribute("aria-valuenow")) === "11",
    "Meter exposes the numerical value",
  );
  check(
    (await page.locator(".chart-threshold").count()) === 1,
    "Chart has a dashed 100% line",
  );
  check(
    report.archiveCalls
      .filter((call) => call.kind === "market")
      .every((call) => call.length === 4),
    "Each chart block uses one aggregate for quote, slot0, feed and supply",
  );
  check(
    report.quotes.every((quote) => quote.amount === String(M0)),
    "History and initial live sell quotes use the exact M0 amount",
  );
  await save("paid-11-desktop", true);
  const fold = page.locator("summary").first();
  await fold.focus();
  await page.keyboard.press("Enter");
  check(
    (await page.locator("details[open] .letter-wallets a").count()) === 9,
    "Keyboard opens all nine full Etherscan links",
  );
  await page.keyboard.press("Enter");
  const letterFold = page.locator("summary").nth(1);
  await letterFold.click();
  check(
    await page.locator("details[open] .second-letter").isVisible(),
    "Letter disclosure opens the original letter",
  );
  await letterFold.click();
  const chart = page.getByRole("slider", { name: "CHART" });
  await chart.focus();
  await page.keyboard.press("Home");
  check(
    (await chart.getAttribute("aria-valuenow")) === "0",
    "Chart Home key selects the first point",
  );
  await page.keyboard.press("ArrowRight");
  check(
    (await chart.getAttribute("aria-valuenow")) === "1",
    "Chart arrow keys select the next point",
  );
  await save("paid-chart-keyboard");
  await page.keyboard.press("End");
  const endDetail = await page.locator(".chart-detail").textContent();
  const box = await chart.boundingBox();
  await page.mouse.move(box.x + 47, box.y + 100);
  check(
    (await page.locator(".chart-detail").textContent()) !== endDetail,
    "Hover reveals a historical point time, percentage and dollar market cap",
  );
  await page.mouse.move(0, 0);
  const readsBefore = countHistory();
  await page.getByRole("link", { name: "third act", exact: false }).click();
  await page.locator(".key-image").waitFor();
  check(
    (await page.getByRole("link", { name: "third act sealed" }).count()) === 1,
    "Third-act tab remains sealed even when the key is given",
  );
  check(
    await page
      .getByText(
        "The third act begins when he sells his bag and gets 8.67 ETH back.",
      )
      .isVisible(),
    "Third-act gate is above the preserved key",
  );
  check(
    (await page.locator(".key-rows a").count()) >= 2 &&
      (await page.locator(".resource-links a").count()) === 2,
    "Key rows and resource links remain available",
  );
  await save("third-act-gate");
  await tick();
  await page.getByRole("link", { name: "second act", exact: true }).click();
  check(
    countHistory() === readsBefore,
    "Changing acts never repeats the paid-block search",
  );
  main = M0 + 1n;
  await tick();
  check(
    (await page
      .locator(".offer-row")
      .filter({ hasText: "HE BOUGHT AGAIN." })
      .count()) === 2,
    "Buying one wei again breaks the first two offer rules",
  );
  check(
    report.quotes.at(-1).amount === String(M0),
    "An enlarged bag still quotes only M0",
  );
  main = M0 - 1n;
  await tick();
  check(
    (await page.locator(".offer-row").nth(2).textContent()).includes(
      "✗ HE SOLD EARLY.",
    ),
    "Selling before any 100% observation breaks the third offer rule",
  );
  check(
    report.quotes.at(-1).amount === String(main),
    "A smaller bag quotes its actual balance",
  );
  await save("offer-sold-early");
  main = M0;
  sell = CASH_OUT;
  await tick();
  await page.getByText("HE MAY SELL.", { exact: true }).waitFor();
  check(
    (await page.locator(".sell-percent").textContent()) === "100.0%",
    "8.67 ETH displays 100.0% and HE MAY SELL.",
  );
  await save("paid-100-desktop", true);
  sell = parseEther("0.9537");
  main = M0 - 1n;
  await tick();
  check(
    (await page.locator(".offer-row").nth(2).textContent()).endsWith("✓"),
    "A later lower quote preserves previously granted sell permission",
  );
  const lastBag = await page.locator(".paid-line").textContent();
  failLive = true;
  await tick();
  await page
    .locator(".paid-section")
    .filter({ has: page.locator("#may-sell-title") })
    .getByText("Live reads are unavailable. Retrying…")
    .waitFor();
  check(
    (await page.locator(".paid-line").textContent()) === lastBag,
    "Failed quotes retain the last value with the existing retry message",
  );
  failLive = false;
  await tick();
  await page.waitForFunction(
    () =>
      !document
        .querySelector("#may-sell-title")
        ?.parentElement?.textContent.includes("Retrying"),
  );
  check(true, "A successful poll clears the live-read failure");
  for (const width of [320, 360, 640, 641, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await settle();
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      chart: document.querySelector(".sell-chart").getBoundingClientRect()
        .width,
    }));
    report.layouts.push(layout);
    check(layout.document <= width, `Paid layout fits ${width}px`);
  }
  await page.setViewportSize({ width: 360, height: 1000 });
  await save("paid-11-mobile", true);
  await chart.tap({ position: { x: 48, y: 100 } });
  check(
    (await chart.getAttribute("aria-valuenow")) === "0",
    "Touch tap retains the selected historical point after pointer leave",
  );
  report.axe.paid = (await new AxeBuilder({ page }).analyze()).violations.map(
    ({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.flatMap((node) => node.target),
    }),
  );
  const inherited = new Set(["region", "skip-link"]);
  check(
    report.axe.paid.every((item) => inherited.has(item.id)),
    "Axe reports no new paid-view violations (inherited skip-link/region issues recorded)",
  );
  report.contrast = await page
    .locator(
      ".paid-act .sealed-headline, .paid-receipt, .chart-detail, .offer-row",
    )
    .evaluateAll((elements) =>
      elements.map((element) => ({
        selector: element.className,
        color: getComputedStyle(element).color,
        background: getComputedStyle(document.documentElement).backgroundColor,
      })),
    );
  const channel = (v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const luminance = (rgb) =>
    rgb
      .match(/\d+/g)
      .slice(0, 3)
      .map((n) => channel(Number(n) / 255))
      .reduce((value, n, i) => value + n * [0.2126, 0.7152, 0.0722][i], 0);
  report.contrast.forEach((pair) => {
    const values = [luminance(pair.color), luminance(pair.background)].sort(
      (a, b) => b - a,
    );
    pair.ratio = (values[0] + 0.05) / (values[1] + 0.05);
  });
  check(
    report.contrast.every((pair) => pair.ratio >= 4.5),
    "Measured paid-view text colors exceed 4.5:1 against the rendered page background",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  check(
    (await chart.evaluate(
      (element) => getComputedStyle(element).animationName,
    )) === "none",
    "Chart adds no animation under reduced motion",
  );
  await page.emulateMedia({ forcedColors: "active" });
  await chart.focus();
  await save("paid-forced-colors");
  await page.emulateMedia({ forcedColors: "none" });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole("link", { name: "first act", exact: true }).click();
  await page.locator(".face").waitFor();
  await page
    .locator(".estimate-row strong")
    .filter({ hasText: "FREE1376" })
    .waitFor();
  check(
    (await page.getByText("I AM", { exact: false }).count()) > 0,
    "First act still renders its buried headline and a buy quote",
  );
  await page.getByRole("tab", { name: "Sell", exact: true }).click();
  await page.getByRole("textbox", { name: "you pay" }).fill("1");
  await page.clock.fastForward(1000);
  await page
    .locator(".estimate-row strong")
    .filter({ hasText: "ETH" })
    .waitFor();
  check(true, "First-act sell input returns a quote");
  await page
    .getByRole("button", { name: "Connect wallet", exact: false })
    .first()
    .click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  check(
    (await page.getByRole("dialog").count()) === 0,
    "Wallet chooser opens and closes with Escape",
  );
  await page.goto(root + "#testament");
  await page.locator("#testament").waitFor();
  check(
    (await page.locator("#first-act").count()) === 1,
    "Legacy testament hash still selects the first act",
  );
  // A fresh visit proves a historical 100% observation grants permission by itself.
  historyAllowed = true;
  main = M0 - 1n;
  await page.goto(root + "?history=allowed#second-act");
  await waitPaid();
  check(
    (await page.locator(".offer-row").nth(2).textContent()).endsWith("✓"),
    "Historical 100% sample allows a smaller bag despite an 11% live quote",
  );
  check(report.pageErrors.length === 0, "No uncaught browser errors");
  check(
    report.failedLocalResources.length === 0,
    "No failed local resources at the static subpath",
  );
  if (process.env.CHECK_LIVE_BROWSER === "1") {
    const liveContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const livePage = await liveContext.newPage();
    const errors = [];
    livePage.on("pageerror", (error) => errors.push(error.message));
    await livePage.goto(root + "#second-act");
    await livePage
      .locator(".watch-row dd")
      .first()
      .filter({ hasText: "189,216,124.32 FREE1376" })
      .waitFor({ timeout: 60000 });
    report.liveBrowser = {
      checkedAt: new Date().toISOString(),
      watch: await livePage.locator(".watch").innerText(),
      paidLayout: await livePage.locator(".paid-act").count(),
      errors,
    };
    check(
      report.liveBrowser.paidLayout === 0,
      "Real mainnet browser reads retain the original second act with full wallets",
    );
    await livePage.screenshot({
      path: "artifacts/live-unpaid-desktop.jpg",
      type: "jpeg",
      quality: 78,
    });
    await livePage.setViewportSize({ width: 360, height: 900 });
    await livePage.screenshot({
      path: "artifacts/live-unpaid-mobile.jpg",
      type: "jpeg",
      quality: 78,
    });
    await liveContext.close();
  }
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
  await writeFile(
    "artifacts/paid-browser.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((done) => server.close(done));
}
