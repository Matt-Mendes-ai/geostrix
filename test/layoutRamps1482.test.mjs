// TASKS.csv #1482 — Layout's 'Load from view' legend had no RQD / recovery / SG / mag susc ramp although those logs colour the holes
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { numericLayerColorFn, numericClips } from "../src/lib/numericClip.js";
import { numericLayerLegendGroups, legendGroupsToItems } from "../src/lib/legendGroups.js";
import { rqdColor, magColor } from "../src/lib/layers.js";

const layers = { geotech: [{ hole_id: "H", from: 0, to: 3, value: 40 }, { hole_id: "H", from: 3, to: 6, value: 90 }], magsusc: Array.from({ length: 50 }, (_, i) => ({ hole_id: "H", depth: i, value: i < 48 ? i / 10 : 300 })) };

test("the colours are the 3D view's: RQD's fixed ramp, mag susc clipped to its 2nd-98th percentile", () => {
  const clips = numericClips(layers), col = numericLayerColorFn({}, clips);
  assert.equal(col("geotech", 40), rqdColor(40));
  assert.equal(col("magsusc", 300, { min: 0, max: 300 }), magColor(300, clips.magsusc.lo, clips.magsusc.hi));
});

test("the view's numeric logs become ramp groups in the legend", () => {
  const clips = numericClips(layers);
  const g = numericLayerLegendGroups({ layers, layerVisible: { geotech: true, magsusc: true }, colorOf: numericLayerColorFn({}, clips), clips });
  assert.deepEqual(g.map((x) => x.key), ["numeric_geotech", "numeric_magsusc"]);
  assert.ok(g.every((x) => x.ramp?.colors?.length === 17));
  assert.ok(legendGroupsToItems(g).length > 0);
  const s = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(s, /return numericLayerLegendGroups\(\{ layers, layerVisible, colorOf: numericLayerColorFn\(sym, clips\), symbology: sym, clips \}\);/);
});
