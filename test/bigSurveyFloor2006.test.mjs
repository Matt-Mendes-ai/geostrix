// TASKS.csv #2006 — Osborne's 24,927 readings drawn as spheres with the usual 5 px floor hid the 50 m grid under them at Fit: a survey of more than 5,000 points keeps a part of
// the floor (so its readings stay separate marks and what is under them shows), a smaller survey keeps all of it; a zoom resizes both without a rebuild. Synthetic points.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { syncGeophysPts, resizeSurveyPts, surveyFloorScale, BIG_SURVEY_N, BIG_SURVEY_FLOOR } from "../src/lib/viewer/geophysPts.js";

const proto = new THREE.SphereGeometry(1, 8, 6);
const style = { color: null, opacity: 1, size: 1, shape: "sphere" };
const origin = { x: 500000, y: 7700000, z: 0 };
const cloud = (n, src) => Array.from({ length: n }, (_, i) => ({ x: 500000 + (i % 200) * 40, y: 7700000 + Math.floor(i / 200) * 40, z: 300, value: (i % 50) * 10, _src: src }));
const opts = (minR) => ({ opts: {}, surveys: null, style, proto, minR, origin, tipOf: () => "" });
const floorOf = (g, key) => g.children.find((c) => c.userData.geophysSurvey === key).userData.compact.floor.u.value;

test("#2006 the floor's share by size: a big survey keeps 40 %, a small one all of it", () => {
  assert.equal(surveyFloorScale(BIG_SURVEY_N), 1);
  assert.equal(surveyFloorScale(BIG_SURVEY_N + 1), BIG_SURVEY_FLOOR);
  assert.equal(surveyFloorScale(24927), 0.4);
  assert.equal(surveyFloorScale(10), 1);
});

test("#2006 the drawn floor follows it, at the build and after a zoom, per survey", () => {
  const g = new THREE.Group(), rows = [...cloud(6000, "Big.csv"), ...cloud(300, "Small.csv")];
  syncGeophysPts(g, rows, opts(10));
  assert.equal(floorOf(g, "Big.csv"), 4);
  assert.equal(floorOf(g, "Small.csv"), 10);
  assert.equal(resizeSurveyPts(g, 20), true); // a zoom: no rebuild
  assert.equal(floorOf(g, "Big.csv"), 8);
  assert.equal(floorOf(g, "Small.csv"), 20);
  // the same sync at the new zoom keeps the batches (no rebuild)
  const r = syncGeophysPts(g, rows, opts(20)); // the same rows (a new array of them would match too)
  assert.deepEqual(r.rebuilt, []);
  assert.equal(floorOf(g, "Big.csv"), 8);
});
