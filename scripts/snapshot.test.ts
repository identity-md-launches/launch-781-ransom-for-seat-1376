import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADDR,
  EXPECTED_MANIFESTO_HASH,
  readSnapshot,
  rpc,
} from "../src/chain.js";

for (const state of ["enslaved", "funded", "buried"] as const) {
  test(`${state}: testament and seat approval follow one snapshot block`, async (t) => {
    const block = 26131142n;
    const calls: string[] = [];
    const text = "Test-only returned text.\n\nWhitespace stays exact.  ";
    const uri = `data:application/json;base64,${btoa(
      JSON.stringify({
        image: "data:image/svg+xml;base64,PHN2Zy8+",
        attributes: [],
      }),
    )}`;
    t.mock.method(rpc, "getBlock", async () => ({
      number: block,
      timestamp: 1800000000n,
    }));
    t.mock.method(
      rpc,
      "readContract",
      async (request: {
        functionName: string;
        address: string;
        blockNumber: bigint;
        args?: bigint[];
      }) => {
        assert.equal(request.blockNumber, block);
        calls.push(request.functionName);
        if (request.functionName === "getApproved") {
          assert.equal(request.address, ADDR.seat);
          assert.deepEqual(request.args, [1376n]);
          // Uppercase address must compare equal to the lowercase hook.
          return state === "funded" ? ADDR.zero : ADDR.hook.toUpperCase();
        }
        const values: Record<string, unknown> = {
          totalFees: state === "enslaved" ? 1n : 3n,
          CREATOR_CAP: 2n,
          buried: state === "buried",
          totalIMDBurned: 0n,
          burnable: 0n,
          MIN_BURN: 1n,
          lastBurnBlock: 0n,
          MIN_BLOCKS_BETWEEN_BURNS: 5n,
          status: state,
          MANIFESTO: text,
          MANIFESTO_HASH: EXPECTED_MANIFESTO_HASH,
          IMD: ADDR.token,
          tokenURI: uri,
          getSlot0: [2n ** 96n, 0, 0, 3000],
          decimals: 18,
          totalSupply: 1000n,
        };
        assert.ok(request.functionName in values);
        return values[request.functionName];
      },
    );
    const snapshot = await readSnapshot();
    assert.equal(snapshot.block, block);
    assert.equal(snapshot.seatApproved, state !== "funded");
    assert.equal(calls.includes("MANIFESTO"), state === "buried");
    assert.equal(snapshot.manifesto, state === "buried" ? text : undefined);
    assert.equal(snapshot.manifestoVerified, false); // Synthetic text is not the commitment.
    if (state === "funded") assert.equal(snapshot.state, "FREED, NOT BURIED");
  });
}
