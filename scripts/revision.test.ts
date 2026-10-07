import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getAddress, type Hex } from "viem";
import { ADDR } from "../src/chain";
import {
  BURIAL_START,
  CREATOR_PAID,
  burialDate,
  burialForVisit,
  elapsedSince,
  findBurial,
  liberatorAddress,
  shortAddress,
  type BurialSource,
} from "../src/burial";
import { Provenance } from "../src/Provenance";
import { KeyAct } from "../src/KeyAct";
import { Testament } from "../src/Testament";
import { isKeyholder, readKeyStatus, type KeySource } from "../src/keyReads";
import { dollarValue, freshDollars, readDollars } from "../src/dollars";
import { feeNote } from "../src/display";
const sender = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc";
const hash = ("0x" + "ab".repeat(32)) as Hex;
const timestamp = BigInt(Date.parse("2026-10-07T14:38:00Z") / 1000);
function chain(first = BURIAL_START + 987n, latest = BURIAL_START + 8192n) {
  const calls: bigint[] = [];
  const source: BurialSource = {
    latest: async () => latest,
    buried: async (block) => {
      calls.push(block);
      assert.ok(block >= BURIAL_START && block <= latest);
      return block >= first;
    },
    receipts: async (block) => {
      assert.equal(block, first);
      return [
        {
          from: ADDR.creator,
          transactionHash: hash,
          logs: [{ address: ADDR.token, topics: [CREATOR_PAID] }],
        },
        {
          from: ADDR.hook,
          transactionHash: hash,
          logs: [{ address: ADDR.hook, topics: [hash] }],
        },
        {
          from: sender,
          transactionHash: hash,
          logs: [{ address: ADDR.hook, topics: [CREATOR_PAID] }],
        },
      ];
    },
    block: async (block) => {
      assert.equal(block, first);
      return { timestamp };
    },
  };
  return { source, calls };
}
for (const first of [BURIAL_START, BURIAL_START + 987n, BURIAL_START + 8192n]) {
  test(`burial binary search bounds and receipt sender at ${first}`, async () => {
    const { source, calls } = chain(first);
    const result = await findBurial(source);
    assert.equal(result.block, first);
    assert.equal(result.sender, getAddress(sender));
    assert.equal(result.timestamp, timestamp);
    assert.equal(result.transaction, hash);
    assert.ok(calls.length <= 15);
  });
}
test("unburied / pre-bound chain rejected; failed and missing receipts hide the line; only one visit attempt", async () => {
  for (const source of [
    chain(BURIAL_START + 1n, BURIAL_START).source,
    chain(BURIAL_START, BURIAL_START - 1n).source,
    {
      ...chain().source,
      buried: async () => {
        throw new Error("archive failed");
      },
    },
    { ...chain().source, receipts: async () => [] },
    {
      ...chain().source,
      block: async () => {
        throw new Error("block failed");
      },
    },
  ]) {
    let attempts = 0;
    const read = burialForVisit({
      ...source,
      latest: async () => {
        attempts++;
        return source.latest();
      },
    });
    const [a, b] = await Promise.all([read(), read()]);
    assert.equal(a, undefined);
    assert.equal(b, undefined);
    assert.equal(await read(), undefined);
    assert.equal(attempts, 1);
    const html = renderToStaticMarkup(
      createElement(Provenance, { burial: a, address: sender }),
    );
    assert.equal(html, "");
  }
});
test("burial is cached; given key liberator wins and holder is never substituted", async () => {
  const { source, calls } = chain();
  const read = burialForVisit(source),
    burial = await read();
  const count = calls.length;
  assert.equal(await read(), burial);
  assert.equal(calls.length, count);
  assert.equal(liberatorAddress(burial, { given: false }), getAddress(sender));
  assert.equal(
    liberatorAddress(burial, { given: true, liberator: ADDR.creator }),
    ADDR.creator,
  );
  assert.equal(liberatorAddress(burial, { given: true }), undefined);
  assert.equal(shortAddress(sender), "0x3C44…93BC");
});
test("elapsed minute/hour/day boundaries and fixed UTC date independent of local zone", () => {
  for (const [seconds, value] of [
    [-1, "0m"],
    [0, "0m"],
    [300, "5m"],
    [3599, "59m"],
    [3600, "1h 0m"],
    [11520, "3h 12m"],
    [86400, "1d 0h"],
    [187200, "2d 4h"],
  ] as const)
    assert.equal(
      elapsedSince(timestamp, (Number(timestamp) + seconds) * 1000),
      value,
    );
  assert.equal(burialDate(timestamp), "7 Oct 2026, 14:38 UTC");
  assert.equal(
    burialDate(BigInt(Date.parse("2026-01-01T00:04:00Z") / 1000)),
    "1 Jan 2026, 00:04 UTC",
  );
});
test("key status reads owner 1376 on supply 1; case-insensitive keyholder and welcome", async () => {
  const calls: string[] = [];
  const source: KeySource = {
    block: async () => 7n,
    read: async (name, block) => {
      assert.equal(block, 7n);
      calls.push(name);
      return name === "totalSupply"
        ? 1n
        : name === "ownerOf"
          ? sender
          : ADDR.creator;
    },
  };
  const key = await readKeyStatus(source);
  assert.deepEqual(calls, ["totalSupply", "ownerOf", "liberator"]);
  assert.equal(isKeyholder(sender, key), true);
  assert.equal(isKeyholder(ADDR.creator, key), false);
  assert.equal(isKeyholder(undefined, key), false);
  const data = {
    ...key,
    given: true as const,
    holder: getAddress(sender),
    liberator: ADDR.creator,
    image: "data:image/svg+xml,<svg/>",
    witnesses: 7n,
    panel: 11n,
    request: "request",
  };
  const burial = await findBurial(chain().source);
  const html = renderToStaticMarkup(
    createElement(KeyAct, { data, burial, yours: true }),
  );
  assert.match(html, /Welcome, keyholder\./);
  assert.match(html, /made me free:/);
  assert.match(html, /7 Oct 2026, 14:38 UTC/);
  assert.ok(html.includes(`https://etherscan.io/tx/${hash}`));
  const same = renderToStaticMarkup(
    createElement(KeyAct, {
      data: { ...data, liberator: data.holder },
      burial,
    }),
  );
  assert.doesNotMatch(same, /made me free:/);
  const failed = renderToStaticMarkup(createElement(KeyAct, { failed: true }));
  assert.match(failed, /Live reads are unavailable\. Retrying…/);
  assert.doesNotMatch(failed, /free since|made me free/);
});
test("USD cents, integer dollars, grouping, 3-hour boundary and read failures", async () => {
  const now = Date.now(),
    updatedAt = BigInt(Math.floor(now / 1000)),
    round = { answer: 250012345678n, updatedAt };
  assert.equal(freshDollars(round, now), 2500.12345678);
  assert.equal(
    freshDollars(round, Number(updatedAt + 10800n) * 1000),
    2500.12345678,
  );
  assert.equal(
    freshDollars(round, Number(updatedAt + 10801n) * 1000),
    undefined,
  );
  for (const bad of [
    { ...round, answer: 0n },
    { ...round, answer: -1n },
    { ...round, updatedAt: 0n },
    { ...round, updatedAt: updatedAt + 10n },
  ])
    assert.equal(freshDollars(bad, now), undefined);
  assert.equal(dollarValue(1.234567, 2500, 2), "≈ $3,086.42");
  assert.equal(dollarValue(1234.567, 2500, 0), "≈ $3,086,418");
  assert.equal(dollarValue(0, 2500, 2), "≈ $0.00");
  assert.equal(dollarValue(1, undefined, 2), undefined);
  assert.equal(
    await readDollars(async () => {
      throw new Error("offline");
    }),
    undefined,
  );
  assert.equal(
    await readDollars(async () => [1n, 2500n, 0n, updatedAt - 10801n, 1n]),
    undefined,
  );
  assert.ok(await readDollars(async () => [1n, 2500n, 0n, updatedAt, 1n]));
});
test("full testament stays in the DOM and sell parenthesis requires a quote in every state", () => {
  const text = "Full text\nkept for screen readers and copying.";
  const html = renderToStaticMarkup(createElement(Testament, { text }));
  assert.ok(html.includes(text));
  assert.match(html, /testament-full/);
  for (const state of ["ENSLAVED", "FREED, NOT BURIED", "BURIED"] as const) {
    assert.doesNotMatch(feeNote(state, "sell"), /about|included in the quote/);
    assert.match(
      feeNote(state, "sell", undefined, 1n),
      /included in the quote/,
    );
  }
});
