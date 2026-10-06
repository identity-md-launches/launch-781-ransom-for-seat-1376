import { writeFile, mkdir } from "node:fs/promises";
import { parseEther, formatUnits, keccak256, stringToHex } from "viem";
import {
  rpc,
  readSnapshot,
  quote,
  buildTrade,
  minimumOut,
  ADDR,
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
if (!snapshot.manifestoVerified)
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
  manifestoBytes: new TextEncoder().encode(snapshot.manifesto).length,
  manifestoHash: keccak256(stringToHex(snapshot.manifesto)),
  manifestoHashOnchain: snapshot.manifestoHash,
  manifestoVerified: snapshot.manifestoVerified,
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
await mkdir("test/scratch", { recursive: true });
await writeFile(
  "test/scratch/snapshot.json",
  JSON.stringify(snapshot, (_, value) =>
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
