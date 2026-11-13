// TASKS.csv #3149 (#2928 (7)) — the generated-surface export row offers GOCAD TSurf (.ts), side 5's writer (lib/meshExport.js exportSurfaceTS).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { exportSurfaceTS } from "../src/lib/meshExport.js";

test("the TSurf writer gives a GOCAD file in real-world coordinates", () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 10, 0, 0, 0, 5, 0], 3));
  g.setIndex([0, 1, 2]);
  const t = exportSurfaceTS("Ore body", g, { x: 500000, y: 6000000, z: 0 });
  assert.match(t, /^GOCAD TSurf 1$/m, "after the provenance comment lines");
  assert.match(t, /name:Ore body/);
  assert.match(t, /VRTX 1 500000\.0000 6000000\.0000 0\.0000/);
  assert.match(t, /TRGL 1 2 3/);
  assert.match(t, /END\s*$/);
});

test("wiring: a TSurf button in the Export mesh row, and the ts branch saving a .ts file", () => {
  const s = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(s, /<button onClick=\{\(\) => exportImplicitSurface\(s\.id, "ts"\)\}[^\n]*\{tr\("TSurf"\)\}<\/button>/);
  assert.match(s, /\} else if \(format === "ts"\) \{[^\n]*\n\s+res = await saveFile\(\{ quiet: true, suggestedName: `\$\{baseName\}\.ts`, filters: \[\{ name: "GOCAD TSurf", extensions: \["ts"\] \}\], content: exportSurfaceTS\(/);
  assert.match(s, /format: format === "ts" \? "GOCAD TSurf" : format\.toUpperCase\(\)/);
});
