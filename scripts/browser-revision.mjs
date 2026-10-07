import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  encodeAbiParameters,
  encodeFunctionData,
  encodeErrorResult,
  parseAbi,
  parseAbiParameters,
} from "viem";
import {
  ADDR,
  hookAbi,
  seatAbi,
  EXPECTED_MANIFESTO_HASH,
} from "../src/chain.ts";

export default async function revision(page) {
  const { snapshot } = JSON.parse(
    await readFile("/tmp/free1376-fixtures/fixtures.json", "utf8"),
  );
  const results = [];
  const check = (ok, label) => {
    assert.ok(ok, label);
    results.push(label);
  };
  const selector = (name) =>
    encodeFunctionData({ abi: hookAbi, functionName: name });
  const approvedCall = encodeFunctionData({
    abi: seatAbi,
    functionName: "getApproved",
    args: [1376n],
  });
  const encoded = (type, value) =>
    encodeAbiParameters(parseAbiParameters(type), [value]);
  const manifestoRequests = [];
  const readRequests = [];
  let state = "live",
    approval,
    rejectTrade = false;
  const rpcPattern = /https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/;
  await page.unrouteAll({ behavior: "wait" });
  await page.route(rpcPattern, async (route) => {
    const request = route.request().postDataJSON();
    assert.ok(
      !/eth_send/.test(request.method),
      "No transaction may be broadcast",
    );
    const tx = request.params?.[0];
    if (request.method !== "eth_call") return route.continue();
    let result;
    if (tx.to.toLowerCase() === ADDR.hook.toLowerCase()) {
      readRequests.push({ state, data: tx.data, block: request.params[1] });
      if (tx.data === selector("MANIFESTO")) {
        manifestoRequests.push(state);
        if (state !== "live")
          result = encoded(
            "string",
            state === "tampered"
              ? snapshot.manifesto + " "
              : snapshot.manifesto,
          );
      }
      if (state !== "live" && tx.data === selector("buried"))
        result = encoded("bool", ["buried", "tampered"].includes(state));
      if (state === "funded" && tx.data === selector("totalFees"))
        result = encoded("uint256", BigInt(snapshot.cap));
    }
    if (
      tx.to.toLowerCase() === ADDR.seat.toLowerCase() &&
      tx.data === approvedCall
    ) {
      readRequests.push({ state, data: tx.data, block: request.params[1] });
      if (approval !== undefined) result = encoded("address", approval);
    }
    if (rejectTrade && tx.to.toLowerCase() === ADDR.router.toLowerCase()) {
      const inner = encodeErrorResult({
        abi: parseAbi([
          "error V4TooLittleReceived(uint256 minAmountOutReceived, uint256 amountReceived)",
        ]),
        errorName: "V4TooLittleReceived",
        args: [100n, 90n],
      });
      const data = encodeErrorResult({
        abi: parseAbi([
          "error ExecutionFailed(uint256 commandIndex, bytes message)",
        ]),
        errorName: "ExecutionFailed",
        args: [0n, inner],
      });
      return route.fulfill({
        json: {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: 3, message: "execution reverted", data },
        },
      });
    }
    if (result !== undefined)
      return route.fulfill({
        json: { jsonrpc: "2.0", id: request.id, result },
      });
    return route.continue();
  });
  const refresh = async () => {
    await page.getByRole("button", { name: "refresh", exact: true }).click();
    await page.getByRole("button", { name: "refresh", exact: true }).waitFor();
  };
  const sealed = async (label) => {
    check(
      (await page.locator(".sealed-headline").textContent()) === "SEALED.",
      `${label}: exact sealed headline`,
    );
    check(
      (await page.locator(".manifesto").count()) === 0,
      `${label}: no manifesto element`,
    );
    check(
      await page
        .locator(".testament-link")
        .textContent()
        .then((t) => t.trim().startsWith("the testament is sealed")),
      `${label}: sealed hero link`,
    );
    check(
      (await page.locator(".hash").textContent()) ===
        `keccak256 ${EXPECTED_MANIFESTO_HASH}`,
      `${label}: exact commitment`,
    );
    check(
      await page
        .getByText("It opens in the transaction that frees me.", {
          exact: true,
        })
        .isVisible(),
      `${label}: opening condition`,
    );
    check(
      await page
        .getByText(
          "Anyone can check the text against this hash when it opens.",
          { exact: true },
        )
        .isVisible(),
      `${label}: verification explanation`,
    );
    check(
      await page.evaluate((text) => {
        const allText =
          document.documentElement.textContent +
          [...document.querySelectorAll("*")]
            .flatMap((el) => [...el.attributes].map((a) => a.value))
            .join("\n");
        const fragments = Array.from(
          { length: Math.floor(text.length / 80) },
          (_, i) => text.slice(i * 80, i * 80 + 80),
        );
        return (
          !allText.includes(text) &&
          fragments.every((fragment) => !allText.includes(fragment))
        );
      }, snapshot.manifesto),
      `${label}: no testament lines in any DOM text, title, meta or attribute`,
    );
    check(
      (await page
        .getByRole("link", { name: "opened on chain", exact: false })
        .count()) === 0,
      `${label}: no opening link`,
    );
  };
  await page.goto("http://127.0.0.1:4173/preview/");
  await page.locator(".face").waitFor({ timeout: 30000 });
  await sealed("Live unburied");
  check(
    manifestoRequests.length === 0,
    "Live sealed snapshot never requests MANIFESTO",
  );
  check(
    (await page.locator(".holder-note").textContent()).includes(
      "The holder has approved the hook to transfer the seat.",
    ),
    "Mainnet approval is reflected",
  );
  const layouts = [];
  for (const [width, height] of [
    [320, 740],
    [375, 667],
    [375, 812],
    [640, 900],
    [641, 900],
    [768, 1024],
    [1440, 1100],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => scrollTo(0, 0));
    await page
      .locator(".estimate-row strong")
      .filter({ hasText: "FREE1376" })
      .waitFor({ timeout: 20000 });
    const layout = await page.evaluate(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          bottom: r.bottom,
        };
      };
      return {
        viewport: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        face: rect(".face"),
        stage: rect(".face-stage"),
        column: rect(".seat-story"),
        headline: rect("h1"),
        trade: rect(".trade-panel"),
      };
    });
    check(
      layout.scrollWidth <= width,
      `No horizontal overflow at ${width}×${height}`,
    );
    if (width <= 640) {
      check(
        layout.face.width >= 280 &&
          layout.stage.width === layout.column.width &&
          layout.face.bottom < layout.headline.y,
        `Full column face ≥280px above headline at ${width}×${height}`,
      );
    }
    layouts.push({ width, height, ...layout });
    if (width === 375 && height === 667)
      await page.screenshot({
        path: "artifacts/mobile-375.png",
        fullPage: true,
      });
    if (width === 1440)
      await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });
  }
  await page.locator(".testament-link").focus();
  await page.screenshot({ path: "artifacts/keyboard-focus.png" });
  await page.keyboard.press("Enter");
  check(
    new URL(page.url()).hash === "#testament",
    "Hero link navigates to sealed section with keyboard",
  );
  await page.locator("#testament").screenshot({ path: "artifacts/sealed.png" });
  const colors = await page.evaluate(() => {
    const luminance = (color) => {
      const c = color
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((n) => {
          const v = n / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
      return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    };
    return [
      ".sealed-headline",
      ".testament-body > p:nth-child(2)",
      ".hash",
      ".integrity",
      ".holder-note",
    ].map((selector) => {
      const element = document.querySelector(selector),
        style = getComputedStyle(element);
      let ancestor = element,
        background;
      while (ancestor) {
        background = getComputedStyle(ancestor).backgroundColor;
        if (background !== "rgba(0, 0, 0, 0)" && background !== "transparent")
          break;
        ancestor = ancestor.parentElement;
      }
      const a = luminance(style.color),
        b = luminance(background);
      return {
        selector,
        foreground: style.color,
        background,
        contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        size: style.fontSize,
        weight: style.fontWeight,
      };
    });
  });
  check(
    colors.every((c) => c.contrast >= 4.5),
    "All changed text pairs exceed 4.5:1 on rendered backgrounds",
  );
  state = "funded";
  approval = ADDR.zero;
  await refresh();
  await page.getByText("FREED, NOT BURIED", { exact: true }).waitFor();
  await sealed("Funded but unburied");
  check(
    manifestoRequests.length === 0,
    "Funding without burial still skips MANIFESTO",
  );
  check(
    (await page.locator(".holder-note").textContent()).includes(
      "The holder must approve the hook to transfer the seat.",
    ),
    "Zero getApproved restores must approve sentence",
  );
  approval = ADDR.creator;
  await refresh();
  check(
    (await page.locator(".holder-note").textContent()).includes(
      "The holder must approve the hook to transfer the seat.",
    ),
    "Another approved address does not count as hook approval",
  );
  approval = ADDR.hook;
  await refresh();
  check(
    (await page.locator(".holder-note").textContent()).endsWith(
      "The holder has approved the hook to transfer the seat.",
    ),
    "Unburied seat with hook approval shows has approved sentence",
  );
  approval = ADDR.zero;
  state = "buried";
  await refresh();
  await page.locator(".manifesto").waitFor();
  check(
    (await page.locator(".manifesto").textContent()) === snapshot.manifesto,
    "Mocked burial renders the actual mainnet MANIFESTO byte for byte",
  );
  check(
    await page
      .getByText("✓ matches MANIFESTO_HASH on Ethereum", { exact: true })
      .isVisible(),
    "Opened text passes both hash checks",
  );
  check(
    (await page
      .getByRole("link", { name: "opened on chain", exact: false })
      .getAttribute("href")) ===
      `https://etherscan.io/address/${ADDR.hook}#events`,
    "Opened on chain links to hook events",
  );
  check(
    (await page.locator(".testament-link").textContent())
      .trim()
      .startsWith("read the testament"),
    "Burial restores read the testament link",
  );
  check(
    (await page.locator(".holder-note").textContent()).endsWith(
      "The seat is at 0x…dEaD. The 2.8 ETH was paid in the same transaction.",
    ),
    "Burial with cleared getApproved shows burial and same-transaction payment",
  );
  const openingRead = readRequests.find(
    (r) => r.state === "buried" && r.data === selector("MANIFESTO"),
  );
  check(
    readRequests
      .filter((r) => r.state === "buried")
      .every((r) => r.block === openingRead.block),
    "Burial, getApproved and opened text use the same snapshot block",
  );
  await page.locator("#testament").screenshot({ path: "artifacts/opened.png" });
  const holderLayouts = [];
  for (const width of [320, 375, 640, 641, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".holder-note").scrollIntoViewIfNeeded();
    const layout = await page.locator(".holder-note").evaluate((el) => ({
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      noteWidth: el.clientWidth,
      noteScrollWidth: el.scrollWidth,
      text: el.textContent,
    }));
    check(
      layout.documentWidth <= width && layout.noteScrollWidth <= layout.noteWidth,
      `Burial sentence wraps without clipping at ${width}px`,
    );
    holderLayouts.push(layout);
    if (width === 320 || width === 1440)
      await page.locator(".holder-note").screenshot({
        path: `artifacts/holder-buried-${width}.png`,
      });
  }
  approval = ADDR.hook;
  await refresh();
  check(
    (await page.locator(".holder-note").textContent()).endsWith(
      "The seat is at 0x…dEaD. The 2.8 ETH was paid in the same transaction.",
    ),
    "Burial takes precedence even when approval is still true",
  );
  state = "tampered";
  await refresh();
  check(
    await page
      .getByText(
        "Integrity mismatch: the returned testament does not match the expected hash.",
        { exact: true },
      )
      .isVisible(),
    "Opened tampered text still raises the existing integrity warning",
  );
  state = "funded";
  await refresh();
  await sealed("Return to unburied");
  // Simulated wallet and router error: no signature, send or onchain write.
  await page.evaluate((account) => {
    const provider = {
      request: async ({ method }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts")
          return [account];
        if (method === "eth_chainId") return "0x1";
        throw new Error("Unexpected wallet request: " + method);
      },
    };
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: {
          info: { uuid: "revision-test", name: "Revision wallet" },
          provider,
        },
      }),
    );
  }, ADDR.creator);
  await page.locator(".wallet-button").click();
  await page
    .getByRole("button", { name: "Revision wallet", exact: false })
    .click();
  await page.getByLabel("you pay").fill("0.001");
  rejectTrade = true;
  await page
    .getByRole("button", { name: "Buy FREE1376", exact: false })
    .click();
  await page
    .locator(".trade-panel")
    .getByText("price moved: raise slippage or try again", { exact: true })
    .waitFor({ timeout: 20000 });
  results.push(
    "Realistic nested V4TooLittleReceived(uint256,uint256) simulation error reaches the page as the slippage message",
  );
  await page.unrouteAll({ behavior: "wait" });
  return {
    results,
    layouts,
    holderLayouts,
    colors,
    manifestoRequests,
    renderedManifestoBytes: Buffer.byteLength(snapshot.manifesto),
  };
}
