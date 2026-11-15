// TASKS.csv #3428 (side session 3's note) — a solid imported millions of metres from the project froze the 3D View for about a minute (fitted, with
// a scene origin that far away). Asked before it is imported when it is over 100 km from the holes; imported anyway, the view is not moved to it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { solidFarFromHoles, FAR_SOLID_M } from "../src/lib/solidFar.js";

const box = (x0, y0, x1, y1) => ({ min: { x: x0, y: y0, z: 0 }, max: { x: x1, y: y1, z: 100 } });
const collars = [{ x: 458000, y: 6563000 }, { x: 458400, y: 6563600 }, { x: 458200, y: 6563300 }];

test("near, far, long-but-reaching, nothing to compare", () => {
  assert.equal(FAR_SOLID_M, 100000);
  assert.equal(solidFarFromHoles(box(458100, 6563100, 458300, 6563400), collars).far, false);
  const far = solidFarFromHoles(box(5000000, 9000000, 5000500, 9000500), collars);
  assert.equal(far.far, true);
  assert.ok(far.distM > 4e6 && far.distM < 1.2e7, String(far.distM));
  assert.deepEqual(far.solid, [5000250, 9000250]);
  // a long pit shell whose box reaches the holes is not far, however long it is
  assert.equal(solidFarFromHoles(box(400000, 6500000, 700000, 6700000), collars).far, false);
  // a solid 90 km away is not asked about; 120 km is
  assert.equal(solidFarFromHoles(box(548300, 6563000, 548500, 6563200), collars).far, false);
  assert.equal(solidFarFromHoles(box(578300, 6563000, 578500, 6563200), collars).far, true);
  assert.equal(solidFarFromHoles(null, collars), null);
  assert.equal(solidFarFromHoles(box(0, 0, 1, 1), []), null);
  assert.equal(solidFarFromHoles(box(0, 0, 1, 1), [{ x: NaN, y: 1 }]), null);
});

test("wiring: asked after the tie question; cancel stops the import; accepted, the view is not fitted; keys", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const i = v.indexOf("const importSolidFile = useCallback");
  const body = v.slice(i, v.indexOf("}, [fitBox, project?.epsg, setTaskProgress]);", i));
  assert.ok(body.indexOf("solidTieGuess") < body.indexOf("solidFarFromHoles"), "the tie question first");
  assert.match(body, /if \(farSolid\?\.far && !window\.confirm\(tr\("\\"\{name\}\\" lies about \{km\} km from your holes/);
  assert.match(body, /import cancelled \(it lies about \{km\} km from the holes\)\./);
  assert.match(body, /if \(!farSolid\?\.far\) fitBox\(box\);/);
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")); assert.ok(d["{name}: import cancelled (it lies about {km} km from the holes)."], l); assert.ok(Object.keys(d).some((k) => k.startsWith("\"{name}\" lies about {km} km")), l); }
});
