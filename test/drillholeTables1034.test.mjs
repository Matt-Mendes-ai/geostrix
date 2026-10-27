// TASKS.csv #1034 (review #1016) — the drillhole tables export reads back through the CSV importer's own guesses as the same data.
import test from "node:test";
import assert from "node:assert/strict";
import { drillholeTableFiles } from "../src/lib/drillholeTables.js";
import { parseTableText } from "../src/lib/tabular.js";
import { guessTargetFor, guessMapping, schemaSatisfied, num } from "../src/lib/layers.js";
import { normInterval, normNumericInterval, normStructure } from "../src/lib/viewer/importHelpers.js";

// as stored in the app: dips positive-down, grid azimuths, custom fields as plain keys, internal "_" fields
const collars = [{ hole_id: "DH-01", x: 500100.5, y: 6000200.25, z: 1210, azimuth: 45, dip: 60, length: 250, year: 2024, target: "North zone", _src: "c.csv" },
  { hole_id: "#2", x: 500300, y: 6000050, z: 1190, azimuth: NaN, dip: 90, length: 120, year: 2025, target: "=cmd", _src: "c.csv" }];
const survey = [{ hole_id: "DH-01", depth: 0, azimuth: 45, dip: 60, _src: "s.csv" }, { hole_id: "DH-01", depth: 150, azimuth: 47.5, dip: 58 }];
const layers = {
  litho: [{ hole_id: "DH-01", from: 0, to: 12.5, value: "AND", description: "Pale green, fine grained", logged_by: "MS", _src: "l.csv" }],
  geotech: [{ hole_id: "DH-01", from: 0, to: 3, value: 85 }],
  mnlgy: [{ hole_id: "DH-01", from: 4, to: 5, value: "PY", extra: 2 }],
  structure: [{ hole_id: "DH-01", depth: 42.5, value: "VN", dip: 65, azimuth: 120, alpha: 40, beta: 210, structure_id: "V1", overturned: true, _abGrid: true }],
  geophys_pts: [{ x: 1, y: 2, z: 3, value: 4 }],
};

const files = drillholeTableFiles({ collars, survey, layers, epsg: 32610, version: "0.1.74" });
const byName = Object.fromEntries(files.map((f) => [f.name, f.text]));
const read = (name) => { const t = parseTableText(byName[name]); const target = guessTargetFor(t.headers, name); return { ...t, target, mapping: guessMapping(target, t.headers) }; };

test("#1034 one CSV per table; geophysics points (no hole) are not a hole table; each file stamped with CRS and conventions", () => {
  assert.deepEqual(files.map((f) => f.name).sort(), ["collars.csv", "geotech_rqd.csv", "lithology.csv", "mineralization.csv", "structure.csv", "survey.csv"]);
  for (const f of files) { assert.match(f.text, /^# /); assert.match(f.text, /EPSG:32610/); assert.match(f.text, /negative = down/); }
});

test("#1034 collars: the importer guesses collars, the default Negative = down gives back the stored dip, custom fields kept, ids kept as text", () => {
  const c = read("collars.csv");
  assert.equal(c.target, "collars"); assert.ok(schemaSatisfied("collars", c.mapping));
  assert.equal(c.mapping.azimuth, "azim_grid"); assert.equal(c.mapping.length, "length");
  assert.equal(c.rows.length, 2);
  const r0 = c.rows[0];
  assert.equal(String(r0[c.mapping.hole_id]), "DH-01");
  assert.equal(num(r0[c.mapping.x]), 500100.5); assert.equal(num(r0[c.mapping.z]), 1210);
  assert.equal(-num(r0[c.mapping.dip]), 60); // flipDip under the default neg_down
  assert.equal(num(r0[c.mapping.azimuth]), 45);
  assert.equal(r0.year, 2024); assert.equal(r0.target, "North zone");
  assert.equal(String(c.rows[1][c.mapping.hole_id]), "#2"); // a "#" id after the header is data (#720)
  assert.ok(Number.isNaN(num(c.rows[1][c.mapping.azimuth]))); // a missing azimuth stays missing, not "NaN" text
  assert.ok(!c.headers.some((h) => h.startsWith("_")));
  assert.match(byName["collars.csv"], /'=cmd/); // formula escaped (#1022)
});

test("#1034 survey: guessed as survey, depth / azimuth / dip back as stored", () => {
  const s = read("survey.csv");
  assert.equal(s.target, "survey"); assert.ok(schemaSatisfied("survey", s.mapping));
  assert.deepEqual(s.rows.map((r) => [num(r[s.mapping.depth]), num(r[s.mapping.azimuth]), -num(r[s.mapping.dip])]), [[0, 45, 60], [150, 47.5, 58]]);
});

test("#1034 logs: litho (with description and a custom field), RQD, mineral %, structure with dip / dip direction / alpha / beta / id / overturned", () => {
  const l = read("lithology.csv");
  assert.equal(l.target, "litho");
  const li = normInterval(l.rows[0], l.mapping, [{ column: "logged_by", name: "logged_by" }]);
  assert.deepEqual([li.hole_id, li.from, li.to, li.value, li.description, li.logged_by], ["DH-01", 0, 12.5, "AND", "Pale green, fine grained", "MS"]);
  const g = read("geotech_rqd.csv");
  assert.equal(g.target, "geotech");
  assert.equal(normNumericInterval(g.rows[0], g.mapping).value, 85);
  const m = read("mineralization.csv");
  assert.equal(m.target, "mnlgy");
  const mi = normInterval(m.rows[0], m.mapping);
  assert.deepEqual([mi.value, mi.extra], ["PY", 2]);
  const st = read("structure.csv");
  assert.equal(st.target, "structure"); assert.ok(schemaSatisfied("structure", st.mapping));
  const si = normStructure(st.rows[0], st.mapping, [], "neg_down");
  assert.deepEqual([si.hole_id, si.depth, si.value, si.dip, si.azimuth, si.alpha, si.beta, si.structure_id, si.overturned], ["DH-01", 42.5, "VN", 65, 120, 40, 210, "V1", true]);
});
