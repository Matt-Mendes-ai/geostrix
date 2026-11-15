// TASKS.csv #3592 (Fireweed rehearsal, Macpass Tom West) — the estimate's opening search was 2.5 x the spacing between collar SITES (15 m: holes
// fanned from pads and underground stations), 40 m, and with Min holes 2 many blocks the holes pass through stayed empty. It now opens from the
// spacing at the samples (lib/sampleSpacing.js, as the grade shell's since #3580): 24 m -> 60 m.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTableText } from "../src/lib/tabular.js";
import { compositeDownhole } from "../src/lib/geochem.js";
import { excludeQAQC } from "../src/lib/qaqc.js";
import { samplePointsFromIntervals, estimateBlockModel } from "../src/lib/estimation.js";
import { desurveyHole } from "../src/lib/desurvey.js";
import { sampleSpacing } from "../src/lib/sampleSpacing.js";
import { holeSpacingSummary, searchFromSpacingM } from "../src/lib/holeSpacing.js";

test("Macpass Tom West, Zn: the search from the samples (60 m, not 40 m) fills more of the blocks the holes pass through", () => {
  const read = (f) => parseTableText(readFileSync(new URL(`../sample_data/yk_macpass/${f}.csv`, import.meta.url), "utf8")).rows;
  const collars = read("collars").map((r) => ({ hole_id: r.hole_id, x: +r.x, y: +r.y, z: +r.z, length: +r.length, prospect: r.prospect }));
  const survey = read("survey").map((r) => ({ hole_id: r.hole_id, depth: +r.depth, azimuth: +r.azimuth, dip: -r.dip }));
  const tw = new Set(collars.filter((c) => c.prospect === "Tom West").map((c) => c.hole_id));
  const assays = read("assays").filter((r) => tw.has(r.hole_id) && String(r.Zn_pct ?? "").trim() !== "" && Number.isFinite(+r.Zn_pct)).map((r) => ({ hole_id: r.hole_id, from: +r.from, to: +r.to, values: { Zn: +r.Zn_pct } }));
  const raw = samplePointsFromIntervals(assays.map((a) => ({ hole_id: a.hole_id, from: a.from, to: a.to, avgGrade: a.values.Zn })), collars, survey, desurveyHole, "minimumCurvature").points;
  const atSamples = sampleSpacing(raw), assayed = new Set(assays.map((a) => a.hole_id)), atSites = holeSpacingSummary(collars.filter((c) => assayed.has(c.hole_id)));
  assert.deepEqual([Math.round(atSamples.medianM), searchFromSpacingM(atSamples.medianM)], [24, 60], "at the samples");
  assert.deepEqual([Math.round(atSites.medianM), searchFromSpacingM(atSites.medianM)], [15, 40], "between collar sites (the old opening)");
  const { points } = samplePointsFromIntervals(compositeDownhole(excludeQAQC(assays), "Zn", "%", { Zn: "%" }, { length: 2, minCoverage: 0.5 }), collars, survey, desurveyHole, "minimumCurvature");
  const mm = (k) => [Math.min(...points.map((p) => p[k])), Math.max(...points.map((p) => p[k]))];
  const [x0, x1] = mm("x"), [y0, y1] = mm("y"), [z0, z1] = mm("z"), pad = 25;
  const bounds = { xmin: x0 - pad, xmax: x1 + pad, ymin: y0 - pad, ymax: y1 + pad, zmin: z0 - pad, zmax: z1 + pad };
  const key = (x, y, z) => `${Math.floor((x - bounds.xmin) / 10)},${Math.floor((y - bounds.ymin) / 10)},${Math.floor((z - bounds.zmin) / 10)}`;
  const drilled = new Map(); for (const p of points) { const k = key(p.x, p.y, p.z); (drilled.get(k) || drilled.set(k, new Set()).get(k)).add(p.hole_id); }
  const holes = new Set(points.map((p) => p.hole_id));
  const filled = (R) => {
    const est = estimateBlockModel(points, { bounds, cellSize: { dx: 10, dy: 10, dz: 10 }, method: "idw2", searchRadius: R, minSamples: 1, maxSamples: 16, minHoles: 2, maxBlocks: 5e6 });
    const got = new Set(est.cells.map((b) => key(b.x, b.y, b.z))), holesHit = new Set();
    let hit = 0; for (const [k, hs] of drilled) if (got.has(k)) { hit++; hs.forEach((h) => holesHit.add(h)); }
    return { drilled: drilled.size, hit, holesWithout: holes.size - holesHit.size, holes: holes.size };
  };
  const was = filled(40), now = filled(60);
  assert.deepEqual(was, PIN.was, "the old opening, 40 m");
  assert.deepEqual(now, PIN.now, "from the samples, 60 m");
});
const PIN = { was: { drilled: 732, hit: 468, holesWithout: 26, holes: 126 }, now: { drilled: 732, hit: 599, holesWithout: 11, holes: 126 } };

test("wiring: the dialog's opening search from the samples first, the collar sites as the fallback; the note says which", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const searchFrom = samplesSpacing\?\.medianM > 0 \? \{ medianM: samplesSpacing\.medianM, at: "samples" \} : spacing\?\.medianM > 0 \? \{ medianM: spacing\.medianM, at: "collars" \} : null;/);
  assert.match(m, /const searchFromSpacing = !\(saved && saved\.searchRadius !== undefined\) && searchFrom \? searchFromSpacingM\(searchFrom\.medianM\) : null;/);
  assert.match(m, /searchFrom\.at === "samples" \? tr\("Search radius \{r\} m: 2\.5 times the \{m\} m typical distance from a sample to the nearest sample of another hole/);
});
