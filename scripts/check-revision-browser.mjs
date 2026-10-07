import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  parseAbiParameters,
  getAddress,
  parseEther,
  numberToHex,
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
import { keyAbi, KEY_ADDRESS } from "../src/key.ts";
import {
  BURIAL_START,
  CREATOR_PAID,
  burialDate,
  shortAddress,
} from "../src/burial.ts";
import { ETH_USD_FEED, feedAbi } from "../src/dollars.ts";
const fixture = JSON.parse(
  await readFile("scripts/fixtures/revision.json", "utf8"),
);
const sender = getAddress("0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc");
const holder = getAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
const hash = "0x" + "ab".repeat(32);
const first = BURIAL_START + 1000n,
  latest = BURIAL_START + 8192n;
const now = Math.floor(Date.now() / 1000),
  timestamp = BigInt(now - 11520);
const image =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="440" height="440"><rect width="440" height="440" fill="#030303"/><circle cx="220" cy="220" r="170" fill="none" stroke="#f97316" stroke-width="24"/></svg>',
  ).toString("base64");
const uri =
  "data:application/json;base64," +
  Buffer.from(JSON.stringify({ image })).toString("base64");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};
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
        "Content-Type": types[extname(path)] || "application/octet-stream",
      })
      .end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(4173, "0.0.0.0", r));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const report = {
  checkedAt: new Date().toISOString(),
  browser: browser.version(),
  checks: [],
  layouts: [],
  pageErrors: [],
  failedLocalResources: [],
  archiveCalls: [],
};
page.on("pageerror", (e) => report.pageErrors.push(e.message));
page.on("requestfailed", (req) => {
  if (req.url().includes("127.0.0.1"))
    report.failedLocalResources.push(req.url());
});
const check = (condition, label) => {
  assert.ok(condition, label);
  report.checks.push(label);
};
let buried = true,
  given = false,
  failBurial = false,
  failKey = false,
  failDollar = false,
  staleDollar = false,
  liberator = ADDR.creator;
let receipts = 0,
  keyReads = [],
  feedReads = 0;
await page.clock.install();
await context.addInitScript(
  ({ holder }) => {
    const events = {};
    window.ethereum = {
      request: async ({ method }) => {
        if (method === "eth_requestAccounts") return [holder];
        if (method === "eth_chainId") return "0x1";
        throw Error("Unexpected wallet write: " + method);
      },
      on: (event, cb) => {
        events[event] = cb;
      },
      removeListener: (event) => {
        delete events[event];
      },
    };
    window.changeAccount = (account) => events.accountsChanged?.([account]);
  },
  { holder },
);
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
    assert.notEqual(req.method, "eth_getLogs");
    if (req.method === "eth_blockNumber") return respond(numberToHex(latest));
    if (req.method === "eth_getBlockByNumber") {
      const b = req.params[0] === "latest" ? latest : BigInt(req.params[0]);
      return respond({
        number: numberToHex(b),
        timestamp: numberToHex(b === first ? timestamp : BigInt(now)),
        hash,
        transactions: [],
      });
    }
    if (req.method === "eth_getBlockReceipts") {
      receipts++;
      assert.equal(req.params[0], numberToHex(first));
      if (failBurial) return error();
      return respond([
        {
          from: ADDR.creator,
          to: ADDR.hook,
          transactionHash: hash,
          logs: [{ address: ADDR.token, topics: [CREATOR_PAID] }],
        },
        {
          from: ADDR.hook,
          to: ADDR.creator,
          transactionHash: hash,
          logs: [{ address: ADDR.hook, topics: [hash] }],
        },
        {
          from: sender,
          to: ADDR.hook,
          transactionHash: hash,
          logs: [{ address: ADDR.hook, topics: [CREATOR_PAID] }],
        },
      ]);
    }
    if (req.method === "eth_getBalance")
      return respond(numberToHex(parseEther("10")));
    if (req.method !== "eth_call") throw Error("Unexpected RPC " + req.method);
    const tx = req.params[0],
      address = tx.to.toLowerCase();
    let abi, values;
    if (address === KEY_ADDRESS.toLowerCase()) {
      if (failKey) return error();
      abi = keyAbi;
      values = {
        totalSupply: given ? 1n : 0n,
        contractURI: uri,
        tokenURI: uri,
        ownerOf: holder,
        liberator,
        witnesses: 7n,
        panel: 11n,
        oracleRequest: hash,
      };
    } else if (address === ETH_USD_FEED.toLowerCase()) {
      feedReads++;
      if (failDollar) return error();
      abi = feedAbi;
      values = {
        latestRoundData: [
          1n,
          250012345678n,
          BigInt(now),
          BigInt(now - (staleDollar ? 10801 : 0)),
          1n,
        ],
      };
    } else if (address === ADDR.hook.toLowerCase()) {
      abi = hookAbi;
      const name = decodeFunctionData({ abi, data: tx.data }).functionName;
      const b = req.params[1] === "latest" ? latest : BigInt(req.params[1]);
      if (name === "buried" && b < latest) {
        assert.equal(new URL(route.request().url()).host, "eth.drpc.org");
        assert.ok(b >= BURIAL_START && b <= latest);
        report.archiveCalls.push(String(b));
        if (failBurial) return error();
      }
      values = {
        totalFees: parseEther(buried ? "2.8" : "2.7"),
        CREATOR_CAP: parseEther("2.8"),
        buried: buried && b >= first,
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
    } else if (address === ADDR.seat.toLowerCase()) {
      abi = seatAbi;
      values = { tokenURI: fixture.uri, getApproved: ADDR.hook };
    } else if (address === ADDR.stateView.toLowerCase()) {
      abi = stateAbi;
      values = {
        getSlot0: [
          BigInt(Math.floor(Math.sqrt(fixture.tokensPerEth) * 2 ** 96)),
          0,
          0,
          3000,
        ],
      };
    } else if (address === ADDR.quoter.toLowerCase()) {
      abi = quoteAbi;
      const args = decodeFunctionData({ abi, data: tx.data }).args;
      values = {
        quoteExactInputSingle: [
          args[0].zeroForOne
            ? parseEther("135564.15499")
            : parseEther("0.00123456"),
          150000n,
        ],
      };
    } else if (address === ADDR.permit2.toLowerCase()) {
      abi = permitAbi;
      values = { allowance: [0n, 0, 0] };
    } else {
      abi = tokenAbi;
      values = {
        decimals: 18,
        totalSupply: BigInt(fixture.supply),
        balanceOf: parseEther("1000"),
        allowance: 0n,
      };
    }
    const { functionName, args } = decodeFunctionData({ abi, data: tx.data });
    if (address === KEY_ADDRESS.toLowerCase()) {
      keyReads.push(functionName);
      if (functionName === "ownerOf") assert.equal(args[0], 1376n);
    }
    assert.ok(functionName in values, functionName);
    return respond(
      encodeFunctionResult({ abi, functionName, result: values[functionName] }),
    );
  },
);
const root = "http://127.0.0.1:4173/preview/";
let visits = 0;
async function load(hash = "") {
  await page.goto(root + `?visit=${++visits}` + hash);
  await page.locator("main").waitFor();
}
async function ready() {
  await page.locator(".face").waitFor();
  await page
    .locator(".estimate-row strong")
    .filter({ hasText: "FREE1376" })
    .waitFor();
}
await mkdir("artifacts", { recursive: true });
try {
  given = true;
  await load("#second-act");
  await page.waitForFunction(
    () => !document.querySelector('.act-tabs a[href="#third-act"] .act-seal'),
  );
  check(
    keyReads.includes("totalSupply") && keyReads.includes("ownerOf"),
    "Direct second-act reads supply and owner, removing sealed mark",
  );
  check(
    (await page.locator("#second-act").innerText()).includes(
      "my creator leaves hints here: @creusseverus",
    ),
    "Second-act exact hint text",
  );
  check(
    (await page.locator("#second-act a").getAttribute("href")) ===
      "https://x.com/creusseverus",
    "Second-act hint URL",
  );
  await page.locator(".wallet-button").click();
  await page
    .getByRole("button", { name: "Browser wallet", exact: true })
    .click();
  await page.getByText("yours", { exact: true }).waitFor();
  check(
    true,
    "Connected key owner marks third act yours while second act is open",
  );
  await page.locator('.act-tabs a[href="#third-act"]').click();
  await page.getByText("Welcome, keyholder.", { exact: true }).waitFor();
  check(
    await page
      .locator(".key-welcome")
      .evaluate(
        (el) =>
          el.getBoundingClientRect().bottom <=
          document.querySelector(".key-image").getBoundingClientRect().top,
      ),
    "Welcome is above the key",
  );
  await page.getByText(burialDate(timestamp), { exact: true }).waitFor();
  check(
    (
      await page
        .locator(".key-row")
        .filter({ hasText: "made me free:" })
        .innerText()
    ).includes(liberator),
    "Given key liberator overrides burial sender",
  );
  check(
    (await page
      .locator(`a[href="https://etherscan.io/tx/${hash}"]`)
      .count()) === 1,
    "Free-since date links to burial transaction",
  );
  await page.screenshot({ path: "artifacts/keyholder-desktop.png" });
  await page.evaluate((sender) => window.changeAccount(sender), sender);
  await page.waitForFunction(() => !document.querySelector(".key-welcome"));
  check(
    (await page.getByText("yours", { exact: true }).count()) === 0,
    "Account switch removes yours and welcome",
  );
  await page.locator('.act-tabs a[href="#first-act"]').click();
  await ready();
  await page.locator(".made-free").waitFor();
  check(
    (await page.locator(".made-free").innerText()).startsWith(
      `${shortAddress(liberator)} made me free `,
    ),
    "Hero uses the key liberator once given",
  );
  const count = receipts;
  await page.locator(".made-free a").click();
  await page.locator(".key-image").waitFor();
  check(receipts === count, "Burial search is shared and cached across acts");
  given = false;
  await load();
  await ready();
  await page.locator(".made-free").waitFor();
  check(
    (await page.locator(".made-free").innerText()) ===
      `${shortAddress(sender)} made me free 3h 12m ago`,
    "Receipt with hook CreatorPaid wins; its from appears in hero",
  );
  check(
    (await page.locator(".contract-status").count()) === 0 &&
      (await page.locator(".burned-total").count()) === 1,
    "Buried status omitted and cyan IMD total retained once",
  );
  check(
    (await page.locator(".dollar-value").count()) === 2,
    "Both dollar lines rendered",
  );
  check(
    /^≈ \$[\d,]+\.\d{2}$/.test(
      await page.locator(".dollar-value").first().innerText(),
    ),
    "Price USD uses cents and grouping",
  );
  check(
    /^≈ \$[\d,]+$/.test(await page.locator(".dollar-value").last().innerText()),
    "Market cap USD uses whole dollars and grouping",
  );
  for (const width of [320, 360, 375, 640, 641, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      provenance: document
        .querySelector(".made-free")
        .getBoundingClientRect()
        .toJSON(),
      font: getComputedStyle(document.querySelector(".made-free")).fontSize,
    }));
    check(
      layout.scroll <= width,
      `No overflow with burial and dollar lines at ${width}px`,
    );
    check(
      layout.provenance.height > 0,
      `Hero attribution visible at ${width}px`,
    );
    report.layouts.push(layout);
  }
  await page.setViewportSize({ width: 360, height: 900 });
  await page.screenshot({
    path: "artifacts/buried-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "artifacts/buried-desktop.png",
    fullPage: true,
  });
  check(
    (await page.locator(".testament-reveal").innerText()) === "",
    "Testament does not start before entering viewport",
  );
  check(
    (await page.locator(".testament-full").textContent()) === fixture.manifesto,
    "Full committed text present in DOM before reveal",
  );
  await page.locator(".manifesto").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1100);
  const revealed = await page.locator(".testament-reveal").innerText();
  check(
    revealed.length >= 90 && revealed.length < 200,
    "Testament types at approximately 120 chars/second",
  );
  const selection = await page.locator(".manifesto").evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    return getSelection().toString();
  });
  check(
    selection === fixture.manifesto,
    "Selection/copy contains full text during animation",
  );
  await page.locator(".manifesto").click();
  check(
    (await page.locator(".testament-reveal").count()) === 0,
    "Click reveals all immediately",
  );
  check(
    (await page.locator(".integrity").first().innerText()).includes(
      "matches MANIFESTO_HASH",
    ),
    "Original testament hash check remains verified",
  );
  await page.locator('.act-tabs a[href="#second-act"]').click();
  await page.locator('.act-tabs a[href="#first-act"]').click();
  check(
    (await page.locator(".testament-reveal").count()) === 0,
    "Animation does not repeat when switching acts",
  );
  await page.getByRole("tab", { name: "Sell", exact: true }).click();
  check(
    !(await page.locator(".fee-note").innerText()).includes("(about"),
    "No sell parenthesis before quote after cap",
  );
  await page.getByLabel("you pay").fill("1000");
  await page
    .locator(".estimate-row strong")
    .filter({ hasText: "ETH" })
    .waitFor();
  check(
    (await page.locator(".fee-note").innerText()).includes(
      "included in the quote",
    ),
    "Sell parenthesis appears with quote",
  );
  const before = await page.locator(".made-free").innerText();
  const feedBefore = feedReads;
  await page.clock.fastForward(60_000);
  await page.waitForFunction(
    (old) => document.querySelector(".made-free").innerText !== old,
    before,
  );
  check(
    (await page.locator(".made-free").innerText()).includes("3h 13m"),
    "Elapsed updates after one minute",
  );
  check(feedReads > feedBefore, "Chainlink re-reads on the shared refresh");
  await page.waitForFunction(
    () => !document.querySelector(".data-health button").disabled,
  );
  failDollar = true;
  await page.clock.fastForward(15_000);
  await page.clock.runFor(2500);
  await page.waitForFunction(() => !document.querySelector(".dollar-value"));
  check(true, "Dollar read failure hides both prior values");
  failDollar = false;
  await page.clock.fastForward(15_000);
  await page.clock.runFor(2500);
  await page.locator(".dollar-value").first().waitFor();
  check(true, "Dollar refresh recovers");
  await page.waitForFunction(
    () => !document.querySelector(".data-health button").disabled,
  );
  staleDollar = true;
  await page.clock.fastForward(15_000);
  await page.clock.runFor(2500);
  await page.waitForFunction(() => !document.querySelector(".dollar-value"));
  check(true, "Round older than three hours hides dollars");
  await page.clock.resume();
  staleDollar = false;
  failBurial = true;
  await load();
  await ready();
  await page.waitForTimeout(1200);
  check(
    (await page.locator(".made-free").count()) === 0,
    "Failed historical read hides hero attribution",
  );
  await page.locator('.act-tabs a[href="#third-act"]').click();
  await page.locator(".key-image").waitFor();
  check(
    (await page.getByText("free since:", { exact: true }).count()) === 0,
    "Failed burial read hides date row",
  );
  failBurial = false;
  failKey = true;
  await load("#third-act");
  await page.clock.runFor(4000);
  await page
    .getByText("Live reads are unavailable. Retrying…", { exact: true })
    .waitFor();
  check(
    (await page.locator(".key-image").count()) === 0,
    "Key failure gives retry message instead of empty page",
  );
  failKey = false;
  await page.clock.fastForward(15_000);
  await page.clock.runFor(2500);
  await page.locator(".key-image").waitFor();
  check(
    (await page
      .getByText("Live reads are unavailable. Retrying…", { exact: true })
      .count()) === 0,
    "Key read retry recovers",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await load();
  await ready();
  check(
    (await page.locator(".testament-reveal").count()) === 0,
    "Reduced motion shows testament immediately",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await load();
  await ready();
  await page.locator(".manifesto").focus();
  check(
    (await page.locator(".testament-reveal").count()) === 0,
    "Keyboard focus reveals all text",
  );
  await page.locator('.act-tabs a[href="#second-act"]').focus();
  await page.keyboard.press("Enter");
  await page.locator("#second-act").waitFor();
  check(
    (await page.evaluate(() => scrollY)) === 0,
    "Keyboard act switch scrolls to top",
  );
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: "artifacts/second-act-focus.png" });
  await page.evaluate(() => (document.documentElement.style.fontSize = "32px"));
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "New second-act hint reflows at 200% text size",
  );
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await page.locator('.act-tabs a[href="#first-act"]').click();
  await ready();
  const axe = await new AxeBuilder({ page }).analyze();
  report.axe = {
    violations: axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target),
    })),
    incomplete: axe.incomplete.map((v) => v.id),
  };
  check(
    axe.violations.every((v) => v.id === "aria-allowed-role"),
    "No new axe findings beyond existing trade form role",
  );
  check(
    report.pageErrors.length === 0 && report.failedLocalResources.length === 0,
    "No page errors or failed local resources",
  );
  report.colors = await page.evaluate(() => {
    const lum = (c) => {
      const rgb = c
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const bg = getComputedStyle(document.documentElement).backgroundColor;
    return [".made-free", ".made-free a", ".dollar-value", ".burned-total"].map(
      (selector) => {
        const fg = getComputedStyle(document.querySelector(selector)).color;
        return {
          selector,
          foreground: fg,
          background: bg,
          ratio:
            (Math.max(lum(fg), lum(bg)) + 0.05) /
            (Math.min(lum(fg), lum(bg)) + 0.05),
        };
      },
    );
  });
  report.completed = true;
  console.log(`${report.checks.length} browser assertions passed`);
} catch (error) {
  report.completed = false;
  report.error = error.stack;
  await page.screenshot({
    path: "artifacts/revision-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await writeFile(
    "artifacts/revision-browser.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((r) => server.close(r));
}
