import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeFunctionData,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeErrorResult,
  formatUnits,
  maxUint128,
  parseAbiParameters,
  parseAbi,
  parseEther,
} from "viem";
import {
  ADDR,
  POOL_KEY,
  routerAbi,
  buildTrade,
  minimumOut,
  parseAmount,
  approvalSteps,
  errorAbi,
  errorName,
  explainError,
  parseMetadata,
  deriveState,
  verifyManifesto,
  type Holdings,
  type Snapshot,
} from "../src/chain.js";
import { walletLinks } from "../src/wallet.js";
const tuple =
  "((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData)";
for (const side of ["buy", "sell"] as const) {
  test(`${side}: exact Universal Router and v4 single-tuple recipe`, () => {
    const amount = parseEther("0.001"),
      min = 123456n,
      now = 1800000000n;
    const tx = buildTrade(side, amount, min, now);
    assert.equal(tx.to, ADDR.router);
    assert.equal(tx.value, side === "buy" ? amount : 0n);
    const decoded = decodeFunctionData({ abi: routerAbi, data: tx.data });
    assert.equal(decoded.functionName, "execute");
    const [command, inputs, deadline] = decoded.args;
    assert.equal(command, "0x10");
    assert.equal(inputs.length, 1);
    assert.equal(deadline, now + 600n);
    const [actions, params] = decodeAbiParameters(
      parseAbiParameters("bytes, bytes[]"),
      inputs[0],
    );
    assert.equal(actions, "0x060c0f");
    assert.equal(params.length, 3);
    const [swap] = decodeAbiParameters(parseAbiParameters(tuple), params[0]);
    assert.equal(swap.zeroForOne, side === "buy");
    assert.equal(swap.amountIn, amount);
    assert.equal(swap.amountOutMinimum, min);
    assert.equal(swap.hookData, "0x");
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(swap.poolKey).map(([k, v]) => [
          k,
          typeof v === "string" ? v.toLowerCase() : v,
        ]),
      ),
      Object.fromEntries(
        Object.entries(POOL_KEY).map(([k, v]) => [
          k,
          typeof v === "string" ? v.toLowerCase() : v,
        ]),
      ),
    );
    assert.equal(
      params[0],
      encodeAbiParameters(parseAbiParameters(tuple), [
        {
          poolKey: POOL_KEY,
          zeroForOne: side === "buy",
          amountIn: amount,
          amountOutMinimum: min,
          hookData: "0x",
        },
      ]),
    );
    const settle = decodeAbiParameters(
      parseAbiParameters("address, uint256"),
      params[1],
    );
    const take = decodeAbiParameters(
      parseAbiParameters("address, uint256"),
      params[2],
    );
    assert.equal(
      settle[0].toLowerCase(),
      side === "buy" ? ADDR.zero : ADDR.token,
    );
    assert.equal(settle[1], amount);
    assert.equal(
      take[0].toLowerCase(),
      side === "buy" ? ADDR.token : ADDR.zero,
    );
    assert.equal(take[1], min);
  });
}
test("amounts are exact, bounded, positive integers in base units", () => {
  assert.equal(parseAmount("0.001", 18), 1000000000000000n);
  assert.equal(parseAmount(".25", 18), parseEther("0.25"));
  for (const value of [
    "0",
    "-1",
    "1e5",
    "Infinity",
    "0.0000000000000000001",
    "1,000",
    "",
    formatUnits(maxUint128 + 1n, 18),
  ])
    assert.throws(() => parseAmount(value, 18));
  assert.equal(minimumOut(10001n, 3), 9700n);
  assert.throws(() => minimumOut(1n, 10));
  assert.throws(() => minimumOut(100n, 99));
});
test("sell approvals skip sufficient allowances but renew expiring permits", () => {
  const h: Holdings = {
    eth: 1n,
    token: 1000n,
    allowance: 1000n,
    permit: [1000n, 1800001000, 0],
    timestamp: 1800000000n,
  };
  assert.deepEqual(approvalSteps(h, 100n), { token: true, router: true });
  assert.deepEqual(approvalSteps({ ...h, allowance: 99n }, 100n), {
    token: false,
    router: true,
  });
  assert.deepEqual(
    approvalSteps({ ...h, permit: [99n, 1800001000, 0] }, 100n),
    { token: true, router: false },
  );
  assert.equal(
    approvalSteps({ ...h, permit: [1000n, 1800000599, 0] }, 100n).router,
    false,
  );
});
test("nested router and hook errors remain actionable", () => {
  const reason = encodeErrorResult({
    abi: parseAbi([
      "error V4TooLittleReceived(uint256 minAmountOutReceived, uint256 amountReceived)",
    ]),
    errorName: "V4TooLittleReceived",
    args: [100n, 90n],
  });
  assert.equal(
    explainError({ data: reason }),
    "price moved: raise slippage or try again",
  );
  const data = encodeErrorResult({
    abi: errorAbi,
    errorName: "ExecutionFailed",
    args: [0n, reason],
  });
  assert.equal(errorName({ cause: { data } }), "V4TooLittleReceived");
  assert.equal(
    explainError({ data }),
    "price moved: raise slippage or try again",
  );
  const hook = encodeErrorResult({
    abi: errorAbi,
    errorName: "Pool4Unavailable",
  });
  const wrap = encodeErrorResult({
    abi: errorAbi,
    errorName: "WrappedError",
    args: [ADDR.hook, "0x00000000", hook, "0x"],
  });
  assert.equal(errorName({ data: wrap }), "Pool4Unavailable");
  assert.equal(
    explainError({ errorName: "TooSoon" }, {
      lastBurnBlock: 100n,
      burnBlocks: 5n,
      block: 102n,
    } as Snapshot),
    "TooSoon: wait 3 blocks.",
  );
  assert.match(explainError({ code: 4001 }), /declined/);
});
test("chain state precedence and metadata / manifesto integrity", () => {
  assert.equal(deriveState(1n, 2n, false), "ENSLAVED");
  assert.equal(deriveState(2n, 2n, false), "FREED, NOT BURIED");
  assert.equal(deriveState(3n, 2n, true), "BURIED");
  const image = "data:image/svg+xml;base64,PHN2Zy8+";
  const uri = `data:application/json;base64,${btoa(JSON.stringify({ image, attributes: [{ trait_type: "Archetype", value: "NOISE ORACLE" }] }))}`;
  assert.equal(parseMetadata(uri).image, image);
  assert.throws(() => parseMetadata("https://example.com/metadata"));
  assert.throws(() =>
    parseMetadata(
      `data:application/json;base64,${btoa(JSON.stringify({ image: "https://example.com/face.svg" }))}`,
    ),
  );
  assert.equal(verifyManifesto("tampered", "0x00"), false);
});
test("all mobile deep links carry the actual hosted page and subpath", () => {
  const links = walletLinks("https://example.com/seat1376/?a=b#trade");
  assert.equal(links.length, 3);
  assert.match(links[0].href, /dapp\/example.com\/seat1376\//);
  assert.match(links[1].href, /cb_url=https%3A%2F%2Fexample.com%2Fseat1376/);
  assert.match(links[2].href, /coin_id=60&url=https%3A/);
});
