// TASKS.csv #2219 (review #2174, WA gold) — an open grade shell gets no volume total and no tonnage: an open mesh's volume depends on the
// scene origin (#1028 / #1226), and #1229 only hid the 'Volume:' line
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("the bodies line totals only a watertight shell; an open one is counted in pieces", () => {
  assert.match(v, /\{expandedSurfaceVolume\.watertight \? tx\("This shell is \{bodies\} totalling \{vol\} m³, not one continuous body\."/);
  assert.match(v, /: tr\("This shell is \{n\} separate pieces, not one continuous body\.", \{ n: expandedSurfaceVolume\.componentCount \}\)/);
});

test("the tonnage block is drawn for a watertight surface only", () => {
  assert.match(v, /\{expandedSurfaceVolume\.watertight && <SurfaceTonnage s=\{s\} volumeM3=\{expandedSurfaceVolume\.volumeM3\}/);
  assert.equal((v.match(/<SurfaceTonnage /g) || []).length, 1);
});
