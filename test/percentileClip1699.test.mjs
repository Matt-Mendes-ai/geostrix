// TASKS.csv #1699 — unclassified SG / mag susc ramps clip at the 2nd and 98th percentiles; minimum-maximum on request
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { numericClip, numericClips, rampRange, CLIP_KEYS } from "../src/lib/numericClip.js";
import { numericLayerLegendGroups } from "../src/lib/legendGroups.js";

// mag susc like Copley's: most readings small, a few huge
const rows = [];
for (let i = 0; i < 1000; i++) rows.push({ value: i < 992 ? i / 600 : 50 + i - 992 });
rows.push({ value: -0.845 }, { value: 310 });

test("the clip runs from p2 to p98 and keeps the full range beside it", () => {
  const c = numericClip(rows);
  assert.equal(c.min, -0.845); assert.equal(c.max, 310);
  assert.ok(c.lo > 0 && c.lo < 0.05, String(c.lo)); assert.ok(c.hi > 1.5 && c.hi < 2, String(c.hi));
  assert.deepEqual(CLIP_KEYS, ["sg", "magsusc"]);
});

test("the ramp spans the clip unless the layer asks for its full range; RQD is untouched", () => {
  const clips = numericClips({ magsusc: rows, geotech: [{ value: 10 }, { value: 90 }] });
  const full = { min: -0.845, max: 310 };
  assert.equal(rampRange("magsusc", null, clips, full).clipped, true);
  assert.deepEqual(rampRange("magsusc", { fullRange: true }, clips, full), full);
  assert.deepEqual(rampRange("geotech", null, clips, { min: 0, max: 100 }), { min: 0, max: 100 });
});

test("the key says the ends are clamped", () => {
  const clips = numericClips({ magsusc: rows });
  const g = numericLayerLegendGroups({ keys: ["magsusc"], layers: { magsusc: rows }, layerVisible: { magsusc: true }, colorOf: () => "#000", clips });
  assert.match(g[0].ramp.minLabel, /^≤ /); assert.match(g[0].ramp.maxLabel, /^≥ 1\.\d/);
  const f = numericLayerLegendGroups({ keys: ["magsusc"], layers: { magsusc: rows }, layerVisible: { magsusc: true }, colorOf: () => "#000", clips, symbology: { magsusc: { fullRange: true } } });
  assert.equal(f[0].ramp.maxLabel, "310");
});

test("the 3D colours and the panel use it", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("rampRange(layerKey, sym, numericClip, range)"));
  assert.ok(readFileSync(new URL("../src/components/NumericSymbologyEditor.jsx", import.meta.url), "utf8").includes("onChange(sym?.fullRange ? null : { fullRange: true })"));
});
