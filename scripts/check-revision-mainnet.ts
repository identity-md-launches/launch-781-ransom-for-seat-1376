import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { BURIAL_START, burialSource, findBurial } from "../src/burial";
import { ETH_USD_FEED, feedAbi, freshDollars } from "../src/dollars";
import { rpc } from "../src/chain";
import { readKey } from "../src/key";
const [round, buried, key] = await Promise.all([
  rpc.readContract({
    address: ETH_USD_FEED,
    abi: feedAbi,
    functionName: "latestRoundData",
  }),
  burialSource.buried(BURIAL_START),
  readKey(),
]);
assert.ok(freshDollars({ answer: round[1], updatedAt: round[3] }));
assert.equal(typeof buried, "boolean");
assert.equal(key.given, false);
assert.match(key.image, /^data:image\/svg\+xml[;,]/);
const currentBuried = await burialSource.buried(await burialSource.latest());
const burial = currentBuried ? await findBurial() : undefined;
if (burial && burial.block > BURIAL_START) {
  assert.equal(await burialSource.buried(burial.block - 1n), false);
  assert.equal(await burialSource.buried(burial.block), true);
}
const report = {
  burial,
  checkedAt: new Date().toISOString(),
  feed: ETH_USD_FEED,
  round,
  dollars: freshDollars({ answer: round[1], updatedAt: round[3] }),
  pastBlock: BURIAL_START,
  pastRpc: "https://eth.drpc.org",
  buriedAtPastBlock: buried,
  keyBlock: key.block,
  totalSupply: 0,
  metadataSource: "contractURI()",
  imageCharacters: key.image.length,
};
await mkdir("artifacts", { recursive: true });
const json = JSON.stringify(
  report,
  (_, value) => (typeof value === "bigint" ? value.toString() : value),
  2,
);
await writeFile("artifacts/revision-mainnet.json", json + "\n");
console.log(json);
