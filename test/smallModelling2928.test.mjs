// TASKS.csv #2928 (review #2876, WA bedded iron) — small things met in 3D Modelling: (2) Litho groups proposes the sub-divided codes of one unit
// (DID_U / DID_M / DID_L beside DID); (3) Model settings names a cluster by its place, not one hole id; (6) the no-structures notice no longer
// ends 'Import a structure CSV' on a project with none; (7) a surface can be written as GOCAD TSurf (it was import only), read back by gocad.js.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { subdivisionGroups } from "../src/lib/lithoGroups.js";
import { exportSurfaceTS } from "../src/lib/meshExport.js";
import { parseGocad } from "../src/lib/gocad.js";

test("(2) sub-divided codes of one unit are proposed together, with the base when it is logged", () => {
  const V = (v, n) => Array.from({ length: n }, () => ({ value: v }));
  const rows = [...V("DID", 9), ...V("DID_U", 4), ...V("DID_M", 3), ...V("DID_L", 2), ...V("CLA_U", 2), ...V("CLA_L", 1), ...V("MNG_U", 1), ...V("HNAM", 7), ...V("CC", 3), ...V("SONAM", 2)];
  const s = subdivisionGroups(rows);
  assert.deepEqual(s.map((g) => [g.name, g.codes, g.total]), [["DID", ["DID", "DID_L", "DID_M", "DID_U"], 18], ["CLA", ["CLA_L", "CLA_U"], 3]]);
  assert.equal(s.find((g) => g.name === "MNG"), undefined, "one part alone is not a group");
  assert.equal(subdivisionGroups(rows, [{ codes: ["DID_U"] }]).find((g) => g.name === "DID"), undefined, "a part already grouped: not proposed");
  assert.deepEqual(subdivisionGroups([...V("DAC-1", 2), ...V("DAC-2", 1), ...V("SC", 1)]).map((g) => g.name), ["DAC"], "numbered parts after a dash");
  assert.deepEqual(subdivisionGroups([...V("CC", 2), ...V("C", 1), ...V("SONAM", 1), ...V("SNAM", 1)]), [], "no separator, no part");
});

test("(7) a surface written as GOCAD TSurf reads back with the same vertices and triangles", () => {
  const g = new THREE.BufferGeometry();
  // scene space (x, elevation, -north) around an origin; world = (x + ox, oy - z, y + oz)
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 10, 0, 100, 12, 0, 0, 14, -100, 100, 16, -100]), 3));
  g.setIndex([0, 1, 2, 1, 3, 2]);
  const ts = exportSurfaceTS("Top of TNAM", g, { x: 806000, y: 7507000, z: 400 }, null, {});
  assert.match(ts, /^# Top of TNAM — exported from GeoStrix/);
  assert.match(ts, /GOCAD TSurf 1\nHEADER \{\nname:Top of TNAM\n\}/);
  assert.match(ts, /ZPOSITIVE Elevation/);
  const objs = parseGocad(ts);
  const o = (Array.isArray(objs) ? objs : objs.objects || [])[0];
  assert.ok(o, "one object read back");
  assert.equal(o.name, "Top of TNAM");
  const pos = o.positions || o.vertices, idx = o.indices || o.faces;
  assert.ok(pos && idx, `read: ${Object.keys(o).join(", ")}`);
  assert.equal((pos.length || 0) / 3, 4);
  assert.deepEqual(Array.from(pos).slice(0, 3).map((v) => Math.round(v)), [806000, 7507000, 410]);
  assert.equal(idx.length, 6);
  assert.match(ts, /\nEND\n$/);
});

test("(3) cluster buttons name the place; (6) the no-structures notice; the keys", () => {
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /"Around E \{e\}, N \{nn\}: \{n\} holes over \{s\} km"/);
  assert.match(p, /subdivisionGroups\(layers\.litho \|\| \[\], lithoGroups\)/);
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.ok(!r.includes("Import a structure CSV for a more accurate result."));
  assert.ok(r.includes("contact points: the orientation comes from the contacts alone."));
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Group as {name}", "Around E {e}, N {nn}: {n} holes over {s} km", "No structure picks found — estimated a single dip/azimuth (~{dip}°/~{azimuth}°) from the shape of the \"{unitName}\" contact points: the orientation comes from the contacts alone."]) assert.ok(d[k], `${l}: ${k}`);
  }
});
