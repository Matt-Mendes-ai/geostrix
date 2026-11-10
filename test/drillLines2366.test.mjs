// TASKS.csv #2366 (review #2325, WA uranium) — section defaults from the drill lines: their bearing, their spacing, the median collar
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drillLineGeometry } from "../src/modules/viewer/drillLines.js";

// fences bearing 120°, sites 77 m apart along them, fences 200 m apart, plus three outliers to the north-west
const fences = (() => {
  const az = (120 * Math.PI) / 180, u = [Math.sin(az), Math.cos(az)], v = [Math.cos(az), -Math.sin(az)];
  const out = [];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 15; k++) out.push({ x: 500000 + u[0] * k * 77 + v[0] * f * 200, y: 6680000 + u[1] * k * 77 + v[1] * f * 200 });
  out.push({ x: 495000, y: 6686000 }, { x: 495100, y: 6686100 }, { x: 494900, y: 6686050 });
  return out;
})();

test("the bearing, the spacing between fences, the extent along them, the median collar", () => {
  const g = drillLineGeometry(fences);
  assert.ok(Math.abs(g.azimuth - 120) <= 1, String(g.azimuth));
  assert.ok(Math.abs(g.spacing - 200) <= 10, String(g.spacing));
  assert.ok(g.alongM >= 14 * 77 - 1, String(g.alongM));
  // the median collar sits on the fences, not pulled to the outliers as the bounding-box centre is
  const xs = fences.map((p) => p.x), ys = fences.map((p) => p.y);
  const bbox = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const nearest = (q) => Math.min(...fences.slice(0, 90).map((p) => Math.hypot(p.x - q.x, p.y - q.y)));
  assert.ok(nearest(g.centre) < nearest(bbox));
  assert.equal(drillLineGeometry(fences.slice(0, 3)), null);
});

test("the WA collars: fences near 120 degrees", () => {
  const rows = readFileSync(new URL("../sample_data/wa_uranium/collars.csv", import.meta.url), "utf8").split(/\r?\n/).slice(1).filter(Boolean).map((l) => { const p = l.split(","); return { x: +p[1], y: +p[2] }; });
  const g = drillLineGeometry(rows);
  assert.ok(g.azimuth >= 110 && g.azimuth <= 130, String(g.azimuth)); // the review's 110-130 degrees
});

test("the viewer takes the seeded state and the median collar", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /= useDrillLineDefaults\(collars\); \/\/ #2366/);
  assert.match(v, /e = lineCentre\?\.x \?\? \(arrMin\(xs\) \+ arrMax\(xs\)\) \/ 2/);
});
