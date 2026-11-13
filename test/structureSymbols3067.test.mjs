// TASKS.csv #3067 (Matt: "let's have both. I think it will look great!") — a drillhole structure disc carries its type's USGS symbol (#3066)
// inside it, in the disc's plane: the strike line along the right-hand-rule strike, the tick down the dip.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { symbolTriangles, symbolProto3d, symbolInk, MM_TO_DISC } from "../src/lib/viewer/structureSymbol3d.js";
import { SYMBOLS, symbolForReading } from "../src/lib/structureSymbols.js";

// the disc's transform as drillholeScene builds it; scene x = E, y = up, z = -N
function discMatrix(dip, dipDir, radius = 6) {
  const o = new THREE.Object3D();
  o.rotation.order = "YXZ"; o.rotation.x = Math.PI / 2 - (dip * Math.PI) / 180; o.rotation.y = -(dipDir * Math.PI) / 180;
  o.scale.setScalar(radius); o.updateMatrix();
  return o.matrix;
}
const bearing = (v) => ((Math.atan2(v.x, -v.z) * 180) / Math.PI + 360) % 360; // of a scene vector's horizontal part

test("inclined bedding (6.2) on a disc dipping 30 toward 120: the strike line runs 030-210 in the disc, the tick points down the dip", () => {
  const sym = SYMBOLS["6.2"], m = discMatrix(30, 120);
  const at = (u, v) => new THREE.Vector3(-u * MM_TO_DISC, -v * MM_TO_DISC, 0).applyMatrix4(m);
  const a = at(-2.5, 0), b = at(2.5, 0), tip = at(0, 1.0), c = at(0, 0);
  const strike = b.clone().sub(a);
  assert.ok(Math.abs(bearing(strike) - 30) < 1e-6, `strike bearing ${bearing(strike)}`);
  assert.ok(Math.abs(strike.y) < 1e-9, "the strike line is level");
  assert.ok(Math.abs(strike.length() - 2 * 0.8 * 6) < 1e-9, "80 % of the disc's diameter");
  const down = tip.clone().sub(c);
  assert.ok(down.y < 0 && Math.abs(bearing(down) - 120) < 1e-6, `the tick down the dip toward 120: ${bearing(down)}`);
  assert.ok(Math.abs((Math.asin(-down.y / down.length()) * 180) / Math.PI - 30) < 1e-6, "at the disc's dip");
  // the geometry: strips on both faces, every vertex within the disc
  const { positions, count } = symbolTriangles(sym);
  assert.ok(count > 0 && count % 3 === 0);
  for (let i = 0; i < count; i++) assert.ok(Math.hypot(positions[i * 3], positions[i * 3 + 1]) < 1, "inside the disc");
  const zs = new Set(); for (let i = 0; i < count; i++) zs.add(Math.sign(positions[i * 3 + 2]));
  assert.deepEqual([...zs].sort(), [-1, 1], "drawn above and below the disc");
});

test("one shared geometry per symbol; ink that reads on the disc; a type's family from its words", () => {
  const g1 = symbolProto3d(SYMBOLS["6.2"]), g2 = symbolProto3d(SYMBOLS["6.2"]);
  assert.equal(g1, g2);
  assert.equal(g1.userData.sharedProto, true);
  assert.equal(g1.userData.protoKey, "sym:6.2");
  assert.notEqual(symbolProto3d(SYMBOLS["6.3"]), g1);
  assert.equal(symbolInk("#ffffff"), "#1a2028");
  assert.equal(symbolInk("#f2c94c"), "#1a2028");
  assert.equal(symbolInk("#1f3a93"), "#ffffff");
  assert.equal(symbolInk("#000000"), "#ffffff");
  assert.equal(symbolForReading({ type: "Fault", dip: 60 }).family, "fault");
  assert.equal(symbolForReading({ type: "Bedding", dip: 90 }).attitude, "vertical");
  assert.equal(symbolForReading({ type: "Joint", dip: 40 }, { JOINT: "cleavage" }).family, "cleavage", "the project's choice wins");
});

test("wiring: each oriented disc gets its symbol with the disc's transform; a choice redraws; the legend overrides leave the ink alone", () => {
  const s = fs.readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8");
  assert.match(s, /const \{ symbol \} = symbolForReading\(\{ type: s\.value, dip \}, symChoices\);/);
  assert.match(s, /sym\.position\.copy\(disc\.position\); sym\.rotation\.copy\(disc\.rotation\); sym\.scale\.copy\(disc\.scale\);/);
  assert.match(s, /sym\.userData = \{ \.\.\.disc\.userData, symbol: symbol\.fgdc \};/);
  assert.match(s, /sigs\.get\("structure"\)\.push\(JSON\.stringify\(symChoices\), JSON\.stringify\(symScales\)\);/); // #3091: the thickness too
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /if \(child\.userData\?\.catValue === undefined \|\| !child\.material\?\.color \|\| child\.userData\.symbol\) return;/);
});
