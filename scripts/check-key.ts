import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readKey, KEY_ADDRESS } from "../src/key";

const key = await readKey();
assert.equal(
  key.given,
  false,
  "Pre-publication check expects totalSupply() = 0",
);
assert.match(key.image, /^data:image\/svg\+xml[;,]/);
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/key-check.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      address: KEY_ADDRESS,
      totalSupply: "0",
      metadataSource: "contractURI()",
      ...key,
    },
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  ) + "\n",
);
console.log(
  `Key at block ${key.block}: supply 0; contractURI SVG image (${key.image.length} URI characters).`,
);
