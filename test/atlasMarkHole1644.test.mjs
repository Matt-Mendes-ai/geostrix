// TASKS.csv #1644 — each atlas page marks its hole on the template's map; a large project's dialog opens unticked
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { markHoleOnViewports } from "../src/lib/atlas.js";
import { worldToVp } from "../src/lib/layoutGeometry.js";

const plan = { id: "vp", type: "viewport", planView: true, trueScale: true, targetWorld: { x: 609033, y: 6355422 }, worldHeightAtTarget: 4000, w: 600, h: 400, cameraAzimuthDeg: 0 };
const oblique = { id: "vp2", type: "viewport", w: 300, h: 200 };

test("top-down true-scale viewports get the collar; others are left alone", () => {
  const els = markHoleOnViewports([plan, oblique, { id: "t", type: "text" }], { hole_id: "21AGBDD001", x: 609669.6, y: 6355932.5 });
  assert.deepEqual(els[0].markHole, { id: "21AGBDD001", x: 609669.6, y: 6355932.5 });
  assert.equal(els[1].markHole, undefined); assert.equal(els[2].markHole, undefined);
  assert.equal(markHoleOnViewports([plan], { hole_id: "X", x: NaN, y: 1 })[0].markHole, undefined);
});

test("the mark sits where the collar is on the capture: east is right, north is up", () => {
  const [u, v] = worldToVp(plan, 609669.6, 6355932.5);
  assert.ok(u > 0 && v < 0, `${u} ${v}`);
  assert.ok(Math.abs(u) <= plan.w / 2 && Math.abs(v) <= plan.h / 2, "inside this 6 x 4 km frame");
});

test("wired: the page draws it; the dialog opens unticked above 50 holes", () => {
  const a = readFileSync(new URL("../src/lib/atlas.js", import.meta.url), "utf8");
  assert.match(a, /markHoleOnViewports\(templateElements\.map/);
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /el\.markHole && \(\(\) => \{/);
  assert.match(m, /\{id\} is outside this map/);
  const g = readFileSync(new URL("../src/components/GenerateAtlasModal.jsx", import.meta.url), "utf8");
  assert.match(g, /collars\.length > 50 \? \[\] :/);
});
