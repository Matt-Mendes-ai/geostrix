// TASKS.csv #1695 (review #1645, Copley) — pXRF readings in Data QC: zero-length screening points on core are not assay intervals
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runDataQC } from "../src/lib/dataQC.js";

const collars = [{ hole_id: "H1", x: 0, y: 0, z: 100, azimuth: 0, dip: -90, length: 50 }];
const lab = [{ hole_id: "H1", from: 0, to: 2, values: { Cu: 120 } }, { hole_id: "H1", from: 2, to: 4, values: { Cu: 161 } }];
const pxrf = [{ hole_id: "H1", from: 1, to: 1, source: "pXRF", values: { Cu: 5703 } }, { hole_id: "H1", from: 3, to: 3, source: "pXRF", values: { Cu: 11 } }];

test("#1695 pXRF rows raise no zero-length or overlap warnings and are said once; lab intervals are still checked", () => {
  const r = runDataQC({ collars, survey: [], layers: {}, assays: [...lab, ...pxrf] });
  const issues = Array.isArray(r) ? r : r.issues;
  const text = issues.map((i) => i.message || i.text || JSON.stringify(i));
  assert.ok(!text.some((t) => /Zero-length assay interval/.test(t)), text.join(" | "));
  assert.ok(!text.some((t) => /Overlapping assay intervals/.test(t)), text.join(" | "));
  assert.ok(text.some((t) => /2 pXRF reading\(s\) are screening points/.test(t)), text.join(" | "));
  const r2 = runDataQC({ collars, survey: [], layers: {}, assays: [...lab, { hole_id: "H1", from: 3, to: 6, values: { Cu: 9 } }, { hole_id: "H1", from: 7, to: 7, values: { Cu: 1 } }] });
  const t2 = (Array.isArray(r2) ? r2 : r2.issues).map((i) => i.message || i.text || JSON.stringify(i));
  assert.ok(t2.some((t) => /Overlapping assay intervals/.test(t)) && t2.some((t) => /Zero-length assay interval/.test(t)), t2.join(" | "));
});

test("#1695 the 3D view keeps a source choice, draws a pXRF reading as a cube that says pXRF, and the strip log gives pXRF its own dots", () => {
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /const \[assaySource, setAssaySource\] = useState\("lab"\)/);
  assert.match(vm, /shape = px \? "cube" : style\?\.shape \|\| "sphere"/);
  assert.match(vm, /\$\{px \? " \(pXRF\)" : ""\}/);
  assert.match(vm, /<option value="pxrf">/);
  const sl = readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");
  assert.match(sl, /kind: "pxrfdots"/);
  assert.match(sl, /a\.source !== "pXRF"\)\.sort/);
});
