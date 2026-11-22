// TASKS.csv #3953 (Matt's first-time test, data integrity) — every long job is a job of the project it started in, and lands (job.landing / landed)
// before it changes the project or the scene, with nothing awaited between its landing and its delivery. One check per job type, on its own code; the
// rule itself and the store's tab keys are tested with made-up projects in projectJobs3953.test.mjs and below.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { syncTabKeys } from "../src/lib/projectJobs.js";

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// in `src` from `from` on: the job starts (start), then lands (land), then delivers (deliver), with no `await` between the landing and the delivery
function landsBefore(name, src, { from = 0, start, land, deliver }) {
  const a = src.indexOf(start, from); assert.ok(a >= 0, `${name}: the job starts (${start})`);
  const d = src.indexOf(deliver, a); assert.ok(d > a, `${name}: its delivery (${deliver})`);
  const before = src.slice(a, d);
  const l = before.lastIndexOf(land); assert.ok(l >= 0, `${name}: a landing before its delivery`);
  const between = before.slice(l + land.length);
  assert.doesNotMatch(between, /\bawait\b/, `${name}: nothing awaited between its landing and its delivery`);
}

test("the grade shell (Matt's case): a job with the worker's cancel, landed before its notices and again before the shell is added", () => {
  const r = read("modules/viewer/modellingRuns.js"), at = r.indexOf("const runNumericModel = ");
  landsBefore("grade shell", r, { from: at, start: "const job = beginJob(taskLabel);", land: "if (!(await landed(job)))", deliver: "implicitGroupRef.current?.add(mesh);" });
  const body = r.slice(at, r.indexOf("  }; // anisotropy/domains/modelDomainId"));
  assert.match(body, /job\.cancel = \(\) => ac\.abort\(\); \/\/ TASKS\.csv #3953/);
  assert.match(body, /grids\.push\(g\);\n {8}\}\n {8}if \(!\(await landed\(job\)\)\)/, "landed right after the worker, before its notices");
  assert.match(body, /if \(!isProjectGone\(e\)\) setNotices\(\(p\) => \[\.\.\.p, e\?\.cancelled \? notice\("Numeric model cancelled\."\)/, "a closed project's stop is said once (by the store)");
  assert.match(body, /setNumericBusy\(false\);\n {6}job\.end\(\);/);
});

test("GemPy solves (implicit, stack, model from map, structures, the fitted model: one core), and the sensitivity spread", () => {
  const r = read("modules/viewer/modellingRuns.js"), at = r.indexOf("const runSurfaceStack = ");
  landsBefore("GemPy", r, { from: at, start: "const job = beginJob(label, () => abortController.abort(\"project-closed\"));", land: "if (!(await landed(job)))", deliver: "setImplicitSurfaces((p) => [...p, { id, name: spec.label" });
  landsBefore("sensitivity", r, { from: r.indexOf("job.cancel = () => ac.abort(\"project-closed\");"), start: "job.cancel = () => ac.abort(\"project-closed\");", land: "if (!(await landed(job))) return;", deliver: "setImplicitSurfaces((p) => [" });
  for (const fn of ["runFittedModel", "runImplicitModel", "runStackModel", "runMapModel", "runStructuralModel"]) {
    const b = r.slice(r.indexOf(`const ${fn} = `), r.indexOf("\n  const run", r.indexOf(`const ${fn} = `) + 20));
    assert.match(b, /runSurface(Stack|Model)\(/, `${fn} solves through the core`);
  }
});

test("alteration halos / unit bodies and veins", () => {
  const r = read("modules/viewer/modellingRuns.js");
  landsBefore("halo", r, { from: r.indexOf("const runAlterationModel = "), start: "const job = beginJob(label);", land: "if (!(await landed(job)))", deliver: "implicitGroupRef.current?.add(mesh);" });
  assert.match(r, /job\.cancel = \(\) => ac\.abort\(\); \/\/ TASKS\.csv #3953 — closing its project stops the worker\n {8}const grid = await runEstimation\("dense", gridPts/);
  landsBefore("vein", r, { from: r.indexOf("const runVeinModel = "), start: "const job = beginJob(label);", land: "if (!(await landed(job))) return;", deliver: "implicitGroupRef.current?.add(mesh);" });
});

test("the grade estimate: a job with its cancel, shown in its own project; its Add buttons add it there only", () => {
  const g = read("components/GradeEstimationModal.jsx");
  landsBefore("estimate", g, { start: "const job = startProjectJob ? startProjectJob({ label: `${symbol} estimate`, cancel: () => abortRef.current?.abort() })", land: "if (!(await landed(job)))", deliver: "setResult({ ...est, params" });
  assert.match(g, /resultProject\.current = \{ key: job\.key \};/);
  for (const fn of ["addSupportModel", "addKvModel", "addToProject"]) assert.match(g, new RegExp(`const ${fn} = \\(\\) => \\{\\n {4}if \\(!result \\|\\| !result\\.cells\\.length \\|\\| !resultIsHere\\(\\)\\) return;`), fn);
  assert.match(g, /isSameProject\?\.\(resultProject\.current\) !== false/);
});

test("the domain update", () => {
  const d = read("modules/viewer/domainUpdateRun.js");
  landsBefore("domain update", d, { start: "g = await runEstimation(", land: "if (job && !(await landed(job))) return null;", deliver: "implicitGroupRef.current?.add(out);" });
  assert.match(read("modules/viewer/DomainUpdateSection.jsx"), /runDomainUpdate\(ctx, \{ job, surfaceId: sid,[\s\S]*finally \{ setBusy\(false\); job\?\.end\(\); \}/);
});

test("inversions: the engine's job is the project's; its result (voxels, the DC/IP line, the panel's result) only after landing; closing cancels it in the engine", () => {
  const j = read("lib/inversionJobs.js");
  assert.match(j, /current\.projectJob = startJob\?\.\(\{ label: meta\?\.label \|\| "Inversion", cancel: \(\) => \{ if \(current === own && own\.status\?\.state === "running"\) sidecarCancelJob\(own\.id\); \} \}\)/);
  landsBefore("inversion", j, { start: "const r = await sidecarJobResult(job.id);", land: "!(await landed(job.projectJob))", deliver: "onDone?.(r.data, job)" });
  assert.match(j, /job\.projectJob\?\.end\(\);/);
  for (const [f, n] of [["components/InversionPanel.jsx", 3], ["components/DcipPanel.jsx", 1], ["components/Dcip3dPanel.jsx", 1], ["components/Dcip3dArrayPanel.jsx", 1]]) {
    const s = read(f);
    assert.equal((s.match(/startJob: startProjectJob/g) || []).length, n, f);
    assert.match(s, /startProjectJob \/\* #3953 \*\//, `${f} takes it from the store`);
  }
});

test("the AI action tools: the change is the asking project's; it lands before the undo step and the record; its Undo acts on that project only", () => {
  const m = read("lib/mcpActions.js");
  landsBefore("AI change", m, { start: "const job = s.startProjectJob?.(", land: "if (job && !(await landed(job)))", deliver: "await settle();" });
  assert.match(m, /if \(ownKey && st\?\.isSameProject && !st\.isSameProject\(\{ key: ownKey \}\)\) return;/);
});

test("terrain and imagery fetches, an imported solid, the mine design panes: landed before they change the project", () => {
  const gm = read("modules/GeophysicsModule.jsx"), rm = read("modules/RasterModule.jsx"), vm = read("modules/ViewerModule.jsx");
  landsBefore("terrain fetch (before the CRS relabel)", gm, { start: "const job = beginJob(tr(\"Terrain\"));", land: "if (!(await landed(job))) return;", deliver: "setEpsg(better.code);" });
  // (the zone fix's `return await runSrtmFetch(...)` returns: it never reaches this delivery, and fetches again as a job of its own)
  landsBefore("terrain fetch", gm.replace(/return await runSrtmFetch\([^\n]*\n/, "\n"), { start: "const job = beginJob(tr(\"Terrain\"));", land: "if (!(await landed(job))) return;", deliver: "const terrainId = addTerrain(" });
  assert.match(gm, /job\.end\(\); \/\/ TASKS\.csv #3953 — the fetch in the new zone is a job of its own\n\s+return await runSrtmFetch\(/);
  landsBefore("satellite image", rm, { start: "const job = beginJob(tr(\"Imagery\"));", land: "if (!(await landed(job))) return;", deliver: "addedIds.push(addRaster(" });
  landsBefore("imported solid", vm, { from: vm.indexOf("const importSolidFile = "), start: "const job = startProjectJob?.({ label: file.name }) || null;", land: "if (!(await landed(job))) return;", deliver: "implicitGroupRef.current?.add(" });
  assert.match(vm, /\} finally \{ job\?\.end\(\); \}\n {2}\}, \[fitBox, project\?\.epsg/);
  landsBefore("pit shell", read("components/PitShellPane.jsx"), { start: "const pj = startProjectJob ? startProjectJob({ label: trRaw(\"Pit shell\")", land: "if (!(await landed(pj))) return;", deliver: "const pitId = onAdd({" });
  // every other long job's file: a job started and as many landings as its deliveries (the review of #3953 lists them)
  const files = { "modules/GeophysicsModule.jsx": 10, "modules/RasterModule.jsx": 7, "components/StartDialogs.jsx": 2, "components/AddWebLayerModal.jsx": 2, "components/MacrostratModal.jsx": 2,
    "components/SpectralIndexModal.jsx": 1, "components/HyperspectralTab.jsx": 2, "components/EqsGridBox.jsx": 1, "components/GravityReductionBox.jsx": 1, "components/NestedPitsPane.jsx": 1,
    "components/PitDesignPane.jsx": 1, "components/StopesPane.jsx": 1, "components/PredictivePanel.jsx": 2, "components/SampleGridPanel.jsx": 1, "components/ExplicitSurfacePanel.jsx": 1 };
  for (const [f, n] of Object.entries(files)) {
    const s = read(f);
    assert.match(s, /from "\.\.\/lib\/projectJobs\.js"/, f);
    assert.ok((s.match(/landed\(|\.landing\(\)/g) || []).length >= n, `${f}: ${n} landing(s)`);
  }
  // the panes that had no store take only the stable starter: no re-render on every store write (#438)
  for (const f of ["AddWebLayerModal", "MacrostratModal", "SpectralIndexModal", "HyperspectralTab", "EqsGridBox", "GravityReductionBox", "PredictivePanel"]) {
    const s = read(`components/${f}.jsx`);
    assert.match(s, /const startProjectJob = useStartProjectJob\(\);/, f);
    assert.doesNotMatch(s, /useStore\(\)/, `${f} does not subscribe to the whole store`);
  }
});

test("the store: a key per project, kept by its tab across switches; the jobs cancelled when their project goes; #466's voxel delivery by key", () => {
  const s = read("lib/store.jsx");
  assert.equal((s.match(/projectKeyRef\.current = restoreKeyRef\.current \|\| newProjectKey\(\); restoreKeyRef\.current = null;/g) || []).length, 2, "new / opened / restored (and a switch restores)");
  assert.match(s, /restoreKeyRef\.current = tabKeysRef\.current\.get\(tabId\) \|\| null;[^\n]*\n {4}setWorkspaceTabs\([^\n]*\n {4}loadProjectPayload\(expanded/);
  assert.match(s, /restoreKeyRef\.current = tabKeysRef\.current\.get\(next\.id\) \|\| null;[^\n]*\n {4}loadProjectPayload\(next\.payload, next\.name\);/);
  assert.match(s, /for \(const \{ key, reason \} of syncTabKeys\(tabKeysRef\.current, workspaceTabs\.map\(\(t\) => t\.id\), activeTabId, projectKeyRef\.current\)\) jobsRef\.current\.projectClosed\(key, reason\);/);
  assert.match(s, /jobsRef\.current\.projectShown\(projectKeyRef\.current\);/);
  assert.match(s, /if \(tok\?\.key\) \{ \/\/ TASKS\.csv #3953/);
  assert.match(s, /isSameProject = useCallback\(\(tok\) => !!tok && \(tok\.key \? tok\.key === projectKeyRef\.current/);
  assert.match(s, /startProjectJob, jobNotes, dismissJobNote, (tabIdOfProjectKey, )?\/\/ #3953/); // tabIdOfProjectKey: #3963
  assert.match(read("App.jsx"), /jobNotes\.map\(\(n\) => \(/, "App shows the jobs' words on every module");
});

test("the tab keys (made-up tabs): a switch keeps a project; a close, an Open into the empty tab and a reprojection end one", () => {
  const m = new Map();
  assert.deepEqual(syncTabKeys(m, ["t1"], "t1", "kA"), []);
  assert.deepEqual(syncTabKeys(m, ["t1", "t2"], "t2", "kB"), [], "a new tab: A stays with t1");
  assert.deepEqual([...m], [["t1", "kA"], ["t2", "kB"]]);
  assert.deepEqual(syncTabKeys(m, ["t1", "t2"], "t1", "kA"), [], "back to t1: the same project");
  assert.deepEqual(syncTabKeys(m, ["t1"], "t1", "kA"), [{ key: "kB", reason: "closed" }], "t2 closed");
  assert.deepEqual(syncTabKeys(m, ["t1"], "t1", "kA2"), [{ key: "kA", reason: "replaced" }], "another project in t1 (Open into it, a reprojection)");
  assert.deepEqual(syncTabKeys(m, ["t3"], "t3", "kC"), [{ key: "kA2", reason: "closed" }], "the last tab closed, a new one");
});
