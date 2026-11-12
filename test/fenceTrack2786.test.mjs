// TASKS.csv #2786 (split from #1745) — the Fence diagram had no numeric track: an assay element or a numeric log (gamma, RQD %) could not
// be read beside the columns. lib/fenceTrack.js offers the sources and the rows of the panel's holes on one scale.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { numericTrackSources, numericTrackRows, trackFraction } from "../src/lib/fenceTrack.js";

const assays = [
  { hole_id: "A", from: 0, to: 2, values: { Cu: 0.1, Au: "" } },
  { hole_id: "A", from: 2, to: 4, values: { Cu: 0.5 } },
  { hole_id: "B", from: 4, to: 6, values: { Cu: 1.2 } },
  { hole_id: "C", from: 0, to: 2, values: { Cu: 9 } }, // not on the panel
];

test("sources: each assay element, built-in numeric logs with rows, numeric custom layers only", () => {
  const s = numericTrackSources({
    assays, assayElements: [{ symbol: "Cu", unit: "%" }, { symbol: "Au", unit: "ppm" }],
    layers: { geotech: [{ hole_id: "A", from: 0, to: 3, value: 80 }], recovery: [] },
    customLayers: [{ id: "g", name: "Gamma", rows: [{ hole_id: "A", depth: 1, value: "120" }] }, { id: "u", name: "Unit", rows: [{ hole_id: "A", from: 0, to: 2, value: "SAND" }] }],
  });
  assert.deepEqual(s.map((x) => x.key), ["assay:Cu", "assay:Au", "geotech", "custom:g"]);
  assert.equal(s[0].label, "Cu (%)");
  assert.deepEqual(numericTrackSources({ assays: [], assayElements: [{ symbol: "Cu" }] }), [], "no assays: no element offered");
});

test("rows of the panel's holes only, intervals and points, one 0-based scale", () => {
  const r = numericTrackRows({ kind: "assay", symbol: "Cu" }, ["A", "B"], assays);
  assert.deepEqual(Object.keys(r.byHole).sort(), ["A", "B"]);
  assert.equal(r.n, 3, "the blank Au is no value; hole C is not on the panel");
  assert.equal(r.lo, 0);
  assert.ok(r.hi >= 0.5 && r.hi <= 1.2);
  const g = numericTrackRows({ kind: "layer", rows: [{ hole_id: "A", depth: 5, value: 3 }, { hole_id: "A", depth: 1, value: 2 }] }, ["A"]);
  assert.ok(g.points);
  assert.deepEqual(g.byHole.A.map((x) => x.at), [1, 5], "sorted by depth");
});

test("one spike does not flatten the rest: the top of the scale is the 98th percentile", () => {
  const rows = []; for (let i = 0; i < 200; i++) rows.push({ hole_id: "A", from: i, to: i + 1, value: 1 + (i % 10) / 10 });
  rows.push({ hole_id: "A", from: 200, to: 201, value: 500 });
  const r = numericTrackRows({ kind: "layer", rows }, ["A"]);
  assert.ok(r.hi < 2.5, String(r.hi));
  assert.equal(r.above, 1 + rows.filter((x) => x.value > r.hi && x.value < 500).length);
  assert.equal(trackFraction(500, r.lo, r.hi), 1);
  assert.equal(trackFraction(-1, 0, 2), 0);
  const flat = numericTrackRows({ kind: "layer", rows: [{ hole_id: "A", from: 0, to: 1, value: 0 }] }, ["A"]);
  assert.ok(flat.hi > flat.lo, "an all-zero track still has a scale");
});

test("the Fence diagram offers the track and draws it beside each column", () => {
  const m = readFileSync(new URL("../src/components/FenceDiagramModal.jsx", import.meta.url), "utf8");
  assert.match(m, /numericTrackSources\(\{ layers: storeLayers, customLayers, assays, assayElements \}, tr\)/);
  assert.match(m, /aria-label=\{tr\("Numeric track"\)\}/);
  assert.match(m, /numericTrackRows\(trackSrc, panel\.holes\.map\(\(h\) => h\.hole_id\), assays\)/);
  assert.match(m, /tr\("Track: \{name\}, the full width is \{hi\} \(the 98th percentile of the panel's values\)"/);
});
