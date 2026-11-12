// TASKS.csv #2991 (WA iron review) — 'Grid a per-hole value' could not make the maps a bedded deposit is drawn with: the Value list held
// assay elements and numeric layers only, not the strand log, nor its numeric extra field. A coded log is now a source, with the code(s)
// chosen and their thickness, depth to top (the cover above them) or base, or RL of top or base per hole; the built-in logs' numeric extra
// fields are offered as values. SYNTHETIC strand log on vertical holes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeValueSources, perHoleCoded, holeSamplesAt, perHoleValuesOf, holeValueRows } from "../src/lib/holeValueGrid.js";

// four holes at RL 400: H1 cover 0-8, ONAM 8-20, footwall 20-30; H2 cover 0-12, ONAM 12-15, ONAM 18-22 (two parts), footwall to 30;
// H3 logged but no ONAM; H4 not logged at all
const litho = [
  { hole_id: "H1", from: 0, to: 8, value: "CVR", Met_CLA_pct: 10 }, { hole_id: "H1", from: 8, to: 20, value: "ONAM", Met_CLA_pct: 40 }, { hole_id: "H1", from: 20, to: 30, value: "FW", Met_CLA_pct: 5 },
  { hole_id: "H2", from: 0, to: 12, value: "CVR", Met_CLA_pct: 12 }, { hole_id: "H2", from: 12, to: 15, value: "ONAM", Met_CLA_pct: 44 }, { hole_id: "H2", from: 15, to: 18, value: "SHL", Met_CLA_pct: 2 },
  { hole_id: "H2", from: 18, to: 22, value: "ONAM", Met_CLA_pct: 41 }, { hole_id: "H2", from: 22, to: 30, value: "FW", Met_CLA_pct: 6 },
  { hole_id: "H3", from: 0, to: 25, value: "CVR", Met_CLA_pct: 9 },
];
const collars = ["H1", "H2", "H3", "H4"].map((h, i) => ({ hole_id: h, x: 500000 + 100 * i, y: 7400000, z: 400, dip: 90, azimuth: 0, length: 30 })); // the store's convention: dip positive down

test("the strand log and its numeric extra field are offered", () => {
  const s = holeValueSources({ layers: { litho }, labelOf: () => "Lithology" });
  const coded = s.find((x) => x.kind === "coded");
  assert.ok(coded, "the coded log is a source");
  assert.equal(coded.symbol, "Lithology");
  assert.deepEqual(coded.codes.map((c) => c.code), ["CVR", "FW", "ONAM", "SHL"].sort((a, b) => ({ CVR: 3, FW: 2, ONAM: 3, SHL: 1 })[b] - ({ CVR: 3, FW: 2, ONAM: 3, SHL: 1 })[a] || a.localeCompare(b)));
  const extra = s.find((x) => x.id === "logf:litho:Met_CLA_pct");
  assert.ok(extra && extra.kind === "log" && extra.unit === "as logged");
});

test("thickness: summed over the parts; a logged hole without the code is 0 m; an unlogged hole has no value", () => {
  const { values } = perHoleCoded(litho, ["ONAM"], "thick");
  assert.equal(values.get("H1"), 12);
  assert.equal(values.get("H2"), 7);
  assert.equal(values.get("H3"), 0);
  assert.equal(values.has("H4"), false);
  assert.equal(perHoleCoded(litho, ["ONAM", "SHL"], "thick").values.get("H2"), 10); // several codes together
});

test("depth to the top (the cover) and to the base; the RL of the top", () => {
  const top = perHoleCoded(litho, ["ONAM"], "top");
  assert.equal(top.values.get("H1"), 8);
  assert.equal(top.values.get("H2"), 12);
  assert.equal(top.values.has("H3"), false); // no top where there is no strand
  assert.equal(perHoleCoded(litho, ["ONAM"], "base").values.get("H2"), 22);
  const rl = holeSamplesAt(collars, top.values, top.spans, { at: "collar", rl: true });
  const byHole = Object.fromEntries(rl.samples.map((p) => [p.hole_id, p.values.value]));
  assert.ok(Math.abs(byHole.H1 - 392) < 1e-6 && Math.abs(byHole.H2 - 388) < 1e-6, JSON.stringify(byHole));
  const vd = holeSamplesAt(collars, top.values, top.spans, { at: "collar", verticalDepth: true });
  assert.ok(Math.abs(vd.samples.find((p) => p.hole_id === "H1").values.value - 8) < 1e-6);
});

test("wired: the panel offers the codes and the coded statistics", () => {
  const p = readFileSync(new URL("../src/components/HoleValueGridPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /perHoleCoded\(source\.rows, codesOn, codedBase\)/);
  assert.match(p, /<option value="topRL">\{tr\("The RL of their top"\)\}<\/option>/);
  assert.match(p, /aria-label=\{tr\("Codes of the layer"\)\}/);
});

test("the plan's figure gets a coded grid's values back from what the raster records (it crashed the Maps tab: no 'choice')", () => {
  const ctx = { layers: { litho }, collars };
  const coded = holeValueSources(ctx).find((x) => x.kind === "coded");
  assert.deepEqual(holeValueRows(coded, ctx), []);
  const thick = perHoleValuesOf({ sourceId: "c:litho", stat: "thick", codes: ["ONAM"] }, ctx);
  assert.equal(thick.get("H1"), 12); assert.equal(thick.get("H3"), 0);
  const rl = perHoleValuesOf({ sourceId: "c:litho", stat: "topRL", codes: ["ONAM"] }, ctx);
  assert.ok(Math.abs(rl.get("H2") - 388) < 1e-6);
  assert.equal(perHoleValuesOf({ sourceId: "nope", stat: "max" }, ctx).size, 0);
  const plan = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8");
  assert.match(plan, /const vals = perHoleValuesOf\(g, ctx\);/);
});
