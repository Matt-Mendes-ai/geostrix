// TASKS.csv #3589 (Fireweed rehearsal, Macpass Tom West) — the estimate's default 'Only blocks below the ground' used the collar surface through
// the adit's underground collars (UDDH) and dropped drilled blocks as 'above the ground' (1,477 at the rehearsal; 195 blocks holding a Zn
// composite in Node at the dialog's defaults). #3551 leaves underground collars out of the collar surface; the dialog now builds that ground
// with the survey (ViewerModule estGround), its note reads the survey, and the cut raises the collar surface over the samples as the grade
// shell does (#3580), so a block holding a composite is never dropped.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTableText } from "../src/lib/tabular.js";
import { compositeDownhole } from "../src/lib/geochem.js";
import { excludeQAQC } from "../src/lib/qaqc.js";
import { samplePointsFromIntervals } from "../src/lib/estimation.js";
import { desurveyHole } from "../src/lib/desurvey.js";
import { collarGround, idwGround, collarBenches } from "../src/lib/collarGround.js";
import { collarLevelsText } from "../src/lib/collarLevelsText.js";
import { groundNotBelowSamples } from "../src/lib/groundNotBelowSamples.js";

test("Macpass Tom West, Zn: composites above the collar ground, as on 759cee7e and now; the raise keeps every one", () => {
  const read = (f) => parseTableText(readFileSync(new URL(`../sample_data/yk_macpass/${f}.csv`, import.meta.url), "utf8")).rows;
  const all = read("collars");
  const collars = all.map((r) => ({ hole_id: r.hole_id, x: +r.x, y: +r.y, z: +r.z, length: +r.length, attrs: { hole_type: r.hole_type, prospect: r.prospect } }));
  const survey = read("survey").map((r) => ({ hole_id: r.hole_id, depth: +r.depth, azimuth: +r.azimuth, dip: -r.dip }));
  const tw = new Set(collars.filter((c) => c.attrs.prospect === "Tom West").map((c) => c.hole_id));
  assert.equal(tw.size, 143);
  const assays = read("assays").filter((r) => tw.has(r.hole_id) && String(r.Zn_pct ?? "").trim() !== "" && Number.isFinite(+r.Zn_pct)).map((r) => ({ hole_id: r.hole_id, from: +r.from, to: +r.to, values: { Zn: +r.Zn_pct } }));
  const { points } = samplePointsFromIntervals(compositeDownhole(excludeQAQC(assays), "Zn", "%", { Zn: "%" }, { length: 2, minCoverage: 0.5 }), collars, survey, desurveyHole, "minimumCurvature");
  const above = (g) => points.filter((p) => { const z = g(p.x, p.y); return Number.isFinite(z) && p.z > z; }).length;
  const old = idwGround(collarBenches(collars).kept); // 759cee7e: every collar, the bench check
  const now = collarGround(collars, survey);
  const wasAbove = above(old);
  assert.equal(points.length, 2509);
  assert.equal(wasAbove, 650, "composites above the collar ground as on 759cee7e");
  assert.equal(above(now), 0, "none above the ground without the adit's collars (#3551)");
  assert.equal(above(groundNotBelowSamples(old, points, { reachM: 10, marginM: 10 }).at), 0, "and with the old ground raised over the samples, none either");
  // the note: the 53 UDDH collars named as underground, not as benches
  const note = collarLevelsText(collars.filter((c) => tw.has(c.hole_id)), survey);
  assert.match(note, /^53 collar\(s\) look like underground drilling: 53 by their hole type/);
  assert.doesNotMatch(note.split("They are left out")[1] || "", /TU0/, "no underground collar among those left out as benches");
});

test("wiring: the dialog's ground with the survey; the cut and the members' trim raised over the samples; the note reads the survey", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /terrain \? \(x, y\) => terrainGroundAt\(terrain, x, y\) : collarGround\(collars, survey\)\), \[gradeEstOpen, terrain, collars, survey\]\);/);
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const cutGround = groundAt && cutAtGround \? \(groundSource === "collars" \? \(await import\("\.\.\/lib\/groundNotBelowSamples\.js"\)\)\.groundNotBelowSamples\(groundAt, points, \{ reachM: cellReal, marginM: cellReal \}\)\.at : groundAt\) : null;/);
  assert.match(m, /est\.cells = est\.cells\.filter\(\(c\) => \{ const g = cutGround\(c\.x, c\.y\);/);
  assert.match(m, /trimLike\(me\.cells, \{ inShell, inArea, groundAt: cutGround \}\)/);
  assert.match(m, /<CollarLevelsNote collars=\{levelCollars\} survey=\{survey\}/);
  const n = readFileSync(new URL("../src/components/CollarLevelsNote.jsx", import.meta.url), "utf8");
  assert.match(n, /collarLevelsText\(collars, survey\), \[collars, survey\]/);
});
