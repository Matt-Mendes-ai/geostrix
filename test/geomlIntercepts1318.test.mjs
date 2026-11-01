import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unitIntercepts, interceptCheckPoints, scoreIntercepts, missedInterceptsCsv, CHECK_MAX_PER_INTERCEPT } from "../src/lib/geomlIntercepts.js";
import { desurveyHole, pointOnTrace } from "../src/lib/desurvey.js";

const iv = (hole_id, from, to, value) => ({ hole_id, from, to, value });
const T = new Set(["A", "B"]);
test("touching intervals of the unit are one intercept; other rock or a gap ends it", () => {
  assert.deepEqual(unitIntercepts([iv("H", 20, 30, "X"), iv("H", 10, 15, "A"), iv("H", 15, 20, "B"), iv("H", 30, 32, "A"), iv("H", 40, 41, "A"), iv("G", 0, 5, "X")], T), [
    { hole_id: "H", from: 10, to: 20 }, { hole_id: "H", from: 30, to: 32 }, { hole_id: "H", from: 40, to: 41 },
  ]);
});
test("points lie along the drawn trace, inside the intercept; a hole with no collar has none", () => {
  const collars = [{ hole_id: "H", x: 100, y: 200, z: 500, azimuth: 0, dip: 90, length: 100 }];
  const { points, spans } = interceptCheckPoints([{ hole_id: "H", from: 10, to: 20 }, { hole_id: "H", from: 30, to: 30.5 }, { hole_id: "Q", from: 0, to: 5 }, { hole_id: "H", from: 40, to: 90 }], collars, [], desurveyHole, pointOnTrace);
  assert.deepEqual(spans.map((s) => [s.from, s.start, s.count]), [[10, 0, 4], [30, 4, 1], [40, 5, 20]]);
  assert.deepEqual(points[0], [100, 200, 488.75]);
  assert.deepEqual(points[4], [100, 200, 469.75]);
  assert.equal(points.length, 25);
  assert.equal(interceptCheckPoints([{ hole_id: "H", from: 0, to: 100000 }], [{ ...collars[0], length: 100000 }], [], desurveyHole, pointOnTrace).spans[0].count, CHECK_MAX_PER_INTERCEPT);
});
test("an intercept is reached with any point over 50%; exactly 50% is not; missed are by hole then depth", () => {
  const spans = [{ hole_id: "H10", from: 5, to: 6, start: 0, count: 1 }, { hole_id: "H2", from: 9, to: 12, start: 1, count: 2 }, { hole_id: "H2", from: 1, to: 2, start: 3, count: 1 }, { hole_id: "H3", from: 1, to: 2, start: 4, count: 2 }];
  const r = scoreIntercepts(spans, [0.5, 0.1, 0.4, 0.2, 0.3, 0.9]);
  assert.equal(r.logged, 4); assert.equal(r.reached, 1);
  assert.deepEqual(r.missed.map((m) => [m.hole_id, m.from, m.best]), [["H2", 1, 0.2], ["H2", 9, 0.4], ["H10", 5, 0.5]]);
});
test("an older add-on, a failed check or a wrong count gives no claim", () => {
  const spans = [{ hole_id: "H", from: 0, to: 1, start: 0, count: 2 }];
  assert.equal(scoreIntercepts(spans, undefined), null);
  assert.equal(scoreIntercepts(spans, null), null);
  assert.equal(scoreIntercepts(spans, [0.9]), null);
  assert.equal(scoreIntercepts([], []), null);
});
test("the CSV quotes a hole name that needs it", () => {
  assert.equal(missedInterceptsCsv([{ hole_id: 'A,"1', from: 1.234, to: 2, best: 0.4567 }]), 'hole_id,from_m,to_m,length_m,highest_probability\r\n"A,""1",1.23,2,0.77,0.457\r\n');
});
test("the add-on predicts at the app's points and the panel lists what it misses", () => {
  const m = readFileSync("addons/geoml/geostrix_geoml/models.py", "utf8"), p = readFileSync("src/components/PredictivePanel.jsx", "utf8");
  assert.match(m, /_probabilities_at\(geoml, model, p\.get\("check_points"\)\)/);
  assert.match(m, /"check_probability": check_probability/);
  assert.match(p, /params\.check_points = check\.points/);
  assert.match(p, /scoreIntercepts\(check\.spans, res\.check_probability\)/);
  assert.match(p, /<GeomlMissedIntercepts result=\{r\.intercepts\}/);
});
