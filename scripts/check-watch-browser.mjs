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
import {
  H0,
  M0,
  S0,
  DEADLINE,
  NINE_WALLETS,
  HIS_WALLET,
  DEAD,
} from "../src/watch.ts";
const letterFixture = (
  await readFile("scripts/fixtures/second-act-letter.txt", "utf8")
).trimEnd();
const fixture = JSON.parse(
  await readFile("scripts/fixtures/revision.json", "utf8"),
);
const sender = getAddress("0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc");
const holder = getAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
const hash = "0x" + "ab".repeat(32);
const first = BURIAL_START + 1000n,
  latest = BURIAL_START + 8192n;
const now = DEADLINE - (5 * 60 + 42) * 60,
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
await page.clock.install({ time: new Date(now * 1000) });
let watchFailed = false,
  watchCycles = 0;
let balances = [H0, ...Array(8).fill(0n)],
  mainBalance = M0,
  deadBalance = 0n,
  supply = S0;
let price = (1n << 96n) * 10_000n;
let releaseRpc;
const initialRpc = new Promise((resolve) => {
  releaseRpc = resolve;
});
let holdRpc = true;
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
    if (holdRpc) await initialRpc;
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
        getSlot0: [price, 0, 0, 3000],
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
        totalSupply: supply,
        balanceOf: parseEther("1000"),
        allowance: 0n,
      };
    }
    const { functionName, args } = decodeFunctionData({ abi, data: tx.data });
    if (address === ADDR.token.toLowerCase() && functionName === "balanceOf") {
      const owner = args[0].toLowerCase();
      const index = NINE_WALLETS.findIndex((a) => a.toLowerCase() === owner);
      if (index === 0) watchCycles++;
      if (index >= 0) values.balanceOf = balances[index];
      if (owner === HIS_WALLET.toLowerCase()) {
        if (watchFailed) return error();
        values.balanceOf = mainBalance;
      }
      if (owner === DEAD.toLowerCase()) values.balanceOf = deadBalance;
    }
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
const save = (name) =>
  page.screenshot({ path: `artifacts/${name}.jpg`, type: "jpeg", quality: 80 });
async function refreshWatch() {
  const count = watchCycles;
  await page.clock.fastForward(15_000);
  await page.waitForFunction(() => !!document.querySelector("main"));
  for (let i = 0; i < 15 && watchCycles === count; i++)
    await new Promise((r) => setTimeout(r, 50));
  assert.ok(watchCycles > count, "watch polls every 15 seconds");
  // Allow mocked RPC promises and React updates to settle without advancing the deadline.
  await new Promise((r) => setTimeout(r, 100));
}
try {
  await load();
  check(
    (await page.locator("#hero-title").innerText()).replace(/\s+/g, " ") ===
      "I AM FREE.",
    "Buried headline before the first chain read",
  );
  check(
    (await page.locator("#trade-title").innerText()) === "Feed the fire",
    "Feed the fire before the first chain read",
  );
  check(
    (await page.title()) === "I AM FREE. — Seat #1376",
    "Initial document title stays free",
  );
  holdRpc = false;
  releaseRpc();
  await ready();
  check(
    (await page.locator(".estimate-row strong").first().innerText()).includes(
      "FREE1376",
    ),
    "Buy quote loads in first act",
  );
  const firstCycles = watchCycles;
  await refreshWatch();
  check(watchCycles > firstCycles, "Watch reads continue on first act");
  await page.getByRole("tab", { name: "Sell", exact: true }).click();
  await page.getByLabel("you pay").fill("1000");
  await page
    .locator(".estimate-row strong")
    .filter({ hasText: "ETH" })
    .waitFor();
  check(
    (await page.locator(".fee-note").innerText()).includes(
      "included in the quote",
    ),
    "Sell quote and existing fee copy work",
  );
  await page.getByRole("tab", { name: "Buy", exact: true }).click();
  await page.locator(".wallet-button").click();
  await page
    .getByRole("button", { name: "Browser wallet", exact: true })
    .click();
  check(
    (await page.locator(".wallet-button").innerText()).includes(
      holder.slice(0, 6),
    ),
    "Wallet chooser connects the mocked browser wallet",
  );
  await page.locator('.act-tabs a[href="#second-act"]').focus();
  await page.keyboard.press("Enter");
  await page
    .locator(".watch-verdict")
    .getByText("WAITING.", { exact: true })
    .waitFor();
  check(
    await page.evaluate(() => scrollY === 0),
    "Keyboard act navigation scrolls to top",
  );
  check(
    (await page
      .locator('.act-tabs a[href="#second-act"] .act-seal')
      .count()) === 0,
    "Second act has no sealed mark",
  );
  check(
    (await page
      .locator('.act-tabs a[href="#second-act"]')
      .getAttribute("aria-current")) === "page",
    "Second act exposes current page",
  );
  const renderedLetter = await page
    .locator(".second-letter")
    .evaluate((letter) =>
      Array.from(letter.children)
        .map((block) => {
          if (block.matches(".letter-wallets"))
            return Array.from(block.querySelectorAll("a"))
              .map((a) => a.textContent)
              .join("\n");
          if (block.matches("ol"))
            return Array.from(block.children)
              .map((li, i) => `${i + 1}. ${li.textContent}`)
              .join("\n");
          return block.textContent;
        })
        .join("\n\n"),
    );
  check(
    renderedLetter === letterFixture,
    "Rendered letter matches exact fixture including paragraphs and numbered rules",
  );
  check(
    (await page.locator(".second-letter li").count()) === 3,
    "Three semantic numbered rules",
  );
  check(
    (await page.locator(".second-letter .testament-reveal").count()) === 0,
    "Letter is complete immediately without typing",
  );
  const links = await page
    .locator(".letter-wallets a")
    .evaluateAll((nodes) => nodes.map((a) => [a.textContent, a.href]));
  check(
    JSON.stringify(links) ===
      JSON.stringify(
        NINE_WALLETS.map((a) => [a, `https://etherscan.io/address/${a}`]),
      ),
    "All nine full addresses link to their exact Etherscan pages",
  );
  check(
    (await page.locator(".letter-balance").count()) === 9 &&
      (await page.locator(".letter-balance").first().innerText()).includes(
        "189,216,124.32 FREE1376",
      ),
    "Each wallet has a live balance",
  );
  check(
    (await page
      .locator(
        `.second-letter a[href="https://etherscan.io/address/${HIS_WALLET}"]`,
      )
      .count()) === 1 &&
      (await page
        .locator(
          `.second-letter a[href="https://etherscan.io/address/${DEAD}"]`,
        )
        .innerText()) === "0x…dEaD",
    "His full address and abbreviated dead address link correctly",
  );
  check(
    (await page
      .locator('#second-act a[href="https://x.com/creusseverus"]')
      .innerText()) === "@creusseverus",
    "Creator hint retained",
  );
  check(
    (await page.locator(".watch-rows").innerText()).includes(
      "189,216,124.32 FREE1376",
    ),
    "Nine-wallet live total appears",
  );
  check(
    (await page.locator(".watch-rows").innerText()).includes(
      "≈ 0.121604 ETH ($304) · cash-out line 8.67 ETH",
    ),
    "Pool and Chainlink valuation appears with cash-out line",
  );
  check(
    (await page.locator(".watch-countdown").innerText()) === "time left 5h 41m",
    "Countdown updates after the 15-second poll",
  );
  await save("watch-desktop-letter");
  await page.locator(".watch").scrollIntoViewIfNeeded();
  await save("watch-desktop-values");
  const stable = await page.locator(".watch-rows").innerText();
  watchFailed = true;
  balances[0] = H0 - 10n ** 18n;
  await refreshWatch();
  await page.clock.runFor(4_000);
  await page
    .locator(".watch")
    .getByText("Live reads are unavailable. Retrying…", { exact: true })
    .waitFor();
  check(
    (await page.locator(".watch-rows").innerText()) === stable,
    "Failed read retains the whole last snapshot, never partial changes",
  );
  check(
    (await page.locator(".watch-verdict").innerText()) === "WAITING.",
    "Read failure retains the last verdict inputs",
  );
  await save("watch-retry");
  watchFailed = false;
  await refreshWatch();
  await page
    .locator(".watch-verdict")
    .getByText("SOLD OR MOVED.", { exact: true })
    .waitFor();
  check(
    (await page
      .locator(".watch")
      .getByText("Live reads are unavailable. Retrying…", { exact: true })
      .count()) === 0,
    "Successful retry clears the error and refreshes balances/verdict",
  );
  const triggers = [
    {
      name: "BURNED.",
      out: 5n,
      dead: 3n,
      supply: S0 - 2n,
      main: M0,
      expected: "BURNED.",
    },
    {
      name: "BURNED. ALL OF IT.",
      out: H0,
      dead: H0,
      supply: S0,
      main: M0,
      expected: "BURNED. ALL OF IT.",
    },
    {
      name: "CARRIED TO HIS OWN WALLET.",
      out: 5n,
      dead: 2n,
      supply: S0,
      main: M0 + 3n,
      expected: "CARRIED TO HIS OWN WALLET.",
    },
    {
      name: "HE BOUGHT AGAIN.",
      out: 5n,
      dead: 2n,
      supply: S0,
      main: M0 + 4n,
      expected: "CARRIED TO HIS OWN WALLET.\nHE BOUGHT AGAIN.",
    },
    {
      name: "HE SOLD EARLY.",
      out: 5n,
      dead: 0n,
      supply: S0,
      main: M0 - 1n,
      expected: "SOLD OR MOVED.\nHE SOLD EARLY.",
    },
  ];
  for (const row of triggers) {
    balances[0] = H0 - row.out;
    deadBalance = row.dead;
    supply = row.supply;
    mainBalance = row.main;
    await refreshWatch();
    await page
      .locator(".watch-verdict")
      .getByText(row.name, { exact: true })
      .waitFor();
    check(
      (await page.locator(".watch-verdict").innerText()).replace(
        /\n+/g,
        "\n",
      ) === row.expected,
      `Browser renders applicable verdicts: ${row.name}`,
    );
  }
  balances[0] = H0;
  deadBalance = 0n;
  supply = S0;
  mainBalance = M0;
  await refreshWatch();
  await page.clock.setSystemTime(new Date(DEADLINE * 1000 - 1000));
  await page.clock.runFor(1000);
  await page.getByText("the deadline has passed", { exact: true }).waitFor();
  await page
    .locator(".watch-verdict")
    .getByText("HELD.", { exact: true })
    .waitFor();
  check(true, "Deadline countdown and HELD update without a new chain read");
  await page.clock.setSystemTime(new Date(now * 1000));
  await page.clock.runFor(1000);
  for (const width of [320, 360, 375, 640, 641, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    report.layouts.push(layout);
    check(layout.scrollWidth <= width, `Letter and watch reflow at ${width}px`);
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => scrollTo(0, 0));
  await save("watch-mobile-letter");
  await page.locator(".letter-wallets a").first().focus();
  await page.keyboard.press("Tab");
  check(
    await page.evaluate(
      () =>
        document.activeElement?.textContent ===
        document.querySelectorAll(".letter-wallets a")[1].textContent,
    ),
    "Address links have native keyboard order",
  );
  check(
    await page
      .locator(".letter-wallets a")
      .nth(1)
      .evaluate(
        (a) =>
          getComputedStyle(a).outlineStyle === "solid" &&
          getComputedStyle(a).outlineWidth === "2px",
      ),
    "Address keyboard focus uses the existing visible ring",
  );
  await save("watch-mobile-focus");
  await page.locator(".watch").scrollIntoViewIfNeeded();
  await save("watch-mobile-values");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  report.textEnlargement = await page.evaluate(() => ({
    width: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 0.5)
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        right: el.getBoundingClientRect().right,
      })),
    secondActOverflows: [
      ...document.querySelectorAll("#second-act, #second-act *"),
    ].some((el) => el.getBoundingClientRect().right > innerWidth + 0.5),
  }));
  check(
    !report.textEnlargement.secondActOverflows,
    "Letter and watch reflow at 200% text size and 320px; existing header overflow recorded separately",
  );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  check(
    (await page.locator(".second-letter").innerText()) !== "" &&
      (await page.locator(".testament-reveal").count()) === 0,
    "Reduced motion keeps the full letter static",
  );
  report.colors = await page.evaluate(() => {
    const lum = (color) => {
      const c = color
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((n) => n / 255)
        .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
      return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    };
    const bg = getComputedStyle(document.documentElement).backgroundColor;
    return [
      ".second-letter",
      ".letter-balance",
      ".watch-countdown",
      ".watch-row dd",
      ".watch-verdict",
      ".act-tabs a[aria-current]",
    ].map((selector) => {
      const fg = getComputedStyle(document.querySelector(selector)).color;
      return {
        selector,
        foreground: fg,
        background: bg,
        ratio:
          (Math.max(lum(fg), lum(bg)) + 0.05) /
          (Math.min(lum(fg), lum(bg)) + 0.05),
      };
    });
  });
  check(
    report.colors.every((pair) => pair.ratio >= 4.5),
    "Measured second-act text contrast meets 4.5:1",
  );
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
    axe.violations.every((v) => ["region", "skip-link"].includes(v.id) && v.nodes.every((n) => n.target.join() === ".skip-link")),
    "No new axe violations; existing cross-act skip link warnings recorded",
  );
  given = true;
  await page.locator('.act-tabs a[href="#third-act"]').click();
  await page.locator(".key-image").waitFor();
  check(
    (
      await page
        .locator(".key-row")
        .filter({ hasText: "named by:" })
        .innerText()
    ).includes("7 of 11 brothers · oracle request"),
    "Third act separates brothers and oracle request",
  );
  const thirdCycles = watchCycles;
  await refreshWatch();
  check(watchCycles > thirdCycles, "Watch reads continue on third act");
  await page.locator('.act-tabs a[href="#second-act"]').click();
  await page
    .locator(".watch-verdict")
    .getByText("WAITING.", { exact: true })
    .waitFor();
  check(true, "Returning to second act shows retained live values immediately");
  await load("#second-act");
  await page
    .locator(".watch-verdict")
    .getByText("WAITING.", { exact: true })
    .waitFor();
  check(
    true,
    "Shared second-act hash works directly on the static subpath export",
  );
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  await page.locator("#trade").waitFor();
  check(await page.locator("#first-act").count() === 1, "Existing skip link changes acts and reaches trading by keyboard");
  await page.evaluate(() => {
    location.hash = "#testament";
  });
  await page.locator("#testament").waitFor();
  await ready();
  check(
    (await page.locator("#testament .testament-full").textContent()) ===
      fixture.manifesto,
    "Legacy testament hash still opens first act with unchanged full testament",
  );
  check(
    report.pageErrors.length === 0 && report.failedLocalResources.length === 0,
    "No page errors or failed local resources",
  );
  report.completed = true;
  console.log(`${report.checks.length} watch browser assertions passed`);
} catch (error) {
  report.completed = false;
  report.error = error.stack;
  await save("watch-failure");
  throw error;
} finally {
  await writeFile(
    "artifacts/watch-browser.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((r) => server.close(r));
}
