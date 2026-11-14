// TASKS.csv #3052 (Matt's decisions 2026-11-14; design docs/ideas/composition-logs.md) — a log of components that sum to 100 per interval (the WA
// iron Met_<component>_pct log) is recognized at import; by default one layer coded by the dominant component (MIXED under a changeable 50 %), its
// share kept as Dominant share (%), every component a field; per-component numeric layers stay a choice, none pre-ticked. SYNTHETIC log.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compositionOf, componentPrefix, componentCode, perMineralOffer, perMineralChoice, mineralPlan, singleMineralRows, percentColumns, MIXED } from "../src/lib/perMineralColumns.js";

const C = ["Met_HEM_pct", "Met_GOE_pct", "Met_SHL_pct", "Met_CHT_pct", "Met_DOL_pct"];
const SHARES = [[70, 20, 10, 0, 0], [30, 30, 20, 20, 0], [0, 90, 10, 0, 0], [45, 40, 15, 0, 0], [0, 0, 0, 0, 0]];
const rows = Array.from({ length: 50 }, (_, i) => { const a = SHARES[i % 5], r = { HOLE: `H${i % 4}`, FROM: String(i), TO: String(i + 1), STRAND: "ALU" }; C.forEach((c, k) => (r[c] = a[k] ? String(a[k]) : "")); return r; });
rows[7].Met_CHT_pct = "30"; // a row summing to 130
const H = Object.keys(rows[0]), map = { hole_id: "HOLE", from: "FROM", to: "TO", value: "STRAND" };

test("recognized: shares that sum to 100; a sulphide log (a few per cent) is not a composition", () => {
  const cols = percentColumns(H, rows, map);
  const c = compositionOf(cols, rows, map);
  assert.equal(c.n, 4, "Met_DOL_pct is blank everywhere"); assert.equal(c.median, 100); assert.equal(c.off, 1); assert.deepEqual(c.offHoles, ["H3"]);
  const sulph = rows.map((r) => ({ ...r, Met_HEM_pct: "2", Met_GOE_pct: "1", Met_SHL_pct: "0.5", Met_CHT_pct: "" }));
  assert.equal(compositionOf(percentColumns(H, sulph, map), sulph, map), null);
  assert.equal(componentPrefix(C), "Met_");
  assert.equal(componentCode("Met_HEM_pct", "Met_"), "HEM");
});

test("offered on a Lithology import with a code column guessed; the one layer by default, per-component layers unticked", () => {
  const offer = perMineralOffer("litho", H, rows, map);
  assert.ok(offer?.composition && offer.composition.prefix === "Met_");
  assert.equal(perMineralOffer("litho", H, rows.map((r) => ({ HOLE: r.HOLE, FROM: r.FROM, TO: r.TO, STRAND: r.STRAND })), map), null, "a plain lithology log: no box");
  const def = perMineralChoice({ target: "litho" }, offer);
  assert.equal(def.mode, "single"); assert.equal(def.cols.length, 4); assert.equal(def.mixedBelow, 50);
  assert.deepEqual(perMineralChoice({ target: "litho", mineralMode: "layers" }, offer).cols, [], "none of 43 layers pre-ticked");
  assert.equal(perMineralChoice({ target: "litho", mixedBelow: "40" }, offer).mixedBelow, 40);
});

test("the one layer: the dominant component, MIXED under the threshold, its share a field, no total", () => {
  const plan = mineralPlan("litho", H, rows, map, {});
  const out = singleMineralRows(rows, map, plan, plan.colourBy);
  assert.deepEqual(out.rows.slice(0, 4).map((r) => [r.__min_code, r.__min_total]), [["HEM", "70"], [MIXED, "30"], ["GOE", "90"], [MIXED, "45"]]);
  assert.equal(out.none, 10, "the all-blank rows are not intervals of the layer");
  assert.equal(out.mapping.value, "__min_code"); assert.equal(out.mapping.extra, undefined, "a Lithology layer has no amount");
  assert.deepEqual(out.customFields[0], { column: "__min_total", name: "Dominant share (%)", type: "number" });
  const at40 = singleMineralRows(rows, map, mineralPlan("litho", H, rows, map, { mixedBelow: 40 }), "dominant");
  assert.equal(at40.rows[3].__min_code, "HEM", "45 % reaches a 40 % threshold");
  assert.equal(singleMineralRows(rows, map, mineralPlan("mnlgy", H, rows, { ...map, value: "" }, {}), "dominant").mapping.extra, "__min_total", "Mineralization keeps it as its amount");
});

test("the commit takes the composition on any of the three targets, and the layers mode keeps the code layer", () => {
  const p = fs.readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /if \(!plan \|\| plan\.mode !== "single" \|\| \(tg !== "mnlgy" && !plan\.composition\)\) return commitImportDataRaw\(data\);/);
  assert.match(p, /const compLayersMade = minPlan\?\.mode === "layers" && !!minPlan\.composition && !!mapping\.value && target !== "custom" && minPlan\.cols\.length > 0;/);
  assert.match(p, /\} else if \(minPlan\?\.mode === "layers" && !compLayersMade\) \{/);
  assert.match(p, /target === "litho" \/\* a composition: #3052 \*\//);
});
