// TASKS.csv #1625 — the Maps tab's main pane is a plan of its data, not a 'switch tabs' card
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planDataExtent } from "../src/lib/mapsPlan.js";

test("extent: every visible raster, terrain, layer, boundary, collar and sample; hidden ones left out; nothing -> null", () => {
  assert.equal(planDataExtent({}), null);
  const e = planDataExtent({
    rasters: [{ bbox: [100, 200, 300, 400] }, { bbox: [0, 0, 9e6, 9e6], visible: false }],
    terrain: { bbox: [150, 150, 250, 450] },
    boundaries: [{ polylines: [[{ x: 50, y: 300 }, { x: 60, y: 310 }]] }],
    collars: [{ x: 320, y: 250 }],
  });
  assert.deepEqual(e, [50, 150, 320, 450]);
});

test("wired: Maps shows the plan when there is data, the card otherwise", () => {
  const m = readFileSync(new URL("../src/modules/MapsModule.jsx", import.meta.url), "utf8");
  assert.match(m, /const hasPlan = !!planDataExtent\(/);
  assert.match(m, /hasPlan && <div className="ge-main"[^\n]*<MapsPlanView \/>/);
  assert.match(m, /!hasPlan && \(/);
  const p = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8");
  assert.match(p, /keyedCanvas\(im, keyColour\)/, "the #1623 transparent colour applies in the plan too");
  assert.match(p, /mapStyleSignature\(l\)/, "map layers cached per style");
});
