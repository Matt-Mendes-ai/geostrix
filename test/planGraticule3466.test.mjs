// TASKS.csv #3466 — a longitude / latitude graticule on the Maps plan
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { graticule, graticuleStep, graticuleLabel } from "../src/lib/planGraticule.js";
import { pointTransform } from "../src/lib/reproject.js";

test("steps are round degrees; labels carry the hemisphere", () => {
  assert.equal(graticuleStep(0.03), 0.005); assert.equal(graticuleStep(2), 0.5); assert.equal(graticuleStep(40), 5);
  assert.equal(graticuleLabel("lon", -131.4, 0.1), "131.4°W"); assert.equal(graticuleLabel("lat", 57.1, 0.1), "57.1°N"); assert.equal(graticuleLabel("lat", -22.5, 0.5), "22.5°S"); // 0.5 -> 1 decimal
});

test("over a 6 km view in UTM 9N the lines are real meridians and parallels: each point converts back to its own value", () => {
  const toLL = pointTransform(26909, 4326), toXY = pointTransform(4326, 26909);
  const g = graticule([350000, 6333000, 356000, 6339000], (x, y) => toLL(x, y), (lo, la) => toXY(lo, la));
  assert.ok(g.lines.length >= 4 && g.lines.length <= 24, `${g.lines.length}`);
  for (const ln of g.lines) {
    for (const p of ln.pts) { const [lo, la] = toLL(p.x, p.y); assert.ok(Math.abs((ln.kind === "lon" ? lo : la) - ln.value) < 1e-7, `${ln.kind} ${ln.value}`); }
  }
  assert.ok(g.lines.some((l) => l.kind === "lon") && g.lines.some((l) => l.kind === "lat"));
  assert.equal(graticule([0, 0, 1, 1], () => null, () => null), null);
});

test("the plan draws it behind a checkbox, for a projected CRS only", () => {
  const p = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /const \[showLonLat, setShowLonLat\] = useKept\(scope, "showLonLat", false\);/ /* #3604 */);
  assert.match(p, /if \(showLonLat && project\?\.crsSet !== false && project\?\.epsg && !isGeographicCrs\(project\.epsg\)\)/);
  assert.match(p, /tr\("Lon \/ lat"\)/);
});
