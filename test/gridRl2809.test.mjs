// TASKS.csv #2809 (split from #2691) — where a project is kept on a mine grid with an RL datum (grid RL = elevation + rlOffset), the hole info (Identify),
// the status bar and the section's elevation axis show the grid RL, not only the elevation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { gridRlOf, rlOffsetOf } from "../src/lib/localGridDatum.js";
import { describeHits, identifyText } from "../src/lib/viewer/identify.js";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const obj = (userData, parent = null) => ({ userData, parent, visible: true });
const ctx = (over = {}) => ({ origin: { x: 1000, y: 2000, z: 500 }, rayDirection: new THREE.Vector3(0, -1, 0), isHole: (id) => id === "H1", traceOf: () => null, layerOf: (o) => (o.parent ? "Collars" : null), rasterOf: () => null, mapLayerOf: () => null, structureSetOf: () => null, terrainMesh: null, kindOf: () => null, tolerance: () => 1, units: {}, ...over });
const P = (x, y, z) => new THREE.Vector3(x, y, z);

test("gridRlOf: the elevation plus the datum, to a millimetre; nothing without a datum, with 0, or with no elevation", () => {
  assert.equal(gridRlOf(250, 1000), 1250);
  assert.equal(gridRlOf(-12.3456, 1000), 987.654);
  assert.equal(gridRlOf(250, null), null);
  assert.equal(gridRlOf(250, undefined), null);
  assert.equal(gridRlOf(250, 0), null, "a datum of 0: the RL is the elevation, nothing more to say");
  assert.equal(gridRlOf(null, 1000), null);
  assert.equal(gridRlOf("", 1000), null);
  assert.equal(gridRlOf(undefined, 1000), null);
  assert.equal(gridRlOf(NaN, 1000), null);
  assert.equal(gridRlOf(-1000, 1000), 0, "a real RL of 0 is a number, not 'none'");
});

test("a project kept on a mine grid reads its RL offset; a CRS project does not", () => {
  assert.equal(rlOffsetOf({ crsSet: false, localGrid: { rlOffset: 1000 } }), 1000);
  assert.equal(rlOffsetOf({ crsSet: true, epsg: 26917, localGrid: { rlOffset: 1000 } }), null);
});

test("Identify: a collar's record gets its grid RL right after its z; the clicked point and the copied text carry the RL", () => {
  const group = {}, collar = obj({ tip: "H1\ncollar", collar: { hole_id: "H1", x: 5000, y: 6000, z: 250, depth: 120, azimuth: 0, dip: -60 } }, group);
  const [it] = describeHits([{ object: collar, point: P(10, 20, -30), distance: 5 }], ctx({ rlOffset: 1000 }));
  const keys = it.fields.map(([k]) => k), f = Object.fromEntries(it.fields);
  assert.equal(f.z, "250");
  assert.equal(f["RL (grid)"], "1,250", "or 1250 in the number format Identify uses");
  assert.equal(keys.indexOf("RL (grid)"), keys.indexOf("z") + 1);
  assert.equal(it.world.z, 520); assert.equal(it.world.rl, 1520);
  assert.match(identifyText(it), /520 m, grid RL 1,520 m|520 m, grid RL 1520 m/);
});

test("Identify without a datum is unchanged: no RL row, no world.rl, the same text", () => {
  const group = {}, collar = obj({ tip: "H1\ncollar", collar: { hole_id: "H1", x: 5000, y: 6000, z: 250, depth: 120 } }, group);
  const [it] = describeHits([{ object: collar, point: P(10, 20, -30), distance: 5 }], ctx());
  assert.ok(!it.fields.some(([k]) => k === "RL (grid)"));
  assert.equal(it.world.rl, undefined);
  assert.doesNotMatch(identifyText(it), /grid RL/);
  const [it0] = describeHits([{ object: collar, point: P(10, 20, -30), distance: 5 }], ctx({ rlOffset: 0 }));
  assert.equal(it0.world.rl, undefined, "a datum of 0 adds nothing");
});

test("wiring: the datum reaches Identify, the status bar and the section (axis ticks, title, subtitle), and the 3D View passes it", () => {
  const vm = src("../src/modules/ViewerModule.jsx");
  assert.match(vm, /import \{ rlOffsetOf \} from "\.\.\/lib\/localGridDatum\.js";/);
  assert.match(vm, /\], rlOffset: rlOffsetOf\(project\) \/\* #2809 \*\/ \}\);/);
  assert.match(vm, /withSectionPatterns\(\{ \.\.\.payload, rlOffset: rlOffsetOf\(project\) \/\* #2809 \*\/ \},/);
  assert.match(src("../src/lib/viewer/identify.js"), /rlOffset: r\.rlOffset,/);
  const app = src("../src/App.jsx");
  assert.match(app, /const off = rlOffsetOf\(project\), rl = gridRlOf\(cursor\.z, off\);/);
  const sw = src("../src/components/SectionWindow.jsx");
  assert.match(sw, /scatter = \[\], rlOffset = 0(?:, [\w = \[\]]+)* \} = data;/); // #4002 adds fields after it (mineralBars, barKeyRows)
  assert.match(sw, /niceTicks\(win\.Z0 \+ rlOff, win\.Z1 \+ rlOff, 8\)\.filter\(.*\)\.map\(\(rl, i\) => \{ const z = rl - rlOff;/); // #4009: the zoom window's elevations (the whole section at fit)
  assert.match(sw, /\{rlOff \? tr\("RL \(m\)"\) : tr\("Elevation \(m\)"\)\}/);
  assert.match(sw, /tr\(rlOff \? "Azimuth \{v\}° · looking \{look\} · \{v2\}\{v3\} · RL in m" : "Azimuth/);
});
