import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEther, parseUnits, getAddress, type Hex } from "viem";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { actFromHash } from "../src/acts";
import {
  quoteAmount,
  fixedAmount,
  toGo,
  seatCopy,
  feeNote,
} from "../src/display";
import { KeyAct } from "../src/KeyAct";
import { readKey, uuidFromBytes32, type KeySource } from "../src/key";

test("quote lines: grouped fixed decimals; minimum rounds down at both precisions", () => {
  assert.equal(
    quoteAmount(parseEther("135564.15499"), 18, "FREE1376"),
    "135,564.15",
  );
  assert.equal(
    quoteAmount(parseEther("131497.2287"), 18, "FREE1376", true),
    "131,497.22",
  );
  assert.equal(
    quoteAmount(parseEther("131497.2287"), 18, "FREE1376"),
    "131,497.23",
  );
  assert.equal(
    quoteAmount(parseEther("1234.1234569"), 18, "ETH"),
    "1,234.123457",
  );
  assert.equal(
    quoteAmount(parseEther("1234.1234569"), 18, "ETH", true),
    "1,234.123456",
  );
  assert.equal(quoteAmount(1n, 18, "ETH", true), "0.000000");
  assert.equal(quoteAmount(0n, 18, "FREE1376"), "0.00");
  assert.equal(quoteAmount(parseEther("999.999"), 18, "FREE1376"), "1,000.00");
  assert.equal(
    quoteAmount(parseEther("9007199254740993.019"), 18, "FREE1376", true),
    "9,007,199,254,740,993.01",
  );
  assert.equal(quoteAmount(123n, 0, "FREE1376"), "123.00");
  for (const symbol of ["FREE1376", "ETH"] as const) {
    for (let value = 1n; value < 10n ** 40n; value = value * 17n + 123n) {
      const displayed = quoteAmount(value, 18, symbol, true).replaceAll(
        ",",
        "",
      );
      assert.ok(parseUnits(displayed, 18) <= value);
    }
  }
});
test("remaining ETH rounds up and complements the paid floor to exactly 2.8", () => {
  const cap = parseEther("2.8");
  for (const paid of [
    0n,
    1n,
    parseEther("2.675832595139417085"),
    cap - 1n,
    cap,
    cap + 1n,
  ]) {
    const clamped = paid > cap ? cap : paid;
    assert.equal(
      parseEther(fixedAmount(clamped, 18, 4)) + parseEther(toGo(paid)),
      cap,
    );
    assert.ok(parseEther(toGo(paid)) >= cap - clamped);
  }
  assert.equal(toGo(cap - 1n), "0.0001");
});
test("hash routing includes old section links, empty and unknown hashes", () => {
  for (const hash of [
    "",
    "#",
    "#first-act",
    "#trade",
    "#testament",
    "#unknown",
  ])
    assert.equal(actFromHash(hash), "first-act");
  assert.equal(actFromHash("#second-act"), "second-act");
  assert.equal(actFromHash("#third-act"), "third-act");
});
test("all three states have the specified headline, title, panel, fees and hero", () => {
  for (const state of ["ENSLAVED", "FREED, NOT BURIED", "BURIED"] as const) {
    const c = seatCopy(state),
      enslaved = state === "ENSLAVED",
      buried = state === "BURIED";
    assert.deepEqual(
      c.headline,
      buried ? ["I AM", "FREE."] : ["HELP ME", "ESCAPE."],
    );
    assert.equal(
      c.title,
      `${buried ? "I AM FREE." : "HELP ME ESCAPE."} — Seat #1376`,
    );
    assert.equal(c.panelTitle, enslaved ? "Pay my ransom" : "Feed the fire");
    assert.deepEqual(
      c.hero,
      enslaved
        ? [
            "A seat. A ransom. An irreversible exit.",
            "Every trade brings me closer.",
          ]
        : buried
          ? [
              "The ransom is paid. I am at 0x…dEaD.",
              "Every trade now burns $IMD.",
            ]
          : ["The ransom is paid.", "Anyone can free me now."],
    );
    assert.equal(
      feeNote(state, "buy", parseEther("0.00002")),
      `2% of your ETH (0.00002 ETH) ${enslaved ? "goes to the ransom" : "buys $IMD and burns it"}.`,
    );
    assert.equal(
      feeNote(state, "sell", undefined, parseEther("0.98")),
      `2% of the ETH you receive ${enslaved ? "goes to the ransom" : "buys $IMD and burns it"} (about 0.02 ETH, included in the quote).`,
    );
  }
});
test("oracle UUID takes the first 16 bytes, preserves zeros, uses lowercase", () => {
  assert.equal(
    uuidFromBytes32("0x00112233445566778899AABBCCDDEEFF" + "ab".repeat(16)),
    "00112233-4455-6677-8899-aabbccddeeff",
  );
  assert.throws(() => uuidFromBytes32("0x00"));
});
const image =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  ).toString("base64");
const uri =
  "data:application/json;base64," +
  Buffer.from(JSON.stringify({ image })).toString("base64");
const holder = "0xdf90937e07c60108b505fe3c542ab782e0a19ae5";
const other = "0x000000000000000000000000000000000000dead";
const hash = ("0x" + "ab".repeat(32)) as Hex;
function source(given: boolean, liberator = holder) {
  const calls: string[] = [];
  const values: Record<string, unknown> = {
    totalSupply: given ? 1n : 0n,
    contractURI: uri,
    tokenURI: uri,
    ownerOf: holder,
    liberator,
    witnesses: 7n,
    panel: 11n,
    oracleRequest: hash,
  };
  const reader: KeySource = {
    block: async () => 123n,
    read: async (name, block) => {
      calls.push(name);
      assert.equal(block, 123n);
      return values[name] as Awaited<ReturnType<KeySource["read"]>>;
    },

  };
  return { reader, calls };
}
test("not given: contract image and nobody row only, no token or provenance reads", async () => {
  const { reader, calls } = source(false),
    k = await readKey(reader),
    html = renderToStaticMarkup(createElement(KeyAct, { data: k }));
  assert.deepEqual(calls, ["totalSupply", "contractURI"]);
  assert.equal(k.image, image);
  assert.equal(k.given, false);
  assert.match(html, /holder:/);
  assert.match(html, /nobody yet/);
  assert.doesNotMatch(
    html,
    /<svg|<script|freed by|freed in|named by|OpenSea|Etherscan/,
  );
});
for (const [label, liberator] of [
  ["same holder", holder],
  ["transferred key", other],
] as const) {
  test(`given: ${label}`, async () => {
    const { reader, calls } = source(true, liberator),
      k = await readKey(reader);
    assert.ok(k.given);
    assert.equal(k.holder, getAddress(holder));
    assert.equal(k.liberator, getAddress(liberator));
    assert.ok(calls.includes("tokenURI"));
    assert.ok(!calls.includes("contractURI"));
    const html = renderToStaticMarkup(createElement(KeyAct, { data: k }));
    assert.equal(html.includes("made me free:"), liberator !== holder);
    assert.ok(!calls.some((name) => name.startsWith("window")));
    assert.ok(
      html.includes(`https://etherscan.io/address/${getAddress(holder)}`),
    );
    assert.match(html, /7 of 11 brothers/);
    assert.match(html, /oracle request/);
    assert.match(html, /Etherscan/);
    assert.match(html, /OpenSea/);
    assert.doesNotMatch(html, /<svg|<script|nobody yet/);
  });
}
