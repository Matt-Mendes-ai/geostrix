// TASKS.csv #3130 (split from #3021) — a code order the user sets once (a strand log's stratigraphy) is kept for every legend of that layer
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupOrdersFromItems, applyCodeOrder, projectCodeOrders } from "../src/lib/legendCodeOrder.js";
import { legendGroupsToItems, capLegendGroups } from "../src/lib/legendGroups.js";

const strat = { key: "litho", label: "Lithology", items: [["BIF", "#a"], ["DOL", "#b"], ["JER", "#c"], ["SHA", "#d"]], counts: [40, 10, 5, 30] };
const alt = { key: "alt", label: "Alteration", items: [["CHL", "#e"], ["SER", "#f"]] };

test("the order is read from the rows, group by group; notes and ramps are not codes", () => {
  const items = [["Lithology", null, { heading: true }], ["SHA", "#d"], ["BIF", "#a"], ["+ 2 more codes, not listed", null, { note: true }], ["Alteration", null, { heading: true }], ["SER", "#f"], ["CHL", "#e"]];
  assert.deepEqual(groupOrdersFromItems(items), { Lithology: ["SHA", "BIF"], Alteration: ["SER", "CHL"] });
  assert.deepEqual(groupOrdersFromItems([["SHA", "#d"], ["BIF", "#a"]], "Lithology"), { Lithology: ["SHA", "BIF"] }, "one group: no heading");
  assert.deepEqual(groupOrdersFromItems([["SHA", "#d"]]), {}, "no group known: nothing recorded");
});

test("applied: the named codes first, in that order, then the rest as they were; counts follow; the cap keeps the order", () => {
  const [g] = applyCodeOrder([strat, alt], { Lithology: ["SHA", "JER", "BIF"] });
  assert.deepEqual(g.items.map((r) => r[0]), ["SHA", "JER", "BIF", "DOL"]);
  assert.deepEqual(g.counts, [30, 5, 40, 10]);
  const capped = capLegendGroups([g], 3, (n) => `+ ${n} more`);
  assert.deepEqual(capped[0].items.slice(0, -1).map((r) => r[0]), ["SHA", "BIF", "DOL"], "the three commonest, in the set order");
  assert.equal(applyCodeOrder([strat], {})[0], strat);
  assert.equal(applyCodeOrder([alt], { Lithology: ["SHA"] })[0], alt);
  assert.deepEqual(legendGroupsToItems(applyCodeOrder([strat], { Lithology: ["JER"] })).map((r) => r[0]), ["JER", "BIF", "DOL", "SHA"]);
});

test("every legend of the project lends its order; the legend being loaded wins", () => {
  const pages = [
    { id: "p1", elements: [{ id: "L1", type: "legend", codeOrder: { Lithology: ["SHA", "BIF"] } }] },
    { id: "p2", elements: [{ id: "L2", type: "legend", codeOrder: { Lithology: ["BIF", "SHA"], Alteration: ["SER"] } }] },
  ];
  assert.deepEqual(projectCodeOrders(pages, "p3", [], "L1"), { Lithology: ["SHA", "BIF"], Alteration: ["SER"] });
  assert.deepEqual(projectCodeOrders(pages, "p3", [], "L2"), { Lithology: ["BIF", "SHA"], Alteration: ["SER"] });
  // the open page's live elements stand for its stored ones
  assert.deepEqual(projectCodeOrders(pages, "p1", [{ id: "L1", type: "legend", codeOrder: { Lithology: ["DOL"] } }], "L1"), { Lithology: ["DOL"], Alteration: ["SER"] });
  assert.deepEqual(projectCodeOrders([], null, [], null), {});
});

test("wiring: the arrows record it on a loaded legend; Load from view applies the project's orders", () => {
  const L = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.equal((L.match(/updateSelected\(\{ items, \.\.\.keptOrder\(sel, items\) \}\)/g) || []).length, 2);
  assert.match(L, /const keptOrder = \(legend, items\) => \(legend\?\.loadedGroups\?\.length \?/);
  assert.match(L, /capLegendGroups\(applyCodeOrder\(mergeCaseTwins\(groups\), orders\)/);
  assert.match(L, /orders: projectCodeOrders\(layoutPages, activeLayoutPageId, elements, legendId\)/);
  assert.match(L, /loadedGroups: groups\.map\(\(g\) => g\.label\)/);
});
