// TASKS.csv #2220 (review #2174, WA gold) — a fence on a project drilled in fans from a few sites opens on the largest site's fan
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { largestSiteFan, initialFenceSelection, FENCE_MANY } from "../src/lib/fence.js";

// a trace from (x0, y0, z0) along an azimuth (deg), dipping 60, 200 m long, in 10 m steps
const trace = (hole_id, x0, y0, az, z0 = 300) => {
  const wx = [], wy = [], wz = [], a = (az * Math.PI) / 180;
  for (let md = 0; md <= 200; md += 10) { wx.push(x0 + Math.sin(a) * md * 0.5); wy.push(y0 + Math.cos(a) * md * 0.5); wz.push(z0 - md * 0.866); }
  return { hole_id, wx, wy, wz };
};
// six sites 150 m apart, fans of 6 to 12 holes each in one vertical plane (azimuth 90 / 270)
const traces = [];
[12, 9, 8, 7, 6, 6].forEach((n, s) => { for (let k = 0; k < n; k++) traces.push(trace(`S${s}H${k}`, s * 150 + (k % 3) * 0.4, 0, k % 2 ? 90 : 270)); });

test("the largest site's fan is found when most holes are in fans", () => {
  const fan = largestSiteFan(traces);
  assert.equal(fan.length, 12);
  assert.ok(fan.every((id) => id.startsWith("S0")));
  // spread single holes: no fans
  const spread = Array.from({ length: 50 }, (_, k) => trace(`G${k}`, k * 60, 0, 90));
  assert.equal(largestSiteFan(spread), null);
});

test("the opening selection is that fan, said with its size", () => {
  assert.ok(traces.length > FENCE_MANY);
  const sel = initialFenceSelection(traces, 100);
  assert.equal(sel.ids.length, 12); assert.equal(sel.site, 12); assert.equal(sel.trimmed, traces.length - 12);
  const m = readFileSync(new URL("../src/components/FenceDiagramModal.jsx", import.meta.url), "utf8");
  assert.match(m, /initial\.site \? tr\("Opened on \{k\} holes of the largest drill site's fan/);
});
