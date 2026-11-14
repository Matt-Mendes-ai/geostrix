// TASKS.csv #3199 (split from #3130) — a recorded legend code order only changed when the rows were moved again: it can be cleared
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clearCodeOrders, pagesHoldingOrder, orderedGroupsOf, projectCodeOrders } from "../src/lib/legendCodeOrder.js";

const A = { id: "a", type: "legend", loadedGroups: ["Strand"], codeOrder: { Strand: ["CID", "ALU"], Litho: ["BIF"] } };
const B = { id: "b", type: "legend", loadedGroups: ["Strand"] };
const T = { id: "t", type: "text", codeOrder: { Strand: ["x"] } };

test("clearing forgets the groups on every legend of the page and leaves the rest", () => {
  const out = clearCodeOrders([A, B, T], ["Strand"]);
  assert.deepEqual(out[0].codeOrder, { Litho: ["BIF"] });
  assert.equal(out[1], B, "no order: untouched");
  assert.equal(out[2], T, "not a legend");
  const all = clearCodeOrders([A], ["Strand", "Litho"]);
  assert.equal("codeOrder" in all[0], false, "an empty record loses the field");
  assert.equal(clearCodeOrders([A], [])[0], A);
});

test("the groups a legend takes an order for, and the other pages that still hold one", () => {
  const pages = [{ id: "p1", name: "Page 1", elements: [] }, { id: "p2", name: "Page 2", elements: [{ ...A, id: "a2" }] }, { id: "p3", name: "Page 3", elements: [B] }];
  assert.deepEqual(orderedGroupsOf(A, {}), ["Strand", "Litho"]);
  assert.deepEqual(orderedGroupsOf(B, projectCodeOrders(pages, "p1", [B], "b")), ["Strand"], "lent by the legend on page 2");
  assert.deepEqual(orderedGroupsOf(B, {}), []);
  assert.deepEqual(pagesHoldingOrder(pages, "p1", ["Strand"]), ["Page 2"]);
  assert.deepEqual(pagesHoldingOrder(pages, "p2", ["Strand"]), []);
});

test("wiring: the inspector offers 'Clear the set order' and names the pages that would bring it back", () => {
  const s = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(s, /const groups = orderedGroupsOf\(sel, projectCodeOrders\(layoutPages, activeLayoutPageId, elements, sel\.id\)\);/);
  assert.match(s, /setElements\(\(els\) => clearCodeOrders\(els, groups\)\);/);
  assert.match(s, /tr\("Clear the set order"\)/);
});
