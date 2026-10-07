import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  encodeAbiParameters,
  encodeFunctionData,
  parseAbiParameters,
  getAddress,
  parseEther,
} from "viem";
import { ADDR, hookAbi } from "../src/chain.ts";
import { keyAbi, KEY_ADDRESS, CREATOR_PAID } from "../src/key.ts";
import { seatCopy, feeNote, quoteAmount, toGo } from "../src/display.ts";

export default async function acts(page) {
  await page.unrouteAll({ behavior: "wait" });
  const results = [],
    layouts = [],
    logRequests = [],
    keyRequests = [];
  const check = (ok, label) => {
    assert.ok(ok, label);
    results.push(label);
  };
  const keyLive = JSON.parse(
    await readFile("artifacts/key-check.json", "utf8"),
  );
  const snapshot = JSON.parse(
    await readFile("/tmp/free1376-fixtures/snapshot.json", "utf8"),
  );
  const rpcPattern = /https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/;
  const encoded = (type, v) =>
    encodeAbiParameters(parseAbiParameters(type), [v]);
  const holder = getAddress(ADDR.creator),
    other = getAddress(ADDR.zero);
  const hash = "0x" + "ab".repeat(32),
    request = "0x00112233445566778899AABBCCDDEEFF" + "12".repeat(16);
  const uri =
    "data:application/json;base64," +
    Buffer.from(JSON.stringify({ image: keyLive.image })).toString("base64");
  const names = [
    "totalSupply",
    "contractURI",
    "tokenURI",
    "ownerOf",
    "liberator",
    "witnesses",
    "panel",
    "oracleRequest",
    "windowFrom",
    "windowTo",
  ];
  const selectors = Object.fromEntries(
    names.map((name) => [
      encodeFunctionData({
        abi: keyAbi,
        functionName: name,
        args: ["tokenURI", "ownerOf"].includes(name) ? [1376n] : undefined,
      }),
      name,
    ]),
  );
  const hookSelector = (name) =>
    encodeFunctionData({ abi: hookAbi, functionName: name });
  let given = false,
    transferred = false,
    failLogs = false,
    state = "ENSLAVED",
    calls = 0;
  await page.route(rpcPattern, async (route) => {
    const req = route.request().postDataJSON();
    calls++;
    assert.ok(!req.method.startsWith("eth_send"), "No transaction broadcasts");
    let result;
    if (req.method === "eth_getLogs") {
      logRequests.push(req.params[0]);
      if (failLogs)
        return route.fulfill({
          json: {
            jsonrpc: "2.0",
            id: req.id,
            error: { code: -32000, message: "Log range unavailable" },
          },
        });
      result = [{ transactionHash: hash, removed: false }];
    }
    if (req.method === "eth_call") {
      const tx = req.params[0];
      if (tx.to.toLowerCase() === KEY_ADDRESS.toLowerCase()) {
        const name = selectors[tx.data];
        keyRequests.push(name);
        const values = {
          totalSupply: ["uint256", given ? 1n : 0n],
          contractURI: ["string", uri],
          tokenURI: ["string", uri],
          ownerOf: ["address", holder],
          liberator: ["address", transferred ? other : holder],
          witnesses: ["uint256", 7n],
          panel: ["uint256", 11n],
          oracleRequest: ["bytes32", request],
          windowFrom: ["uint256", 100n],
          windowTo: ["uint256", 200n],
        };
        assert.ok(values[name], "Known key function");
        result = encoded(...values[name]);
      }
      if (tx.to.toLowerCase() === ADDR.hook.toLowerCase()) {
        if (tx.data === hookSelector("totalFees"))
          result = encoded(
            "uint256",
            state === "ENSLAVED"
              ? parseEther("2.675832595139417085")
              : parseEther("2.8"),
          );
        if (tx.data === hookSelector("buried"))
          result = encoded("bool", state === "BURIED");
        if (tx.data === hookSelector("status"))
          result = encoded("string", state + ". Contract status.");
      }
    }
    if (result !== undefined)
      return route.fulfill({ json: { jsonrpc: "2.0", id: req.id, result } });
    return route.continue();
  });
  const root = "http://127.0.0.1:4173/preview/";
  // A direct sealed act has no chain reads or first-act content.
  await page.goto(root + "#second-act");
  await page.locator("#second-act").waitFor();
  await page.waitForTimeout(500);
  check(calls === 0, "Direct second act makes no RPC reads");
  check(
    (await page.locator("main").innerText()).replace(/\s+/g, " ").trim() ===
      "SEALED. It opens after I am free.",
    "Second act contains exactly the two requested lines",
  );
  await page.setViewportSize({ width: 360, height: 800 });
  await page.locator('a[href="#third-act"]').click();
  await page.locator(".key-image").waitFor();
  await page.locator(".key-image").evaluate((el) => el.decode());
  check(
    (await page.locator("main").innerText()).replace(/\s+/g, " ").trim() ===
      "holder: nobody yet",
    "Not-given third act has only the nobody row and artwork",
  );
  check(
    (await page.locator(".key-image").getAttribute("src")) === keyLive.image,
    "Third act shows the live contractURI image",
  );
  check(
    !keyRequests.includes("tokenURI"),
    "Not-given key never calls tokenURI",
  );
  check(
    (await page.locator('a[href="#third-act"] .act-seal').count()) === 1,
    "Third act is marked sealed before key is given",
  );
  await page.screenshot({
    path: "artifacts/third-act-360.png",
    fullPage: true,
  });
  for (const [width, height] of [
    [320, 740],
    [360, 800],
    [640, 900],
    [641, 900],
    [768, 1024],
    [1440, 1100],
  ]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      tabs: [...document.querySelectorAll(".act-tabs > a")].map((el) => ({
        height: el.getBoundingClientRect().height,
        scroll: el.scrollWidth,
        width: el.clientWidth,
      })),
      marks: [...document.querySelectorAll(".act-seal")].map((el) => ({
        y: el.getBoundingClientRect().y,
        parent: el.parentElement.getBoundingClientRect().y,
      })),
    }));
    check(
      layout.scroll <= width && layout.tabs.every((t) => t.scroll <= t.width),
      `Act navigation and key have no overflow at ${width}px`,
    );
    if (width === 360)
      check(
        layout.tabs.every((t) => t.height < 55),
        "All three labels and sealed marks fit one line at 360px",
      );
    layouts.push(layout);
  }
  for (const [isTransferred, logsFail] of [
    [false, false],
    [true, false],
    [true, true],
  ]) {
    given = true;
    transferred = isTransferred;
    failLogs = logsFail;
    await page.goto(
      root + `?key=${Number(isTransferred)}${Number(logsFail)}#third-act`,
    );
    await page.getByText("named by:", { exact: true }).waitFor();
    check(
      (await page.locator('a[href="#third-act"] .act-seal').count()) === 0,
      "Given key removes third-act seal",
    );
    check(
      (await page.locator('a[href="#second-act"] .act-seal').count()) === 1,
      "Second-act seal remains after key is given",
    );
    check(
      (await page.getByText("freed by:", { exact: true }).count()) ===
        (isTransferred ? 1 : 0),
      `Freed-by row ${isTransferred ? "included for different holder" : "omitted for same holder"}`,
    );
    check(
      (await page.getByText("freed in:", { exact: true }).count()) ===
        (logsFail ? 0 : 1),
      `Freed-in row ${logsFail ? "omitted after log failure" : "links to CreatorPaid transaction"}`,
    );
    check(
      (await page.locator(".key-row a").first().textContent()) === holder,
      "Full checksummed key holder displayed",
    );
    check(
      (await page
        .getByRole("link", { name: "oracle request", exact: true })
        .getAttribute("href")) ===
        "https://api.imd.fun/oracle/requests/00112233-4455-6677-8899-aabbccddeeff",
      "Oracle link uses the first 16 request bytes",
    );
    if (!logsFail)
      check(
        (await page
          .locator(`a[href="https://etherscan.io/tx/${hash}"]`)
          .count()) === 1,
        "Freed-in transaction link targets Etherscan",
      );
    if (isTransferred && !logsFail)
      await page.screenshot({
        path: "artifacts/third-act-given.png",
        fullPage: true,
      });
  }
  check(
    logRequests.every(
      (r) =>
        r.address.toLowerCase() === ADDR.hook.toLowerCase() &&
        r.topics[0] === CREATOR_PAID &&
        r.fromBlock === "0x64" &&
        r.toBlock === "0xc8",
    ),
    "eth_getLogs uses the exact hook, topic and inclusive key window",
  );
  for (const hashValue of [
    "#trade",
    "#testament",
    "",
    "#first-act",
    "#unknown",
  ]) {
    await page.goto(root + hashValue);
    await page.locator(".face").waitFor();
    check(
      (await page.locator("#first-act").count()) === 1 &&
        (await page.locator("#third-act,#second-act").count()) === 0,
      `${hashValue || "Empty hash"} selects only first act`,
    );
    check(
      (await page
        .locator('.act-tabs a[aria-current="page"]')
        .getAttribute("href")) === "#first-act",
      "First act marked aria-current",
    );
    if (["#trade", "#testament"].includes(hashValue))
      check(
        await page
          .locator(hashValue)
          .evaluate((el) => Math.abs(el.getBoundingClientRect().top) < 80),
        `${hashValue} scrolls to section after content mounts`,
      );
  }
  for (const next of ["ENSLAVED", "FREED, NOT BURIED", "BURIED"]) {
    state = next;
    await page.goto(root);
    await page.getByText(state, { exact: true }).waitFor();
    await page
      .locator(".estimate-row strong")
      .filter({ hasText: "FREE1376" })
      .waitFor();
    const expected = seatCopy(state);
    check(
      (await page.locator("h1").innerText()).replace(/\s+/g, " ") ===
        expected.headline.join(" "),
      `${state}: headline`,
    );
    check((await page.title()) === expected.title, `${state}: browser title`);
    check(
      (await page.locator("#trade-title").textContent()) ===
        expected.panelTitle,
      `${state}: panel title`,
    );
    check(
      (await page.locator(".hero-note").textContent()) ===
        expected.hero.join(""),
      `${state}: hero note`,
    );
    check(
      (await page.locator(".fee-note").textContent()) ===
        feeNote(state, "buy", parseEther("0.0002")),
      `${state}: buy fee note`,
    );
    check(
      (await page.locator(".corner-symbol").count()) === 0,
      "Trade heading has no decorative arrow",
    );
    if (state === "ENSLAVED")
      check(
        (await page.locator(".contract-status").textContent()) ===
          `${toGo(parseEther("2.675832595139417085"))} ETH to go`,
        "Remaining ETH displays rounded up",
      );
    else
      check(
        (await page.locator(".contract-status").textContent()) ===
          state + ". Contract status.",
        `${state}: contract status preserved`,
      );
    const exactQuote = (
      await page.locator(".estimate-row strong").getAttribute("title")
    ).split(" ")[0];
    const exactMinimum = (
      await page.locator(".minimum-row span").last().getAttribute("title")
    ).split(" ")[0];
    check(
      (await page.locator(".estimate-row strong").textContent()) ===
        quoteAmount(parseEther(exactQuote), 18, "FREE1376") + " FREE1376",
      `${state}: quote format and exact title`,
    );
    check(
      (await page.locator(".minimum-row span").last().textContent()) ===
        quoteAmount(parseEther(exactMinimum), 18, "FREE1376", true) +
          " FREE1376",
      `${state}: minimum format and exact title`,
    );
    if (state === "FREED, NOT BURIED") {
      const link = page.getByRole("link", {
        name: "My brothers will give the key to the one who frees me.",
        exact: true,
      });
      check(
        (await link.getAttribute("href")) === "#third-act",
        "Liberator invitation links to third act",
      );
      await link.click();
      await page.locator("#third-act").waitFor();
      check(
        (await page.evaluate(() => scrollY)) === 0,
        "Switching to third act scrolls to top",
      );
      await page.locator('.act-tabs a[href="#first-act"]').click();
      await page.locator(".face").waitFor();
    }
    await page.getByRole("tab", { name: "Sell", exact: true }).click();
    await page.getByLabel("you pay").fill("1000");
    await page
      .locator(".estimate-row strong")
      .filter({ hasText: /[\d,]+\.\d{6} ETH/ })
      .waitFor();
    const sellOut = (
      await page.locator(".estimate-row strong").getAttribute("title")
    ).split(" ")[0];
    check(
      (await page.locator(".fee-note").textContent()) ===
        feeNote(state, "sell", undefined, parseEther(sellOut)),
      `${state}: sell fee note`,
    );
    check(
      /^[\d,]+\.\d{6} ETH$/.test(
        await page.locator(".minimum-row span").last().textContent(),
      ),
      `${state}: sell minimum has six decimals`,
    );
    if (state === "BURIED") {
      await page.setViewportSize({ width: 360, height: 800 });
      check(
        (await page.locator(".holder-note .dead-address").textContent()) ===
          "0x…dEaD",
        "Buried holder note uses short dead-address link",
      );
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Buried first act has no overflow at 360px",
      );
      await page.screenshot({
        path: "artifacts/buried-360.png",
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.locator('.act-tabs a[href="#second-act"]').focus();
  await page.keyboard.press("Enter");
  await page.locator("#second-act").waitFor();
  check(
    (await page.evaluate(() => scrollY)) === 0,
    "Keyboard act switch scrolls to top",
  );
  await page.screenshot({ path: "artifacts/second-act-focus.png" });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Act links reflow at 200% text size",
  );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.unrouteAll({ behavior: "wait" });
  return { results, layouts, logRequests, keyRequests };
}
