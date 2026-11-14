// TASKS.csv #3296 (from #2940) — the 3D legend and the inspector list a layer's codes in one order: the project's set order (#3130) first,
// then by count; #3295 — a layer filtered to some codes says so on its sidebar row.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { viewCodeOrder, entriesInCodeOrder } from "../src/lib/legendCodeOrder.js";

const g = { key: "litho", label: "Lithology", items: [["BIF", "#1"], ["DOL", "#2"], ["JER", "#3"], ["SHA", "#4"]], counts: [5, 40, 12, 3] };

test("#3296 the figure legend: by count with no set order, the set order first when there is one", () => {
  assert.deepEqual(viewCodeOrder([g], {})[0].items.map((i) => i[0]), ["DOL", "JER", "BIF", "SHA"]);
  const o = viewCodeOrder([g], { Lithology: ["SHA", "JER"] })[0];
  assert.deepEqual(o.items.map((i) => i[0]), ["SHA", "JER", "DOL", "BIF"]);
  assert.deepEqual(o.counts, [3, 12, 40, 5], "the counts follow their codes");
  const ramp = { key: "r", label: "Au", ramp: { colors: [] } };
  assert.equal(viewCodeOrder([ramp], {})[0], ramp);
});

test("#3296 the inspector: by count, the set order (by label) first", () => {
  const entries = [["D", 40], ["J", 12], ["B", 5], ["S", 3]], label = { D: "DOL", J: "JER", B: "BIF", S: "SHA" };
  assert.deepEqual(entriesInCodeOrder(entries, ["SHA", "JER"], (v) => label[v]).map((e) => e[0]), ["S", "J", "D", "B"]);
  assert.equal(entriesInCodeOrder(entries, null), entries);
});

test("#3296 / #3295 wiring", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(v, /\.\.\.viewCodeOrder\(categoryLegendGroups\(\{ keys: CATEGORY_LAYER_KEYS,[^\n]*projectCodeOrders\(layoutPages, null, null, null\)\)/);
  assert.match(v, /surfaceStructures, layoutPages \/\* #3296 \*\/\]\);/);
  assert.match(v, /codeOrder=\{projectCodeOrders\(layoutPages, null, null, null\)\[LAYER_META\[inspectLayer\]\?\.label\]\} codeLabel=\{\(v\) => effectiveLabel\(inspectLayer, v\)\}/);
  assert.match(readFileSync(new URL("../src/components/LayerInspector.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n"), /entriesInCodeOrder\(distinctValues\(rows\), codeOrder, codeLabel \|\| \(\(v\) => v\)\)/);
  // #3295 — the shown rows of a filtered layer, on its row
  assert.match(v, /const filteredShown = useMemo\(\(\) => \{[^\n]*if \(!hid\.has\(String\(r\.value\)\)\) n\+\+;/);
  assert.match(v, /count=\{\(layers\[key\] \|\| \[\]\)\.length\} shown=\{shown\}/);
  const p = readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /shown != null && shown < count \? <span title=\{tr\("\{hidden\} of \{count\} intervals hidden by the code filter \(Filter \/ legend\)"/);
});
