// TASKS.csv #3998 — Correlation's "Select intervals with a box" did nothing: the box read userData.lithoRow from the litho group's children,
// and the intervals are batched (#1540, #1643), so no child held a row. Now it walks every drawn member, as the pick does. Synthetic holes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { PickStandIn } from "../src/lib/viewer/pickStandIn.js";
import { buildLayerBatches } from "../src/lib/viewer/layerBatches.js";
import { PROTO_CYLINDER } from "../src/lib/viewer/protos.js";
import { intervalsInBox } from "../src/lib/viewer/intervalsInBox.js";

// twenty vertical holes 50 m apart along x, two 20 m intervals each, drawn as the build draws them (stand-ins with lithoRow), then batched
function scene() {
  const g = new THREE.Group(), traces = [];
  for (let h = 0; h < 20; h++) {
    const x = h * 50;
    traces.push({ hole_id: `B${h}`, pts: [{ md: 0, x, y: 0, z: 0 }, { md: 40, x, y: -40, z: 0 }] });
    for (const [from, to, value] of [[0, 20, "LS"], [20, 40, "SH"]]) {
      const row = { hole_id: `B${h}`, from, to, value };
      const m = new PickStandIn(PROTO_CYLINDER, { color: value === "LS" ? "#3366cc" : "#999999" });
      m.position.set(x, -(from + to) / 2, 0); m.scale.set(1, to - from, 1);
      m.userData = { row, holeId: row.hole_id, catValue: value, lithoRow: row };
      g.add(m);
    }
  }
  buildLayerBatches(g);
  // a camera looking at the holes from the front (along -z): x -25..975 across the screen, depth 0..40 down it
  const cam = new THREE.OrthographicCamera(-25, 975, 10, -50, 0.1, 1000);
  cam.position.set(0, 0, 100); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  return { view: { groups: { current: { litho: g } }, camera: { current: cam }, traces: { current: traces } }, g };
}
const rect = { width: 1000, height: 60 };
const px = (x, depth) => [x + 25, 10 + depth]; // world (x, depth below the collar) -> canvas pixels, for this camera

test("the box finds the batched intervals it touches", () => {
  const { view, g } = scene();
  assert.ok(g.children.every((c) => !c.userData?.lithoRow), "batched: no child holds a row (the old walk found none)");
  const [x0, y0] = px(-10, 25), [x1, y1] = px(110, 35); // holes B0-B2, inside their lower interval only
  const rows = intervalsInBox(view, { x0, x1, y0, y1 }, rect);
  assert.deepEqual(rows.map((r) => `${r.hole_id}:${r.value}`).sort(), ["B0:SH", "B1:SH", "B2:SH"]);
  const all = intervalsInBox(view, { x0: 0, x1: 1000, y0: 0, y1: 60 }, rect);
  assert.equal(all.length, 40, "every interval once");
});

test("a hidden interval or a hidden layer is left out", () => {
  const { view, g } = scene();
  const inst = g.children[0];
  // hide B1's intervals in place (the Holes list's pass: a compact batch keeps a hidden flag per row)
  inst.userData.compact.rows.forEach((u, i) => { if (u.holeId === "B1") inst.userData.compact.hidden[i] = 1; });
  const all = intervalsInBox(view, { x0: 0, x1: 1000, y0: 0, y1: 60 }, rect);
  assert.equal(all.length, 38);
  assert.ok(!all.some((r) => r.hole_id === "B1"));
  g.visible = false;
  assert.deepEqual(intervalsInBox(view, { x0: 0, x1: 1000, y0: 0, y1: 60 }, rect), []);
});

test("the pane uses it", () => {
  const s = readFileSync(new URL("../src/components/ModellingCodesPane.jsx", import.meta.url), "utf8");
  assert.match(s, /import \{ intervalsInBox \} from "\.\.\/lib\/viewer\/intervalsInBox\.js";/);
  assert.doesNotMatch(s, /function intervalsInBox/);
});
