// TASKS.csv #2229 (review #2174, WA gold) — the reach notice states how far the solver's box really reaches past the contacts, per axis,
// and the cell size that follows, beside the clip distance it gave alone
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");

test("the box's own pads are kept where the extent is built", () => {
  const i = r.indexOf("const extent = [xmin, xmax, ymin, ymax, zmin, zmax];"), j = r.indexOf("const boxPadM = { x: xr.min - xmin, y: yr.min - ymin, z: zr.min - zmin };");
  assert.ok(i > 0 && j > i && j - i < 400);
});

test("the notice says the pads per axis and the cell, beside the clip distance", () => {
  assert.match(r, /For the solver the model box reaches \{px\} m \(east-west\), \{py\} m \(north-south\) and \{pz\} m \(vertically\) past these contacts, so its cells are \{cell\} m; the surfaces are cut back to the distances above\./);
  assert.match(r, /px: Math\.round\(boxPadM\.x\), py: Math\.round\(boxPadM\.y\), pz: Math\.round\(boxPadM\.z\), cell: Math\.round\(Math\.max\(xmax - xmin, ymax - ymin, zmax - zmin\) \/ modelResolution\)/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(Object.keys(d).some((k) => k.includes("For the solver the model box reaches {px} m")), l);
  }
});
