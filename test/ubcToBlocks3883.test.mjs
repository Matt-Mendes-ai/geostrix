// TASKS.csv #3883 (#3812) — 'Import a UBC DCIP2D inversion' given a 3D UBC mesh says where it goes AND offers 'Import as a block model', which hands
// the same files to Block models' Import UBC mesh + model (the geophysics-ubc action: that pane opens and reads them). Source test.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3883 a 3D mesh in the DCIP2D import: the refusal keeps the files and a button hands them to Block models", () => {
  const d = read("../src/components/DcipPanel.jsx");
  assert.match(d, /\.map\(Number\); setMesh3d\(files\); throw new Error\(tr\("\\"\{name\}\\" is a 3D UBC mesh/);
  assert.match(d, /onClick=\{\(\) => \{ const files = mesh3d; setMesh3d\(null\); setMsg\(null\); requestModuleAction\("geophysics-ubc", \{ files \}\); \}\}>\{tr\("Import as a block model"\)\}/);
  assert.match(d, /setMsg\(null\); setMesh3d\(null\);/, "a 2D import that reads clears it");
  const g = read("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /useModuleAction\(\["geophysics-ubc"\], \(_a, p\) => \{ if \(p\?\.files\?\.length\) \{ setGeoPane\("voxel"\); importUBC\(p\.files\); \} \}\);/);
});
