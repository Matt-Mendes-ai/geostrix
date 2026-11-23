// TASKS.csv #4028 — a geoML run lands in a Result (nothing in the project until a button adds it); re-running replaces it; Undo takes out exactly what an add put in; a project change drops it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { newResult, setResult, getResult, clearResult, stampResult, addGroup, undoGroup, subscribeResult } from "../src/lib/geomlResult.js";

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sk = (name) => ({ name, positions: new Float64Array(9), indices: new Uint32Array(3), type: "unit_body" });
const vx = (name) => ({ name, cells: [], source: "geoml" });
// the project, as the Add buttons see it
const project = () => {
  const surfaces = [], voxels = []; let n = 0;
  return { surfaces, voxels, fns: { addSurface: (s) => { surfaces.push({ id: "s" + ++n, ...s }); return "s" + n; }, addVoxelModel: (v) => { voxels.push({ id: "v" + ++n, ...v }); return "v" + n; },
    removeSurface: (id) => { const i = surfaces.findIndex((s) => s.id === id); if (i >= 0) surfaces.splice(i, 1); }, removeVoxelModel: (id) => { const i = voxels.findIndex((v) => v.id === id); if (i >= 0) voxels.splice(i, 1); } } };
};
const unitResult = (label = "DACT (stationary, fast)") => {
  const R = newResult(label, "domain");
  R.surface("bodies", sk("geoML — DACT body")); R.voxel("blocks", vx("geoML — P(DACT)")); R.voxel("blocks", vx("geoML — uncertainty (DACT)"));
  R.line("closed body of DACT: 448,000,000 m³ at 50% (30 m blocks)"); R.line("90 of 90 intercepts inside it");
  return R.done();
};

test("#4028 a run's result waits: setting it puts nothing in the project, and the groups say what each button would add", () => {
  clearResult();
  const p = project(), seen = [];
  const off = subscribeResult(() => seen.push(getResult()?.label ?? null));
  setResult(unitResult());
  assert.equal(p.surfaces.length + p.voxels.length, 0, "nothing is added by the run");
  const r = getResult();
  assert.deepEqual(r.groups.map((g) => [g.key, g.kind, g.surfaces.length, g.voxels.length, g.count]), [["bodies", "bodies", 1, 0, 1], ["blocks", "blocks", 0, 2, 2]]);
  assert.deepEqual(r.lines, ["closed body of DACT: 448,000,000 m³ at 50% (30 m blocks)", "90 of 90 intercepts inside it"]);
  assert.deepEqual(seen, ["DACT (stationary, fast)"], "subscribers hear of the result once");
  off(); clearResult();
});

test("#4028 an Add button adds exactly its group once; the other group stays out; a second click does nothing", () => {
  clearResult(); const p = project();
  setResult(unitResult());
  const ids = addGroup("bodies", p.fns);
  assert.deepEqual(ids, { surfaceIds: ["s1"], voxelIds: [] }); assert.equal(p.surfaces.length, 1); assert.equal(p.voxels.length, 0);
  assert.equal(addGroup("bodies", p.fns), null, "added once"); assert.equal(p.surfaces.length, 1);
  const blocks = addGroup("blocks", p.fns);
  assert.equal(blocks.voxelIds.length, 2); assert.equal(p.voxels.length, 2);
  assert.deepEqual(Object.keys(getResult().added).sort(), ["blocks", "bodies"]);
  assert.equal(addGroup("nope", p.fns), null);
  clearResult();
});

test("#4028 Undo takes out exactly what that add put in, in one step, and the group can be added again", () => {
  clearResult(); const p = project();
  setResult(unitResult());
  addGroup("blocks", p.fns); addGroup("bodies", p.fns);
  assert.equal(p.voxels.length, 2); assert.equal(p.surfaces.length, 1);
  assert.equal(undoGroup("blocks", p.fns), true);
  assert.equal(p.voxels.length, 0, "both block models out in one step"); assert.equal(p.surfaces.length, 1, "the body stays");
  assert.equal(undoGroup("blocks", p.fns), false, "nothing to undo twice");
  assert.equal(getResult().added.blocks, undefined);
  assert.ok(addGroup("blocks", p.fns), "added again"); assert.equal(p.voxels.length, 2);
  clearResult();
});

test("#4028 a new run replaces the pending result (what was added stays in the project); the X drops it", () => {
  clearResult(); const p = project();
  setResult(unitResult("first"));
  addGroup("bodies", p.fns);
  const R = newResult("second", "grade"); R.surface("shells", sk("shell A")); R.surface("shells", sk("shell B")); R.voxel("blocks", vx("Cu"));
  setResult(R.done());
  assert.equal(getResult().label, "second"); assert.equal(getResult().added.bodies, undefined, "the new result has nothing added");
  assert.equal(p.surfaces.length, 1, "the first run's added body is the project's now");
  addGroup("shells", p.fns);
  assert.equal(p.surfaces.length, 3, "both shells in one click");
  clearResult(); assert.equal(getResult(), null);
});

test("#4028 a result belongs to its project: stamped with the project counter when it appears, never re-stamped", () => {
  clearResult(); setResult(unitResult());
  assert.equal(getResult().seq, null);
  stampResult(7); assert.equal(getResult().seq, 7);
  stampResult(9); assert.equal(getResult().seq, 7, "the counter it landed with stays");
  clearResult(); stampResult(3); assert.equal(getResult(), null, "no result: nothing to stamp");
});

test("#4028 the wiring: the panel builds a result instead of adding, the viewer mounts the block beside the other Result block and drops a result with its project, the words are the other tools'", () => {
  const p = read("src/components/PredictivePanel.jsx");
  assert.doesNotMatch(p, /\baddSurface\(/); assert.doesNotMatch(p, /\baddVoxelModel\(/);
  assert.match(p, /R\.surface\("contact", \{/); assert.match(p, /R\.surface\("bodies", \{/); assert.match(p, /R\.surface\("shells", \{/);
  assert.equal((p.match(/R\.voxel\("blocks", \{/g) || []).length, 4, "the probability and uncertainty blocks, the grade and its spread");
  assert.equal((p.match(/setResult\(R\.done\(\)\)/g) || []).length, 2, "a unit run and a grade run each leave a result");
  assert.match(p, /\$\{tr\("Nothing is added yet: use the Result block\."\)\}/);
  const v = read("src/modules/ViewerModule.jsx");
  assert.match(v, /<GeomlResultBlock addSurface=\{addWorldMeshSurface\} addVoxelModel=\{addVoxelModel\} removeSurface=\{removeImplicitSurface\} removeVoxelModel=\{removeVoxelModel\} sticky=\{!\(lastLithBlock \|\| surfaceSolidsOpen\)\} pBtn=\{pBtn\} \/>/);
  assert.match(v, /useGeomlResultScope\(viewerUiStateSeq\);/);
  const h = read("src/modules/viewer/useGeomlResultScope.js");
  assert.match(h, /if \(res\.seq == null\) stampResult\(viewerUiStateSeq\);\n\s+else if \(res\.seq !== viewerUiStateSeq\) clearResult\(\);/);
  const b = read("src/components/GeomlResultBlock.jsx");
  assert.match(b, /tr\("Add unit volumes \(closed\)"\)/); assert.match(b, /tr\("Add as block model"\)/); assert.match(b, /data-result-block=""/);
  for (const lang of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(read(`src/locales/${lang}.json`)); for (const k of ["Added", "Add grade shells (closed)", "Add the contact surface", "Nothing is added yet: use the Result block."]) assert.ok(d[k], `${lang}: ${k}`); }
});
