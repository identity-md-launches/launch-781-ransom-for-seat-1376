import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import type { Snapshot } from "../src/chain.js";

// Exercise the production JSX expression without extracting a new component or
// changing App's public API for this one-sentence revision. Browser coverage in
// browser-revision.mjs also verifies the rendered paragraph and RPC snapshot.
const source = ts.createSourceFile(
  "App.tsx",
  readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let sentence: ts.Expression | undefined;
function visit(node: ts.Node) {
  if (
    ts.isJsxElement(node) &&
    node.openingElement.attributes.properties.some(
      (attribute) =>
        ts.isJsxAttribute(attribute) &&
        attribute.name.getText(source) === "className" &&
        attribute.initializer?.getText(source) === '"holder-note"',
    )
  ) {
    const expressions = node.children.filter(ts.isJsxExpression);
    sentence = expressions.at(-1)?.expression;
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(sentence, "The holder note must contain its state-driven sentence");
const renderSentence = new Function(
  "data",
  `return (${sentence.getText(source)});`,
) as (data?: Pick<Snapshot, "buried" | "seatApproved">) => string;

test("buried: cleared approval shows the burial and same-transaction payment", () => {
  for (const seatApproved of [false, true]) {
    assert.equal(
      renderSentence({ buried: true, seatApproved }),
      "The seat is at 0x000000000000000000000000000000000000dEaD. The 2.8 ETH was paid in the same transaction.",
    );
  }
});

test("approved: an unburied seat retains the approval sentence", () => {
  assert.equal(
    renderSentence({ buried: false, seatApproved: true }),
    "The holder has approved the hook to transfer the seat.",
  );
});

test("neither: an unburied seat without hook approval retains must-approve", () => {
  assert.equal(
    renderSentence({ buried: false, seatApproved: false }),
    "The holder must approve the hook to transfer the seat.",
  );
  assert.equal(
    renderSentence(),
    "The holder must approve the hook to transfer the seat.",
  );
});
