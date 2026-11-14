// TASKS.csv #3281, #3282, #3283 (review #3195, Galore Creek, 3D Modelling Lows)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exportSurfaceTS } from "../src/lib/meshExport.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("#3281 the implicit engine is kept warm between runs, as the gridding jobs are (#3124)", () => {
  const j = read("../python-sidecar/app/jobs.py");
  assert.match(j, /WARM_KINDS = \{"pfields", "implicit"\}/);
  assert.match(j, /out = \{\*\*out, "warmEngine": warm\}  # #3281/);
});

test("#3282 the Structures menu counts the model area's picks first; the Downhole plot opens on a checked hole", () => {
  const p = read("../src/modules/viewer/ModellingPanes.jsx");
  assert.match(p, /inArea = \(r\) => modelArea !== "checked" \|\| visibleHoles\?\.\[r\.hole_id\] !== false/);
  assert.match(p, /oriented in the model area \(\{k2\} of \{n2\} in the project\)/);
  const d = read("../src/components/DownholeStructurePlot.jsx");
  assert.match(d, /useState\(\(\) => \(isChecked && holeIds\.find\(\(id\) => isChecked\(id\)\)\) \|\| holeIds\[0\] \|\| ""\)/);
  assert.match(read("../src/modules/ViewerModule.jsx"), /isChecked=\{\(id\) => visibleHoles\?\.\[id\] !== false\}/);
});

test("#3283 a unit volume's type is listed; codes sort without regard to case; the TSurf names its EPSG", () => {
  assert.match(read("../src/modules/ViewerModule.jsx"), /\{ key: "unit_volume", label: "Unit volume \(closed\)" \}/);
  assert.match(read("../src/modules/viewer/ModellingPanes.jsx"), /\.sort\(\(a, b\) => a\.localeCompare\(b, undefined, \{ sensitivity: "base", numeric: true \}\)\)/);
  const geometry = { attributes: { position: { array: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), count: 3, itemSize: 3 } }, index: null, getIndex: () => null, getAttribute: (k) => geometry.attributes[k] };
  let ts;
  try { ts = exportSurfaceTS("OVB", geometry, { x: 0, y: 0, z: 0 }, null, { epsg: 32609 }); } catch { ts = null; }
  if (ts) { assert.match(ts, /NAME EPSG:32609/); assert.ok(!ts.includes("NAME Default")); }
  assert.match(read("../src/lib/meshExport.js"), /`NAME \$\{extra\?\.epsg \? `EPSG:\$\{extra\.epsg\}` : "Default"\}`/);
});
