// TASKS.csv #493 — GeoStrix's minimum-curvature desurvey against an INDEPENDENT reference: 20 real GSWA drillholes (the
// most curved surveyed from the collar) desurveyed by another program (baselode's precomputed file). Data: CC BY 4.0,
// © State of Western Australia (Department of Mines, Petroleum and Exploration) 2025 — see the fixture's credit fields.
// On the whole sample (1,519 holes, 152,241 stations) the two agree to ~1e-9 m wherever the survey starts at the collar;
// the 95 holes that differ all start their survey below the collar (wedges): GeoStrix carries the first survey up to
// the collar, the other program puts the first station AT the collar.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { desurveyStations, desurveyHole, pointOnTrace } from "../src/lib/desurvey.js";

const fx = JSON.parse(fs.readFileSync(new URL("./fixtures/gswa_desurvey_reference.json", import.meta.url), "utf8"));

test("#493 minimum curvature matches the independent GSWA reference to the millimetre at every station", () => {
  assert.equal(fx.holes.length, 20);
  let worst = 0, n = 0;
  for (const h of fx.holes) {
    const survey = h.survey.map(([depth, azimuth, dip]) => ({ depth, azimuth, dip: -dip })); // GeoStrix: dip positive down
    const st = desurveyStations({ x: 0, y: 0, z: h.elevation }, survey, "minimumCurvature");
    const o = st[0];
    for (const [md, x, y, z] of h.reference) {
      const q = st.find((p) => Math.abs(p.md - md) < 1e-6);
      assert.ok(q, `${h.hole}: no station at ${md} m`);
      worst = Math.max(worst, Math.hypot(q.x - o.x - x, q.y - o.y - y, q.z - o.z - z));
      n++;
    }
  }
  assert.ok(n > 900);
  assert.ok(worst < 1e-3, `worst ${worst} m`); // the fixture keeps 0.1 mm; the full sample agreed to ~1e-9 m
});

test("#493 the dense trace the app draws lands on the same stations", () => {
  const h = fx.holes[0];
  const survey = h.survey.map(([depth, azimuth, dip]) => ({ depth, azimuth, dip: -dip }));
  const tr = desurveyHole({ x: 0, y: 0, z: h.elevation }, survey, "minimumCurvature");
  for (const [md, x, y, z] of h.reference) {
    const p = pointOnTrace(tr, md);
    assert.ok(Math.hypot(p.x - x, p.y - y, p.z - h.elevation - z) < 1e-3, `${md} m`);
  }
});
