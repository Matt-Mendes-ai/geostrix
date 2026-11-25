// TASKS.csv #3932 batch 3 (Matt, 2026-11-22: "start batch 3") — the AI change tools for grades in blocks and the guided Veins / Alteration runs:
// build_grade_estimate (Grade estimation's own dialog, components/useMcpEstimate.js), add_grade_shell_blocks (the last shell's own cells, lib/lastShellCells.js),
// build_vein / build_alteration (guided/guidedTools.js VEINS, ALTERATION through useMcpModelActions.js), and add_block_model's refusal naming the routes that work.
// Synthetic data only (made-up holes DH-23-xx); the engine and the dialog are stand-ins.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { runChange, ACTIONS } from "../src/lib/mcpActions.js";
import { modelAction } from "../src/modules/viewer/mcpModelAction.js";
import { ALTERATION, VEINS } from "../src/modules/viewer/guided/guidedTools.js";
import { guidedCtx } from "../src/modules/viewer/guided/guidedRun.js";
import { shellBlockModel, setLastShellCells, lastShellCells } from "../src/lib/lastShellCells.js";
import { insideCells } from "../src/lib/viewer/shellPost.js";
import { estimateAction, resultLines } from "../src/components/useMcpEstimate.js";

const require = createRequire(import.meta.url);
const proto = require("../electron/mcpProtocol.js");
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quick = { sleep: (ms) => sleep(Math.min(ms, 2)), quietMs: 20, settingsWaitMs: 300, runWaitMs: 3000 };
const loadQuick = async () => { const G = await import("../src/modules/viewer/guided/guidedRun.js"); return { ...G, runGuided: (o) => G.runGuided({ ...o, ...quick }) }; };

// ---- the shell's cells
test("#3932c insideCells: the nodes at or above the iso in the drawn field, with the grade from the values", () => {
  const field = Float32Array.from([0.1, 2, 3, 0.5, 2.5]), values = Float32Array.from([0.1, 2.2, 3.3, 0.5, NaN]);
  const c = insideCells(field, values, 2);
  assert.deepEqual([...c.idx], [1, 2, 4]);
  assert.ok(Math.abs(c.value[0] - 2.2) < 1e-6 && Math.abs(c.value[1] - 3.3) < 1e-6 && Number.isNaN(c.value[2]));
});

const box = (over = {}) => ({ nx: 4, ny: 3, nz: 2, origin: { x: 1000, y: 2000, z: -50 }, cellSize: { dx: 10, dy: 10, dz: 5 }, idx: Uint32Array.from([0, 5, 23]), value: Float32Array.from([1.2, 2.4, 3.6]), envelope: false, ...over });
const rec = (over = {}) => ({ key: "p1", surfaceId: "s1", name: "Zn > 2 % shell", element: "Zn", unit: "%", cutoff: 2, warped: false, boxes: [box()], ...over });
const surfaces = [{ id: "s1", name: "Zn > 2 % shell" }];

test("#3932c shellBlockModel: each cell a block of the grid at its node, with the shell's grade; the record of the shell kept with it", () => {
  const r = shellBlockModel(rec(), { surfaces });
  assert.equal(r.ok, true); assert.equal(r.cells, 3); assert.equal(r.grades, true);
  // idx 5 in a 4 x 3 x 2 grid: gx 1, gy 1, gz 0; idx 23: gx 3, gy 2, gz 1
  assert.deepEqual(r.model.cells[1], { x: 1010, y: 2010, z: -50, dx: 10, dy: 10, dz: 5, value: r.model.cells[1].value });
  assert.deepEqual([r.model.cells[2].x, r.model.cells[2].y, r.model.cells[2].z], [1030, 2020, -45]);
  assert.ok(Math.abs(r.model.cells[2].value - 3.6) < 1e-6);
  assert.equal(r.model.name, "Zn > 2 % shell — cells"); assert.equal(r.model.colorMode, "continuous"); assert.ok(r.model.min < r.model.max);
  assert.equal(r.model.params.note, "A picture of where the grade is, not a resource estimate.");
  assert.match(r.model.params.value, /^Zn \(%\): the shell's interpolated grade/);
});

test("#3932c shellBlockModel: an envelope area gives 1 inside (no grade); refused with no shell, another project, a removed shell, a trend, nothing inside, too many cells", () => {
  const env = shellBlockModel(rec({ boxes: [box(), box({ envelope: true })] }), { surfaces });
  assert.equal(env.ok, true); assert.equal(env.grades, false); assert.ok(env.model.cells.every((c) => c.value === 1)); assert.match(env.model.params.value, /^1 inside the shell/);
  assert.match(shellBlockModel(null).error, /^No grade shell has been built in this session/);
  assert.match(shellBlockModel(rec(), { surfaces, sameProject: () => false }).error, /another project/);
  assert.match(shellBlockModel(rec(), { surfaces: [] }).error, /has been removed/);
  assert.match(shellBlockModel(rec({ warped: true }), { surfaces }).error, /structural trend.*build_grade_estimate/);
  assert.match(shellBlockModel(rec({ boxes: [box({ idx: new Uint32Array(0), value: new Float32Array(0) })] }), { surfaces }).error, /no cells at or above its cut-off/);
  assert.match(shellBlockModel(rec(), { surfaces, maxCells: 2 }).error, /over the 2 a block model takes here/);
  setLastShellCells(rec()); assert.equal(lastShellCells().name, "Zn > 2 % shell"); setLastShellCells(null);
});

test("#3932c add_grade_shell_blocks through StrixViewer: the block model added, its Undo removes only it; add_block_model's refusal names the routes", async () => {
  setLastShellCells(rec());
  const added = [], removed = [];
  const c = () => ({ api: { surfaces }, addVoxelModel: (m) => { added.push(m); return "v9"; }, removeVoxelModel: (id) => removed.push(id), isSameProject: ({ key }) => key === "p1" });
  const r = await modelAction(c, { op: "shell_blocks" });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.id, "v9"); assert.equal(r.cells, 3); assert.equal(r.element, "Zn"); assert.equal(r.not_a_resource_estimate, "A picture of where the grade is, not a resource estimate.");
  assert.equal(added.length, 1); r.revert(); assert.deepEqual(removed, ["v9"]);
  const other = await modelAction(() => ({ ...c(), isSameProject: () => false }), { op: "shell_blocks" });
  assert.match(other.error, /another project/);
  setLastShellCells(null);
  const none = await modelAction(() => ({ lastLithBlock: null }), { op: "block_model" });
  assert.match(none.error, /For a grade shell's cells use add_grade_shell_blocks; for grades estimated into blocks use build_grade_estimate; for rock blocks build the surfaces first \(build_surface\)/);
});

// ---- the guided Veins and Alteration runs
const holes = [...Array(6).keys()].map((i) => ({ hole_id: `DH-23-0${i}`, x: i * 40, y: 0, z: 0 }));
const altRows = holes.flatMap((h, i) => [{ hole_id: h.hole_id, from: 0, to: 20, value: "PRO" }, ...(i < 4 ? [{ hole_id: h.hole_id, from: 20, to: 30, value: "SER" }] : []), ...(i < 2 ? [{ hole_id: h.hole_id, from: 30, to: 31, value: "SIL" }] : []), { hole_id: h.hole_id, from: 31, to: 32, value: "NR" }]);
const veinRows = holes.flatMap((h, i) => [...(i < 5 ? [{ hole_id: h.hole_id, from: 40, to: 41, value: "QV1" }] : []), ...[...Array(8).keys()].map((k) => ({ hole_id: h.hole_id, from: 50 + k, to: 50.3 + k, value: "QTZ" }))]);
const storeOf = (over = {}) => ({ layers: { litho: holes.map((h) => ({ hole_id: h.hole_id, from: 0, to: 60, value: "SST" })), vein: veinRows, alt: altRows, structure: [], sg: [] }, modellingCodes: { codes: [] }, assays: [], survey: [], assayElements: [], collars: holes, ...over });

test("#3932c the Alteration halo's verdicts: three holes or more, another alteration to close it; 'not recorded' is no code", () => {
  const ctx = guidedCtx(storeOf(), () => []);
  assert.deepEqual(ALTERATION.choices(ctx), ["PRO", "SER", "SIL"], "by holes; NR left out");
  assert.equal(ALTERATION.feed(ctx), null);
  assert.equal(ALTERATION.auto(ctx, "SER").ok, true);
  assert.match(ALTERATION.auto(ctx, "SIL").verdict[0], /^Only 2 holes log SIL: a halo needs three or more\./);
  const one = guidedCtx(storeOf({ layers: { litho: [], vein: [], alt: altRows.filter((r) => r.value === "PRO"), structure: [], sg: [] } }), () => []);
  assert.match(ALTERATION.auto(one, "PRO").verdict[0], /^Every alteration interval logged is PRO: with no other alteration logged/);
  assert.match(ALTERATION.feed(guidedCtx(storeOf({ layers: { litho: [], vein: [], alt: [], structure: [], sg: [] } }), () => [])), /^No alteration logged/);
});

function engine() {
  const st = { surfaces: [], busy: false, runs: [], notices: [] };
  const run = (key) => async (target) => { st.runs.push([key, target]); st.busy = true; await sleep(20); st.surfaces = [...st.surfaces, { id: `s_${key}_${target}`, name: `${key === "alt" ? "Alteration halo" : "Vein"}: ${target}` }]; st.busy = false; };
  const api = () => ({ get busy() { return st.busy; }, get surfaces() { return st.surfaces; }, modelResolution: 36, setModelResolution() {}, runVeinModel: run("vein"), runAlterationModel: run("alt"), computeIntercepts: () => [] });
  return { st, api };
}

test("#3932c build_vein and build_alteration: the code found (a vein, or a lithology code read as one), run as the card runs it, the verdicts word for word", async () => {
  const e = engine(), removed = [];
  const c = () => ({ store: storeOf(), api: e.api(), notices: e.st.notices, removeSurfaces: (ids) => removed.push(ids) });
  const v = await modelAction(c, { op: "vein", code: "qv1" }, loadQuick);
  assert.equal(v.ok, true, JSON.stringify(v)); assert.equal(v.code, "QV1"); assert.equal(v.changed, "vein surface"); assert.deepEqual(e.st.runs[0], ["vein", "QV1"]);
  const set = await modelAction(c, { op: "vein", code: "QTZ" }, loadQuick);
  assert.equal(set.ok, false); assert.match(set.error, /^Split QTZ into single veins in Modelling codes, or show the set with an Alteration halo/);
  assert.match((await modelAction(c, { op: "vein", code: "XX" }, loadQuick)).error, /^No vein or dyke 'XX' logged\. The veins and dykes logged: QV1, QTZ\./);
  const a = await modelAction(c, { op: "alteration", code: "ser" }, loadQuick);
  assert.equal(a.ok, true, JSON.stringify(a)); assert.equal(a.code, "SER"); assert.equal(a.changed, "alteration halo"); assert.deepEqual(e.st.runs[1], ["alt", "SER"]);
  a.revert(); assert.deepEqual(removed, [["s_alt_SER"]]);
  assert.match((await modelAction(c, { op: "alteration", code: "SIL" }, loadQuick)).error, /^Only 2 holes log SIL/);
  assert.match((await modelAction(c, { op: "alteration", code: "ZZ" }, loadQuick)).error, /^No alteration 'ZZ' logged\. The alteration codes logged: PRO, SER, SIL\./);
  assert.equal(e.st.runs.length, 2, "nothing ran for a refusal");
  assert.equal(VEINS.feed(guidedCtx(storeOf({ layers: { litho: [], vein: [], alt: [], structure: [], sg: [] } }), () => [])) !== null, true);
});

test("#3932c a run that makes nothing answers with its own message, word for word (live: a vein code that is a set said only 'Nothing was built')", async () => {
  const st = { busy: false, notices: [{ text: "an older message" }] };
  const api = () => ({ get busy() { return st.busy; }, surfaces: [], modelResolution: 36, setModelResolution() {}, computeIntercepts: () => [],
    runAlterationModel: async () => { st.busy = true; await sleep(10); st.notices = [...st.notices, { text: "\"Alteration halo: SER\": no   surface was made: the indicator never reaches 0.5." }]; st.busy = false; } });
  const c = () => ({ store: storeOf(), api: api(), notices: st.notices, removeSurfaces() {} });
  const r = await modelAction(c, { op: "alteration", code: "SER" }, loadQuick);
  assert.equal(r.ok, false); assert.equal(r.error, "Nothing was built: \"Alteration halo: SER\": no surface was made: the indicator never reaches 0.5.");
});

// ---- Grade estimation's own dialog
function dialog({ symbols = ["Au", "Zn"], overLimit = false, unsReady = true, error = "", weak = null, blocks = 120, runMs = 30 } = {}) {
  const st = { symbol: "Au", sourceKey: "custom:x", running: false, result: null, error: "", weakFitAsk: null, voxels: ["old"], added: 0, ran: 0 };
  const g = () => ({ symbols, symbol: st.symbol, setSymbol: (v) => { setTimeout(() => { st.symbol = v; }, 5); }, sourceKey: st.sourceKey, setSourceKey: (v) => { setTimeout(() => { st.sourceKey = v; }, 5); },
    running: st.running, result: st.result, error: st.error, weakFitAsk: st.weakFitAsk, overLimit, reachPending: false, bounds: { x: 1 }, unsReady, blockBudget: 2000000, cellLabel: "10", searchRadius: 50,
    run: () => { st.ran++; st.result = null; st.error = ""; if (error) { st.error = error; return; } st.running = true; setTimeout(() => { st.running = false; if (weak) st.weakFitAsk = weak; else st.result = { blocksEstimated: blocks, params: { element: st.symbol, unit: "%", method: "idw2", cellSizeM: 10, searchRadiusM: 50 } }; }, runMs); },
    addToProject: () => { st.added++; st.voxels = [...st.voxels, `v${st.added}`]; }, resultName: () => `${st.symbol} estimate (idw2, 10m, r50m)`, voxelIds: () => st.voxels });
  return { st, g };
}
const fast = { sleep: (ms) => sleep(Math.min(ms, 5)), settleMs: 2000, runMs: 3000, doc: null };

test("#3932c build_grade_estimate: the element set in the dialog, its defaults left to settle, Run, Add to project; the block model and the run's figures back", async () => {
  const d = dialog();
  const r = await estimateAction(d.g, { element: "zn" }, fast);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(d.st.sourceKey, "assay", "an element of the assays, not the log the dialog was last left on");
  assert.equal(r.element, "Zn"); assert.equal(r.id, "v1"); assert.equal(r.blocks, 120); assert.equal(r.method, "idw2"); assert.equal(r.name, "Zn estimate (idw2, 10m, r50m)");
  const removed = []; r.revert({ removeVoxelModel: (id) => removed.push(id) }); assert.deepEqual(removed, ["v1"]);
});

test("#3932c build_grade_estimate refuses as the dialog would: an unknown element, over the budget, a choice it needs, its own error, the weak-fit question, zero blocks", async () => {
  assert.match((await estimateAction(dialog().g, { element: "Cu" }, fast)).error, /^No element 'Cu' with lab values in this project's assays\. Available: Au, Zn\./);
  assert.match((await estimateAction(dialog({ overLimit: true }).g, { element: "Au" }, fast)).error, /over the 2,000,000-block budget/);
  assert.match((await estimateAction(dialog({ unsReady: false }).g, { element: "Au" }, fast)).error, /how the unsampled metres inside the sampled holes are read/);
  assert.equal((await estimateAction(dialog({ error: "No collars loaded — nothing to estimate from." }).g, { element: "Au" }, fast)).error, "No collars loaded — nothing to estimate from.");
  assert.match((await estimateAction(dialog({ weak: { rSquared: 0.2 } }).g, { element: "Au" }, fast)).error, /weak, and the dialog asks how to go on/);
  const z = dialog({ blocks: 0 }); assert.match((await estimateAction(z.g, { element: "Au" }, fast)).error, /^No block was estimated/); assert.equal(z.st.added, 0, "nothing added");
  const busy = dialog(); busy.st.running = true; assert.match((await estimateAction(busy.g, { element: "Au" }, fast)).error, /already running/);
});

test("#3932c the result's lines, as the dialog shows them, without its controls", () => {
  const el = (text, kids = null, ctrl = false) => ({ textContent: text, children: kids || [], matches: (s) => ctrl && /button/.test(s), querySelector: (s) => (ctrl && /button/.test(s) ? {} : null) });
  const root = el("", [el("120 of 150 blocks (80%) lie between holes (interpolated); 30 are extrapolated beyond the data."), { ...el(""), innerText: "Data support\n19,266 interpolated" }, el("Add to project", null, true),
    { textContent: "", children: [el("name"), el("Add", null, true)], matches: () => false, querySelector: (s) => (/button/.test(s) ? {} : null) },
    { textContent: "Check this estimate", children: [], matches: (s) => s === "[data-estimate-check]", querySelector: () => null }]);
  assert.deepEqual(resultLines(root), ["120 of 150 blocks (80%) lie between holes (interpolated); 30 are extrapolated beyond the data.", "Data support", "19,266 interpolated", "name"], "line by line as drawn; the check's own block left out");
  assert.deepEqual(resultLines(null), []);
});

test("#3932c through runChange: each tool answers short, with Undo in the toast; the main process sees four more change tools, long, with their schemas", async () => {
  const actions = { ...ACTIONS, build_alteration: async () => ({ ok: true, tracked: false, data: { changed: "alteration halo", built: ["Alteration halo: SER"] }, say: "built the alteration halo 'Alteration halo: SER'", revert() {} }) };
  const toasts = [];
  const r = await runChange("build_alteration", { code: "SER" }, { getStore: () => ({}), toast: (t) => toasts.push(t), settle: async () => {}, actions });
  assert.equal(r.ok, true); assert.equal(r.data.changed, "alteration halo"); assert.equal(typeof toasts[0].undo, "function");
  for (const name of ["build_grade_estimate", "add_grade_shell_blocks", "build_vein", "build_alteration"]) {
    const def = proto.TOOLS.find((t) => t.name === name);
    assert.ok(def, name); assert.equal(proto.isChangeTool(def), true, name); assert.equal(proto.isLongTool(def), true, name); assert.equal(proto.isNetworkTool(def), false, name);
    assert.match(def.description, /^Makes a change in GeoStrix: /, name); assert.ok(name in ACTIONS, name);
  }
  assert.match(proto.TOOLS.find((t) => t.name === "add_block_model").description, /For a grade shell's cells use add_grade_shell_blocks; for grades estimated into blocks, build_grade_estimate\./);
  assert.match(proto.TOOLS.find((t) => t.name === "build_grade_estimate").description, /'Not a resource estimate\.' paragraph word for word/);
});

test("#3932c wiring: StrixViewer opens the dialog and passes the request on; the dialog answers from its own state; the shell run keeps its cells; none of it at startup", () => {
  const vm = read("../src/modules/ViewerModule.jsx"), gm = read("../src/components/GradeEstimationModal.jsx"), mr = read("../src/modules/viewer/modellingRuns.js"), wk = read("../src/lib/estimation.worker.js"), a = read("../src/lib/mcpActions.js");
  assert.match(vm, /useModuleAction\(\["mcp-estimate-open"\], \(_a, p\) => \{ setGradeEstOpen\(true\); requestModuleAction\("mcp-estimate", p\); \}\);/);
  assert.match(vm, /runAlterationModel \/\* #3932 batch 3 \*\/,/); assert.match(vm, /busy: implicitBusy \|\| veinBusy \|\| numericBusy \|\| alterationBusy,/);
  assert.match(gm, /useMcpEstimate\(\(\) => \(\{ symbols, symbol, setSymbol, sourceKey, setSourceKey, run, running, result, error, weakFitAsk, overLimit, reachPending, bounds, unsReady: uns\.ready,/);
  assert.match(gm, /<div data-mcp="estimate-result"/); assert.match(gm, /<div data-mcp="estimate-not-resource"/);
  assert.match(mr, /keepCells: true \/\* #3932 batch 3/); assert.match(mr, /setLastShellCells\(\{ key: job\.key, surfaceId: id, name: label, element: symbol, unit, cutoff: numericCutoff, warped: !!anisotropy\.enabled,/);
  assert.match(wk, /\.\.\.\(post\.inside \? \[post\.inside\.idx\.buffer, post\.inside\.value\.buffer\] : \[\]\)/);
  assert.match(a, /viaModule\(s, "viewer", "mcp-estimate-open", \{ element: a\.element \}, MODEL_WAIT_MS\)/);
  assert.doesNotMatch(vm, /^import [^\n]*(useMcpEstimate|lastShellCells)/m, "loaded with the dialog / on use, not at startup");
  assert.equal(guidedCtx({ layers: { alt: altRows } }, () => []).alt.length, altRows.length);
  assert.match(read("../src/modules/viewer/guided/GuidedTool.jsx"), /alt: store\.layers\?\.alt \|\| \[\] \/\* #3932 batch 3 \*\//, "the card's ctx and the AI's carry the same fields");
});
