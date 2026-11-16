// TASKS.csv #3593 (Fireweed rehearsal, Macpass Tom West) — a trend from the grades: the samples of an element at or above a cut-off give the
// plane (the pole is their smallest spread), the pitch of their largest spread and the ratios of their spreads (lib/samplesTrend.js); 'Set the
// plane from' offers them; the Grade shell pane and the Estimation dialog say 'isotropic' while no trend is chosen.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { samplesTrend, samplesTrendByArea } from "../src/lib/samplesTrend.js";
import { trendBasis } from "../src/lib/trend.js";
import { parseTableText } from "../src/lib/tabular.js";
import { compositeDownhole } from "../src/lib/geochem.js";
import { excludeQAQC } from "../src/lib/qaqc.js";
import { samplePointsFromIntervals } from "../src/lib/estimation.js";
import { desurveyHole } from "../src/lib/desurvey.js";

test("samplesTrend: a synthetic slab dipping 60 -> 120, long axis at pitch 30, comes back as itself; a line of samples gives none", () => {
  const B = trendBasis({ dip: 60, dipAzimuth: 120, pitch: 30 });
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
  const pts = Array.from({ length: 3000 }, () => { const a = r() * 400, b = r() * 150, c = r() * 20; return { x: a * B.major.x + b * B.semiMajor.x + c * B.minor.x, y: a * B.major.y + b * B.semiMajor.y + c * B.minor.y, z: a * B.major.z + b * B.semiMajor.z + c * B.minor.z }; });
  const t = samplesTrend(pts);
  assert.ok(Math.abs(t.dip - 60) < 0.5 && Math.abs(t.dipAzimuth - 120) < 0.5 && Math.abs(t.pitch - 30) <= 1, JSON.stringify(t));
  assert.ok(t.ratios.max > t.ratios.int && t.ratios.int > t.ratios.min);
  assert.equal(samplesTrend(Array.from({ length: 50 }, (_, k) => ({ x: k, y: 2 * k, z: -k }))), null, "along one line");
  assert.equal(samplesTrend([{ x: 0, y: 0, z: 0 }]), null);
});

test("Macpass Tom West: the Zn composites at or above 2 % and 5 % (Review's hand values: 66.1 -> 239.2, 68.5 -> 240.0; spreads 232 x 107 x 39 m)", () => {
  const read = (f) => parseTableText(readFileSync(new URL(`../sample_data/yk_macpass/${f}.csv`, import.meta.url), "utf8")).rows;
  const collars = read("collars").map((r) => ({ hole_id: r.hole_id, x: +r.x, y: +r.y, z: +r.z, length: +r.length, prospect: r.prospect }));
  const survey = read("survey").map((r) => ({ hole_id: r.hole_id, depth: +r.depth, azimuth: +r.azimuth, dip: -r.dip }));
  const tw = new Set(collars.filter((c) => c.prospect === "Tom West").map((c) => c.hole_id));
  const assays = read("assays").filter((r) => tw.has(r.hole_id) && String(r.Zn_pct ?? "").trim() !== "" && Number.isFinite(+r.Zn_pct)).map((r) => ({ hole_id: r.hole_id, from: +r.from, to: +r.to, values: { Zn: +r.Zn_pct } }));
  const { points } = samplePointsFromIntervals(compositeDownhole(excludeQAQC(assays), "Zn", "%", { Zn: "%" }, { length: 2, minCoverage: 0.5 }), collars, survey, desurveyHole, "minimumCurvature");
  const at = (cut) => samplesTrend(points.filter((p) => p.value >= cut));
  const t2 = at(2), t5 = at(5);
  assert.deepEqual([+t2.dip.toFixed(1), +t2.dipAzimuth.toFixed(1), t2.n, t2.spreads.map(Math.round)], [66.1, 239.2, 1478, [232, 107, 39]]);
  assert.deepEqual([+t5.dip.toFixed(1), +t5.dipAzimuth.toFixed(1)], [68.5, 240]);
  assert.deepEqual(t2.ratios, { max: 6, int: 2.8, min: 1 });
});

test("wiring: 'Set the plane from' offers an element's samples; the panes say 'isotropic' with no trend", () => {
  const p = readFileSync(new URL("../src/components/TrendsPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /<option key=\{el\} value=\{`samples:\$\{el\}`\}>/);
  assert.match(p, /const area = r\?\.pts\?\.length \? samplesTrendByArea\(r\.pts\) : null, st = area\?\.trend \|\| null;/);
  assert.match(p, /update\(t\.id, \{ dip: Math\.round\(st\.dip \* 10\) \/ 10, dipAzimuth: Math\.round\(st\.dipAzimuth \* 10\) \/ 10, pitch: st\.pitch, ratios: st\.ratios/);
  const m = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(m, /sampleElements=\{shellSymbols\} samplePoints=\{trendSamplePoints\}/);
  // #3655 — with no trend and no flat search the grade shell searches along its composites' plane unless unticked; unticked, it says 'isotropic'
  assert.match(m, /\{!trendFor\("gradeShell"\) && !\(Number\(numericFlatReach\) > 0\) && <>/);
  assert.match(m, /\{shellPlaneSearch \? tr\("The plane is fitted at each run[^"]*"\) : tr\("Isotropic: the search is a sphere, no structural trend is chosen for grade shells/);
  const e = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(e, /\{!modelTrend && !planeTrend \/\* #3679 \*\/ && !\(Number\(flatReach\) > 0\) && <div[^>]*>\{tr\("Isotropic: the search is a sphere, no structural trend is chosen for block estimation/);
});

test("samplesTrendByArea: two bodies 20 km apart give no plane; one body with most of the samples is fitted alone", () => {
  const a = []; for (let i = 0; i < 500; i++) a.push({ x: i, y: i * 0.5 + (i % 11) * 3, z: -i * 0.3 + (i % 7) });
  const b = a.map((p) => ({ ...p, x: p.x + 20000 }));
  const two = samplesTrendByArea([...a, ...b]);
  assert.deepEqual([two.groups, two.trend], [[500, 500], null]);
  const one = samplesTrendByArea([...a, ...b.slice(0, 50)]);
  assert.deepEqual([one.used, one.leftOut, !!one.trend], [500, 50, true]);
});
