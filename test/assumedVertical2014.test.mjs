// TASKS.csv #2014 (review #2013, Woodjam) — a collar with no survey rows and no azimuth / dip is drawn as an ASSUMED vertical hole
// (it used to have no trace at all: 534 of 544 district collars imported, counted and never drawn), flagged everywhere it shows.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { desurveyHole, desurveyStations, surveyAzimuthDipAt, holeAttitudeAssumed } from "../src/lib/desurvey.js";
import { runDataQC } from "../src/lib/dataQC.js";
import { viewerSource } from "./helpers/viewerSource.mjs"; // #2176 — the drillhole build moved out of ViewerModule
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const bare = { hole_id: "TK10-23", x: 612000, y: 5788000, z: 967, length: 360 };

test("a collar with neither survey nor azimuth / dip is traced straight down for its length", () => {
  const t = desurveyHole(bare, [], "minimumCurvature");
  assert.ok(t.length >= 2);
  assert.deepEqual([t[0].md, t[0].x, t[0].y, t[0].z], [0, 612000, 5788000, 967]);
  const end = t[t.length - 1];
  assert.equal(end.md, 360);
  assert.ok(Math.abs(end.x - 612000) < 1e-6 && Math.abs(end.y - 5788000) < 1e-6, "vertical: no horizontal drift");
  assert.ok(Math.abs(end.z - (967 - 360)) < 1e-6);
  assert.deepEqual(desurveyStations(bare, [], "tangential").map((p) => [p.md, p.z]), [[0, 967], [360, 607]]);
  assert.equal(desurveyHole({ ...bare, length: null }, [])[desurveyHole({ ...bare, length: null }, []).length - 1].md, 300); // the old 300 m rule, as before
});

test("holeAttitudeAssumed: only when both the survey and the collar attitude are missing", () => {
  assert.equal(holeAttitudeAssumed(bare, []), true);
  assert.equal(holeAttitudeAssumed({ ...bare, azimuth: 0 }, []), true); // half an attitude is none
  assert.equal(holeAttitudeAssumed({ ...bare, azimuth: 45, dip: 60 }, []), false);
  assert.equal(holeAttitudeAssumed(bare, [{ depth: 0, azimuth: 45, dip: 60 }]), false);
});

test("the attitude itself stays unknown: no structural maths from the guess", () => {
  assert.equal(surveyAzimuthDipAt(bare, [], 100), null);
  const r = surveyAzimuthDipAt({ ...bare, azimuth: 45, dip: 60 }, [], 100);
  assert.ok(r && Math.abs(r.dip - 60) < 1e-9);
});

test("Data QC rates it a warning about an assumption, and still warns about the 300 m length", () => {
  const collars = [bare, { ...bare, hole_id: "NL", length: null }];
  const { issues, summary } = runDataQC({ project: { epsg: 26910, name: "t" }, collars, survey: [], layers: {}, boundaries: [], assays: [] });
  const has = (sev, id, re) => issues.some((i) => i.severity === sev && i.holeId === id && re.test(i.message));
  assert.ok(has("warning", "TK10-23", /ASSUMED vertical hole/));
  assert.ok(!has("error", "TK10-23", /./), "no error for a drawn hole");
  assert.ok(has("warning", "NL", /ASSUMED 300 m/));
  assert.equal(issues.filter((i) => i.category === "Survey" && i.severity === "error").length, 0);
  assert.ok(summary.warning >= 3);
});

test("the 3D view draws it dashed with a tip that says so, and the collar import notice counts them", () => {
  const v = viewerSource();
  assert.match(v, /const assumedVertical = holeAttitudeAssumed\(c, hs\);/);
  assert.match(v, /drawn as an ASSUMED vertical hole"\)\}` : ""\}`, collar: c \}/);
  // #2176 — merged trace chunks: an assumed-vertical hole goes in the dashed chunk (lib/viewer/traceBatch.js)
  assert.match(v, /traceHoles\.push\(\{ holeId: c\.hole_id, pts, dashed: assumedVertical \}\);/);
  assert.match(read("src/lib/viewer/traceBatch.js"), /new THREE\.LineDashedMaterial\(\{ vertexColors: true, dashSize: 4, gapSize: 4, transparent: true \}\)/);
  const p = read("src/modules/viewer/useImportPipeline.js");
  assert.match(p, /const assumedVertical = applied\.filter\(\(c\) => !surveyedHoles\.has\(c\.hole_id\) && holeAttitudeAssumed\(c, \[\]\)\);/);
  assert.match(p, /drawn as ASSUMED vertical holes \(a collar marker and a dashed stick of the hole length\), flagged in Data QC/);
  assert.match(p, /if \(!surveyedHoles\.size && assumedVertical\.length < applied\.length\) parts\.push\(tr\("no survey loaded/); // #1504's line only for holes that do have an attitude
});
