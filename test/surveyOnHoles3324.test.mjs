// TASKS.csv #3324 — a point survey (a 3D IP cloud) sampled along the holes: the nearest point within a distance, or an inverse-distance mean
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sampleSurveyOnHoles, suggestHoleSampling, pointIndex3d } from "../src/lib/surveyOnHoles.js";
import { logVsModel } from "../src/lib/downholeLogs.js";

// a 25 m cloud from 0 to 500 m elevation, 0..200 m in x and y; value = elevation / 10 (so each level has its own value)
const cloud = [];
for (let x = 0; x <= 200; x += 25) for (let y = 0; y <= 200; y += 25) for (let z = 0; z <= 500; z += 25) cloud.push({ x, y, z, value: z / 10 });
const collars = [{ hole_id: "V1", x: 100, y: 100, z: 510, max_depth: 400, azimuth: 0, dip: 90 }, { hole_id: "FAR", x: 5000, y: 5000, z: 500, max_depth: 100, azimuth: 0, dip: 90 }];

test("#3324 the proposals come from the cloud's own 3D spacing", () => {
  const s = suggestHoleSampling(cloud);
  assert.ok(Math.abs(s.spacing - 25) < 1e-9); assert.equal(s.maxDist, 50); assert.equal(s.step, 10);
  assert.equal(suggestHoleSampling(cloud.slice(0, 5)), null);
  const near = pointIndex3d(cloud, 30);
  assert.equal(near(100, 100, 250, 1).length, 1); assert.equal(near(100, 100, 260, 20).length, 2); // 250 and 275 assert.equal(near(112.5, 112.5, 262.5, 30).length, 8);
});

test("#3324 nearest: each step takes the nearest point's value; one point's steps are one interval; a hole away from the cloud has no rows", () => {
  const { rows, holes } = sampleSurveyOnHoles({ points: cloud, collars, survey: [], desurveyMethod: "tangential", step: 5, maxDist: 20 });
  assert.equal(holes, 1);
  assert.ok(rows.every((r) => r.hole_id === "V1" && r.numeric && r.modelled));
  // depth 100 -> elevation 410 -> the point at 400 (value 40); depth 0-5 -> elevation 507.5 -> the point at 500 (value 50)
  const at = (d) => rows.find((r) => r.from <= d && r.to > d);
  assert.equal(at(100).value, 40); assert.equal(at(2).value, 50);
  assert.equal(at(100).from, 95); assert.equal(at(100).to, 120); // elevation 415 .. 390: nearest 400 throughout (midpoints 412.5 .. 392.5)
  for (let k = 1; k < rows.length; k++) assert.ok(rows[k].from >= rows[k - 1].to - 1e-9);
  // below the cloud's base (elevation 0) by more than 20 m: no rows
  assert.ok(!rows.some((r) => r.to > 530));
});

test("#3324 idw: the inverse-distance mean of the points within the distance; an exact hit is that point", () => {
  const { rows } = sampleSurveyOnHoles({ points: cloud, collars, survey: [], desurveyMethod: "tangential", step: 10, maxDist: 30, mode: "idw" });
  const at = (d) => rows.find((r) => r.from <= d && r.to > d);
  const v = at(115).value; assert.ok(v > 39.8 && v < 40, String(v)); // midpoint 115 m -> elevation 395: 400 at 5 m dominates, 375 at 20 m and four at 400 25.5 m off
  // a step whose midpoint is the exact point
  const ex = sampleSurveyOnHoles({ points: cloud, collars: [{ ...collars[0], z: 505 }], survey: [], desurveyMethod: "tangential", step: 10, maxDist: 30, mode: "idw" }).rows;
  assert.equal(ex.find((r) => r.from === 0).value, 50); // midpoint 5 m -> elevation 500, on the point
});

test("#3324 Downhole logs compares a log with the sampled survey like a block model on the holes", () => {
  const { rows } = sampleSurveyOnHoles({ points: cloud, collars, survey: [], desurveyMethod: "tangential", step: 5, maxDist: 20 });
  const log = Array.from({ length: 40 }, (_, k) => ({ hole_id: "V1", from: k * 10, to: k * 10 + 10, values: { py: (510 - (k * 10 + 5)) / 100 } }));
  const r = logVsModel(log, "py", rows);
  assert.ok(r.n >= 30); assert.ok(r.r > 0.95, `Spearman ${r.r}`);
});

test("#3324 the pane offers it for a 3D cloud and writes an 'On holes' layer", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /import \{ sampleSurveyOnHoles, suggestHoleSampling \} from "\.\.\/lib\/surveyOnHoles\.js";/); // the Geophysics tab is lazy already
  assert.match(g, /const name = uniqueName\(`On holes: \$\{key\}`/);
  assert.match(g, /const holeSuggest = useMemo\(\(\) => \(holeShape\?\.is3D \? suggestHoleSampling\(legendRows\) : null\)/);
  assert.match(g, /onClick=\{\(\) => sampleSurveyAlongHoles\(legendKey\)\}/);
  assert.match(g, /sampleSurveyOnHoles\(\{ points: pts, collars, survey, desurveyMethod, step, maxDist, mode \}\)/);
});

test("#3324 a cloud on sections 200 m apart (5 m stations): the search distance reaches the nearer section", () => {
  const pts = [];
  for (let l = 0; l < 8; l++) for (let k = 0; k < 8; k++) for (let i = 0; i <= 300; i++) pts.push({ x: l * 200, y: i * 5, z: 600 - k * 50, value: k });
  const s = suggestHoleSampling(pts);
  assert.ok(Math.abs(s.sectionSpacing - 200) < 1e-6); assert.equal(s.maxDist, 150); assert.equal(s.step, 2);
  const { rows, holes } = sampleSurveyOnHoles({ points: pts, collars: [{ hole_id: "MID", x: 700, y: 700, z: 620, max_depth: 400, azimuth: 0, dip: 90 }], survey: [], desurveyMethod: "tangential", step: s.step, maxDist: s.maxDist });
  assert.equal(holes, 1); assert.ok(rows.length > 0);
});
