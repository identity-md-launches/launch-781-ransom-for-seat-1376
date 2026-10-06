import { writeFile, mkdir } from "node:fs/promises";
import { parseEther, formatUnits, keccak256, stringToHex } from "viem";
import {
  rpc,
  readSnapshot,
  quote,
  buildTrade,
  minimumOut,
  ADDR,
  hookAbi,
  verifyManifesto,
} from "../src/chain.js";
const snapshot = await readSnapshot();
const amount = parseEther("0.001");
const result = await quote("buy", amount, snapshot.block);
// A funded, public address for eth_call only. No signature or transaction is sent.
const account = ADDR.creator;
const balance = await rpc.getBalance({
  address: account,
  blockNumber: snapshot.block,
});
if (balance < amount)
  throw new Error("Simulation address does not hold enough ETH.");
const tx = buildTrade(
  "buy",
  amount,
  minimumOut(result.out, 3),
  snapshot.timestamp,
);
const simulation = await rpc.call({
  ...tx,
  account,
  blockNumber: snapshot.block,
});
// Verification only: the production snapshot never reads this while sealed.
const manifesto = await rpc.readContract({
  address: ADDR.hook,
  abi: hookAbi,
  functionName: "MANIFESTO",
  blockNumber: snapshot.block,
});
const manifestoVerified = verifyManifesto(manifesto, snapshot.manifestoHash);
if (!manifestoVerified)
  throw new Error("MANIFESTO integrity check failed.");
const record = {
  checkedAt: new Date().toISOString(),
  chainId: await rpc.getChainId(),
  block: snapshot.block.toString(),
  account,
  balanceWei: balance.toString(),
  amountInWei: amount.toString(),
  quoteOut: result.out.toString(),
  quoteFREE1376: formatUnits(result.out, snapshot.decimals),
  minimumOut: minimumOut(result.out, 3).toString(),
  calldata: tx.data,
  value: tx.value.toString(),
  simulationResult: simulation.data ?? "0x",
  manifestoBytes: new TextEncoder().encode(manifesto).length,
  manifestoHash: keccak256(stringToHex(manifesto)),
  manifestoHashOnchain: snapshot.manifestoHash,
  manifestoVerified,
  buried: snapshot.buried,
  seatApproved: snapshot.seatApproved,
  snapshotManifestoOmitted: snapshot.manifesto === undefined,
  attributes: snapshot.metadata.attributes,
  state: snapshot.state,
  feesWei: snapshot.fees.toString(),
  creatorCapWei: snapshot.cap.toString(),
  supply: snapshot.supply.toString(),
  decimals: snapshot.decimals,
  tokensPerEth: snapshot.tokensPerEth,
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/mainnet-check.json",
  JSON.stringify(record, null, 2) + "\n",
);
await mkdir("/tmp/free1376-fixtures", { recursive: true });
await writeFile(
  "/tmp/free1376-fixtures/snapshot.json",
  JSON.stringify({ ...snapshot, manifesto }, (_, value) =>
    typeof value === "bigint" ? value.toString() : value,
  ),
);
console.log(
  JSON.stringify(
    { ...record, calldata: "[recorded in artifacts/mainnet-check.json]" },
    null,
    2,
  ),
);
