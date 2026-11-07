// TASKS.csv #1718 — Model from map and the drillholes: the logged contacts feed the map model (lib/holeMapContacts.js); with no
// map, or holes with no lithology log, the pane still says the holes are not used and where they are
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loggedCodes, suggestCodeUnits, holeContacts, MAX_GAP_M } from "../src/lib/holeMapContacts.js";

test("logged codes are matched to map units by name (case and spaces ignored); the rest wait for the geologist", () => {
  const rows = [{ value: "LMST" }, { value: "LMST" }, { value: "sandstone" }, { value: "OB" }];
  assert.deepEqual(loggedCodes(rows), [{ code: "LMST", n: 2 }, { code: "OB", n: 1 }, { code: "sandstone", n: 1 }]);
  assert.deepEqual(suggestCodeUnits(["LMST", "sandstone", "OB", "Hazelton_Group"], ["Sandstone", "Limestone", "Hazelton Group"]), { LMST: "", sandstone: "Sandstone", OB: "", "Hazelton_Group": "Hazelton Group" });
});

test("a contact wherever a hole passes from one unit of the order to another; overburden and short gaps passed over", () => {
  const map = { OB: "", SS: "Sandstone", SST: "Sandstone", SH: "Shale", LS: "Limestone", DYK: "" };
  const rows = [
    { hole_id: "A", from: 0, to: 6, value: "OB" }, { hole_id: "A", from: 6, to: 40, value: "SS" }, { hole_id: "A", from: 40, to: 55, value: "SST" }, // one unit, two codes
    { hole_id: "A", from: 55, to: 90, value: "SH" }, { hole_id: "A", from: 90, to: 94, value: "DYK" }, { hole_id: "A", from: 94, to: 150, value: "LS" }, // a 4 m dyke between shale and limestone
    { hole_id: "B", from: 0, to: 30, value: "SH" }, { hole_id: "B", from: 60, to: 100, value: "LS" }, // 30 m not logged: unplaced
    { hole_id: "C", from: 10, to: 50, value: "LS" }, { hole_id: "C", from: 0, to: 10, value: "SH" }, // unsorted rows
  ];
  const r = holeContacts(rows, map);
  assert.deepEqual(r.contacts.map((c) => [c.hole_id, c.depth, c.upper, c.lower]), [["A", 55, "Sandstone", "Shale"], ["A", 92, "Shale", "Limestone"], ["C", 10, "Shale", "Limestone"]]);
  assert.equal(r.gaps, 1); assert.equal(r.holes, 2);
  assert.equal(r.contacts[0].row.value, "SH", "the lower interval: the intercept the Boundary intercepts table excludes");
  // a unit not in the order is passed over like a code with no unit
  // a unit not in the order is passed over like a code with no unit: hole A's sandstone (to 55 m) and limestone (from 94 m) are
  // 39 m apart, so that contact is not placed
  const noShale = holeContacts(rows, map, (u) => u !== "Shale");
  assert.deepEqual([noShale.contacts.length, noShale.gaps], [0, 1]);
  assert.equal(MAX_GAP_M, 10);
});

test("wired: the pane's code table and preview, the run's points on the hole traces, the summary; the old note kept for logless holes", () => {
  const p = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /holeCount = 0, lithoRows = null \}\)/);
  assert.match(p, /const holesNote = holeCount > 0 \?/);
  assert.match(p, /if \(!polys\.length\) return <>\{holesNote\}/);
  assert.match(p, /\{holeCount > 0 && !codes\.length && holesNote\}/);
  assert.match(p, /holeCodes: useHoles && holeCount > 0 \? codeUnit : null/);
  const m = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /<MapModelPanel [^\n]*holeCount=\{collars\.length\} lithoRows=\{layers\.litho\}/);
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const hc = holeContacts\(layers\.litho \|\| \[\], p\.holeCodes, \(u\) => rank\.has\(u\)\);/);
  assert.match(r, /if \(excludedIntercepts\.includes\(interceptId\("litho", c\.row\)\)\) \{ holeExcluded\+\+; continue; \}/);
  assert.match(r, /for \(const surface of tops\) pointsOf\.get\(surface\)\.push\(\{ \.\.\.sceneToApi\(q\), srcCode: `\$\{c\.upper\}\|\$\{c\.lower\}`, hole_id: c\.hole_id, depth: c\.depth \}\);/);
  // the tool the logless note names really adds map contacts to hole picks
  const e = readFileSync(new URL("../src/components/ExplicitSurfacePanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(e, /mapContactLines\(layer/);
});
