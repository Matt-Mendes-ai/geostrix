// TASKS.csv #2371 (review #2325, WA uranium: 430 holes, one survey station each at 0 m, dip -90) — each Desurvey choice rebuilt the whole
// view for 0.8-0.9 s although every method gives the same straight traces. The build now depends on the method only where some hole's survey
// has two attitudes; a switch that changes nothing says so.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { desurveyMatters, desurveyHole } from "../src/lib/desurvey.js";

const collars = [{ hole_id: "A", x: 0, y: 0, z: 100, length: 60, dip: -90, azimuth: 0 }, { hole_id: "B", x: 50, y: 0, z: 100, length: 80, dip: -60, azimuth: 90 }];
const S = (hole_id, depth, dip, azimuth) => ({ hole_id, depth, dip, azimuth });

test("one attitude per hole (one station, or several the same; a vertical one whatever its azimuth): the method does not matter", () => {
  assert.equal(desurveyMatters(collars, []), false);
  assert.equal(desurveyMatters(collars, [S("A", 0, -90, 0), S("B", 0, -60, 90)]), false);
  assert.equal(desurveyMatters(collars, [S("A", 0, -90, 0), S("A", 30, -90, 270), S("B", 0, -60, 90), S("B", 40, -60, 90)]), false);
  assert.equal(desurveyMatters(collars, [S("Z", 0, -90, 0), S("Z", 30, -60, 10)]), false, "a survey of a hole with no collar draws nothing");
});

test("two attitudes in one hole: it matters (and NaN is counted as a change, to be safe)", () => {
  assert.equal(desurveyMatters(collars, [S("B", 0, -60, 90), S("B", 40, -62, 90)]), true);
  assert.equal(desurveyMatters(collars, [S("B", 0, -60, 90), S("B", 40, -60, 95)]), true);
  assert.equal(desurveyMatters(collars, [S("A", 0, -90, 0), S("A", 30, NaN, 0)]), true);
});

test("and indeed: with one attitude every method gives the same trace", () => {
  const sv = [S("B", 0, -60, 90), S("B", 40, -60, 90)];
  const traces = ["tangential", "balancedTangential", "radiusOfCurvature", "minimumCurvature"].map((m) => desurveyHole(collars[1], sv, m).map((p) => [p.x, p.y, p.z].map((v) => v.toFixed(6)).join()));
  const ends = traces.map((t) => t[t.length - 1]);
  assert.ok(ends.every((e) => e === ends[0]), ends.join(" | "));
});

test("wiring: the build's dependency, the notice", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const desurveyBites = useMemo\(\(\) => desurveyMatters\(collars, survey\), \[collars, survey\]\);/);
  assert.match(v, /\}, \[collars, survey, desurveyBites \? desurveyMethod : "" \/\* #135/);
  assert.match(v, /if \(desurveySeenRef\.current !== desurveyMethod && survey\.length && !desurveyBites\) setNotices\(\(p\) => replaceNotices\(p, "desurveySame", /, "one notice, replaced on each switch");
});
