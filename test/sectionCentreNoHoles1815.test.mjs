// TASKS.csv #1815 (review #1646, Kodiak) — Section by coordinates with a blank centre on a project with no holes refused, although the
// models' centre is known: it now takes the centre of the shown block models, else of everything shown (the box Zoom to fit all frames).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#1815 no holes: the shown block models' centre, else the shown scene's; the notice only when nothing is shown", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const i = v.indexOf("const openTypedSection = () => {"), body = v.slice(i, v.indexOf("const openHoleSection", i));
  assert.ok(body.includes('let bx = visibleSceneBox(voxelGroupRef.current); if (bx.isEmpty()) bx = visibleSceneBox(sceneRef.current?.getObjectByName("root")); const o = originRef.current;'));
  assert.match(body, /if \(bx\.isEmpty\(\)\) \{ setNotices/);
  assert.match(body, /const c = bx\.getCenter\(new THREE\.Vector3\(\)\); e = c\.x \+ o\.x; n = o\.y - c\.z;/);
});
