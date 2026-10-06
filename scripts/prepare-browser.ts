// Test-only calldata / responses. Written outside the production export.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  encodeAbiParameters,
  encodeFunctionData,
  encodeErrorResult,
  parseAbiParameters,
  maxUint160,
  maxUint256,
  parseEther,
} from "viem";
import { ADDR, hookAbi, tokenAbi, permitAbi, errorAbi } from "../src/chain.js";
const u = (n: bigint) =>
  encodeAbiParameters(parseAbiParameters("uint256"), [n]);
const s = (text: string) =>
  encodeAbiParameters(parseAbiParameters("string"), [text]);
const sel = (data: string) => data.slice(0, 10);
const selectors = {
  balance: sel(
    encodeFunctionData({
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [ADDR.creator],
    }),
  ),
  allowance: sel(
    encodeFunctionData({
      abi: tokenAbi,
      functionName: "allowance",
      args: [ADDR.creator, ADDR.permit2],
    }),
  ),
  approve: sel(
    encodeFunctionData({
      abi: tokenAbi,
      functionName: "approve",
      args: [ADDR.permit2, maxUint256],
    }),
  ),
  permitAllowance: sel(
    encodeFunctionData({
      abi: permitAbi,
      functionName: "allowance",
      args: [ADDR.creator, ADDR.token, ADDR.router],
    }),
  ),
  permitApprove: sel(
    encodeFunctionData({
      abi: permitAbi,
      functionName: "approve",
      args: [ADDR.token, ADDR.router, maxUint160, 2000000000],
    }),
  ),
  manumit: encodeFunctionData({ abi: hookAbi, functionName: "manumit" }),
  burnTrue: encodeFunctionData({
    abi: hookAbi,
    functionName: "burnIMD",
    args: [true, 0n],
  }),
  burnFalse: encodeFunctionData({
    abi: hookAbi,
    functionName: "burnIMD",
    args: [false, 0n],
  }),
};
const states: Record<string, Record<string, string>> = {};
for (const state of ["freed", "buried"]) {
  const functions = {
    totalFees: u(parseEther("2.81")),
    CREATOR_CAP: u(parseEther("2.8")),
    buried: u(state === "buried" ? 1n : 0n),
    totalIMDBurned: u(parseEther("500")),
    burnable: u(parseEther("0.01")),
    MIN_BURN: u(parseEther("0.002")),
    lastBurnBlock: u(1n),
    MIN_BLOCKS_BETWEEN_BURNS: u(5n),
    status: s(
      state === "buried"
        ? "BURIED. Simulated contract status."
        : "FREED, NOT BURIED. Simulated contract status.",
    ),
  };
  states[state] = Object.fromEntries(
    Object.entries(functions).map(([name, result]) => [
      encodeFunctionData({ abi: hookAbi, functionName: name as "totalFees" }),
      result,
    ]),
  );
}
const permit = (ready: boolean) =>
  encodeAbiParameters(parseAbiParameters("uint160, uint48, uint48"), [
    ready ? maxUint160 : 0n,
    ready ? 2100000000 : 0,
    0,
  ]);
const fixtures = {
  addr: ADDR,
  selectors,
  states,
  balance: u(parseEther("1000")),
  zero: u(0n),
  max: u(maxUint256),
  yes: u(1n),
  permitEmpty: permit(false),
  permitReady: permit(true),
  errors: Object.fromEntries(
    ["TooSoon", "Pool4Unavailable", "NothingToBurn", "PriceOffReference"].map(
      (name) => [
        name,
        encodeErrorResult({ abi: errorAbi, errorName: name as "TooSoon" }),
      ],
    ),
  ),
  snapshot: JSON.parse(
    await readFile("/tmp/free1376-fixtures/snapshot.json", "utf8"),
  ),
};
await mkdir("/tmp/free1376-fixtures", { recursive: true });
await writeFile(
  "/tmp/free1376-fixtures/fixtures.json",
  JSON.stringify(fixtures),
);
console.log("Browser test fixtures prepared outside dist/.");
