// TASKS.csv #3796 (Scottie Gold review) — a narrow vein: a stope is as wide as the model's cell; nothing diluted an intercept to a mining width. Synthetic hole and vein.
import test from "node:test";
import assert from "node:assert/strict";
import { diluteIntercepts, modelSearchPlane } from "../src/lib/miningWidthIntercepts.js";

// a hole drilled due east at 60° down (dip -60) crossing a vein dipping 80° towards 270 (west)
const trace = (az, incl, len) => { const pts = []; const a = (az * Math.PI) / 180, i = (incl * Math.PI) / 180; for (let md = 0; md <= len; md += 1) pts.push({ md, x: md * Math.sin(i) * Math.sin(a), y: md * Math.sin(i) * Math.cos(a), z: -md * Math.cos(i) }); return pts; };
const traces = new Map([["A", trace(90, 60, 200)], ["B", trace(90, 60, 200)]]);

test("a 2 m true-width intercept is diluted to the 3 m minimum mining width; a wider one is not", () => {
  const comps = [{ hole_id: "A", from: 100, to: 102.2, length: 2.2, avgGrade: 9 }, { hole_id: "B", from: 50, to: 59, length: 9, avgGrade: 4 }];
  const r = diluteIntercepts(comps, traces, { dipDeg: 80, dipDirDeg: 270, minWidth: 3 });
  const a = r.find((x) => x.hole_id === "A"), b = r.find((x) => x.hole_id === "B");
  assert.ok(a.trueWidthM > 0 && a.trueWidthM < a.downholeM, `true ${a.trueWidthM} < downhole ${a.downholeM}`);
  assert.ok(a.trueWidthM < 3 && a.diluted && a.widthM === 3);
  assert.ok(Math.abs(a.dilutedGrade - (9 * a.trueWidthM) / 3) < 1e-9, "grade x true width / minimum width");
  assert.equal(b.diluted, false, "wider than the minimum: its own grade");
  assert.ok(Math.abs(b.dilutedGrade - 4) < 1e-9 && b.widthM === b.trueWidthM);
  assert.ok(a.gramMetres < b.gramMetres ? r[0] === b : r[0] === a, "best metal first");
});

test("no dip typed or no survey: the downhole length is the width and the true width is null, not a silent number", () => {
  const comps = [{ hole_id: "A", from: 10, to: 12, length: 2, avgGrade: 6 }, { hole_id: "Z", from: 0, to: 2, length: 2, avgGrade: 6 }];
  const noDip = diluteIntercepts(comps, traces, { minWidth: 4 });
  assert.equal(noDip[0].trueWidthM, null);
  assert.equal(noDip[0].widthM, 4); assert.equal(noDip[0].dilutedGrade, 3);
  const noHole = diluteIntercepts(comps, traces, { dipDeg: 80, dipDirDeg: 270, minWidth: 4 }).find((x) => x.hole_id === "Z");
  assert.equal(noHole.trueWidthM, null, "no trace for the hole");
  assert.deepEqual(diluteIntercepts([{ hole_id: "A", from: 0, to: 0, length: 0, avgGrade: 5 }], traces, {}), []);
});

test("the plane a model's estimate searched along", () => {
  assert.deepEqual(modelSearchPlane({ searchTrend: { dip: 82.4, dipAzimuth: 85.6 } }), { dipDeg: 82, dipDirDeg: 86 });
  assert.deepEqual(modelSearchPlane({ searchTrend: { name: "Plane of Au >= 3 (82° → 86°)" } }), { dipDeg: 82, dipDirDeg: 86 });
  assert.equal(modelSearchPlane({}), null);
});
