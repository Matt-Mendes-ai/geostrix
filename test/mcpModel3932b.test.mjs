// TASKS.csv #3932 batch 2 (Main, 2026-11-21) — the modelling change tools of an AI app: build_surface (the guided Bodies / Cover run) and build_grade_shell (the guided Grade model),
// each a guided tool's own "Build it for me" without its card (modules/viewer/guided/guidedRun.js), carried out by StrixViewer (useMcpModelActions.js), behind the changes switch,
// one at a time, long ones answered "started" (#3937), the toast's Undo taking out exactly what was added. Synthetic data; the engine is a stand-in with the engine's busy flag.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { runChange, ACTIONS } from "../src/lib/mcpActions.js";
import { runGuided, guidedCtx, toolForRock } from "../src/modules/viewer/guided/guidedRun.js";
import { modelAction } from "../src/modules/viewer/useMcpModelActions.js";
import { BODIES, COVER, GRADE, ROCK_LAYERS } from "../src/modules/viewer/guided/guidedTools.js";

const require = createRequire(import.meta.url);
const proto = require("../electron/mcpProtocol.js");
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quick = { sleep: (ms) => sleep(Math.min(ms, 2)), quietMs: 20, settingsWaitMs: 300, runWaitMs: 3000 };

// ---- a stand-in engine: the api GuidedTool is given, with the busy flag the real runs raise
function engine({ makes = (target) => { const t = String(target).replace(/^mcode:/, ""); return [{ id: `s_${t}`, name: `Top of ${t}`, params: { volumeM3: 1.2e6 } }]; }, busyMs = 25, startBusy = false } = {}) {
  const st = { surfaces: [], busy: startBusy, modelResolution: 36, numeric: ["", "", "", "", "", ""], runs: [], removed: [] };
  const run = (key) => async (...args) => { st.runs.push([key, ...args]); st.busy = true; await sleep(busyMs); st.surfaces = [...st.surfaces, ...makes(args[0])]; st.busy = false; };
  const api = () => ({
    get busy() { return st.busy; }, get surfaces() { return st.surfaces; }, get modelResolution() { return st.modelResolution; },
    setModelResolution: (v) => { st.modelResolution = v; }, // the render that applies it is the next poll
    runImplicitModel: run("implicit"), runNumericModel: run("numeric"), runStackModel: run("stack"), setStackUnits() {}, computeIntercepts: () => st.intercepts || [], meshOf: () => undefined,
    numeric: { get now() { return st.numeric; }, set: [0, 1, 2, 3, 4, 5].map((i) => (v) => { st.numeric = st.numeric.map((x, k) => (k === i ? v : x)); }) },
  });
  return { st, api };
}

// ---- synthetic project: DYK a dyke and TILL a cover in 6 holes, a lens of Au 1.5-2.5 g/t in a 5 x 5 grid of holes 40 m apart
const holes = [...Array(5).keys()].flatMap((i) => [...Array(5).keys()].map((j) => ({ hole_id: `DH-23-${i}${j}`, x: i * 40, y: j * 40, z: 0 })));
const lithoRows = [...holes.flatMap((h, k) => [{ hole_id: h.hole_id, from: 0, to: 5, value: "TILL" }, { hole_id: h.hole_id, from: 5, to: 60, value: "SST" }, ...(k % 4 === 0 ? [{ hole_id: h.hole_id, from: 20, to: 24, value: "DYK" }] : [])]),
  { hole_id: "DH-23-00", from: 60, to: 70, value: "ODD" }, { hole_id: "DH-23-01", from: 1, to: 3, value: "ODD" }, { hole_id: "DH-23-02", from: 61, to: 70, value: "ODD" }, { hole_id: "DH-23-03", from: 2, to: 3, value: "ODD" }]; // ODD above and below SST: not in a steady order
const assays = holes.flatMap((h, k) => [...Array(50).keys()].map((n) => ({ hole_id: h.hole_id, from: n * 2, to: n * 2 + 2, values: { Au: n >= 20 && n < 30 && k % 6 !== 0 ? 1.5 + ((k * n) % 10) / 10 : 0.04 } })));
const store = (over = {}) => ({ layers: { litho: lithoRows, vein: [], structure: [], sg: [] }, modellingCodes: { codes: [{ name: "DYK", role: "dyke" }, { name: "TILL", role: "overburden" }] }, assays, survey: [], assayElements: [{ symbol: "Au", unit: "g/t" }], structuralTrends: {}, collars: holes, terrain: null, ...over });
// layered ground: TILL (cover), SST over SLT in every hole, and ODD above and below SST in different holes (not in a steady order)
const layerRows = [...holes.flatMap((h) => [{ hole_id: h.hole_id, from: 0, to: 5, value: "TILL" }, { hole_id: h.hole_id, from: 5, to: 30, value: "SST" }, { hole_id: h.hole_id, from: 30, to: 60, value: "SLT" }]),
  { hole_id: "DH-23-00", from: 60, to: 70, value: "ODD" }, { hole_id: "DH-23-01", from: 1, to: 3, value: "ODD" }, { hole_id: "DH-23-02", from: 61, to: 70, value: "ODD" }, { hole_id: "DH-23-03", from: 2, to: 3, value: "ODD" }];
const layered = { layers: { litho: layerRows, vein: [], structure: [], sg: [] }, modellingCodes: { codes: [{ name: "TILL", role: "overburden" }] } };
const contactsOf = () => holes.flatMap((h) => [{ layerKey: "litho", unit: "DYK", hole_id: h.hole_id, from: 20, x: h.x, y: h.y, z: -20 }, { layerKey: "litho", unit: "SST", hole_id: h.hole_id, from: 5, x: h.x, y: h.y, z: -5 }, { layerKey: "litho", unit: "SLT", hole_id: h.hole_id, from: 24, x: h.x, y: h.y, z: -24 }]);
const ctxOf = (e, over) => ({ store: store(over), api: e.api(), removeSurfaces: (ids) => { e.st.removed.push(ids); e.st.surfaces = e.st.surfaces.filter((s) => !ids.includes(s.id)); } });

test("#3932b the guided tool's own run, as a promise: checks, automatic settings, the run once they have rendered, the surfaces it made", async () => {
  const e = engine(); e.st.intercepts = contactsOf();
  const ctx = guidedCtx(store(), () => e.api().computeIntercepts());
  const r = await runGuided({ tool: BODIES, value: "DYK", ctx, getApi: e.api, ...quick });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.built, ["Top of DYK"]); assert.deepEqual(r.ids, ["s_DYK"]);
  assert.equal(e.st.runs.length, 1); assert.equal(e.st.runs[0][0], "implicit"); assert.equal(e.st.runs[0][1], "mcode:DYK", "the run's target: the rock, by its Modelling-codes key (as the card runs it)");
  assert.ok(e.st.modelResolution !== 36, "the model's size read from the logs was put in place before the run");
  assert.ok(r.reasons.length >= 1, "what it chose, and why");
  // the tool's own refusals, unchanged
  const no = await runGuided({ tool: BODIES, value: "SST", ctx, getApi: e.api, ...quick });
  assert.equal(no.ok, false); assert.match(no.error, /^Mark SST as an intrusion .* read as a layered rock/);
  assert.equal(e.st.runs.length, 1, "refused before anything ran");
  assert.match((await runGuided({ tool: BODIES, value: "", ctx, getApi: e.api, ...quick })).error, /Choose a rock first/);
});

test("#3932b one model at a time; a run that is cancelled or stops with a message built nothing and says so; settings that never arrive are said", async () => {
  const busy = engine({ startBusy: true }); busy.st.intercepts = contactsOf();
  const ctx = guidedCtx(store(), () => busy.st.intercepts);
  const a = await runGuided({ tool: BODIES, value: "DYK", ctx, getApi: busy.api, ...quick });
  assert.match(a.error, /Another model is running in GeoStrix: one at a time/); assert.equal(busy.st.runs.length, 0);
  const cancelled = engine({ makes: () => [] }); cancelled.st.intercepts = contactsOf();
  const b = await runGuided({ tool: BODIES, value: "DYK", ctx, getApi: cancelled.api, ...quick });
  assert.equal(b.ok, false); assert.match(b.error, /Nothing was built: it was cancelled, or the run stopped with a message/);
  const stuck = engine(); stuck.st.intercepts = contactsOf();
  const api = () => ({ ...stuck.api(), get modelResolution() { return 36; } }); // the setting never takes
  const c = await runGuided({ tool: BODIES, value: "DYK", ctx, getApi: api, ...quick });
  assert.match(c.error, /did not apply the model's settings/); assert.equal(stuck.st.runs.length, 0);
  assert.match((await runGuided({ tool: null, value: "x", ctx, getApi: api, ...quick })).error, /Unknown model tool/);
});

test("#3932b build_surface: the rock's role picks the tool (overburden: the cover's base, else a body); unknown rocks list the logged ones", async () => {
  const role = { TILL: "overburden", DYK: "dyke", SST: "stratigraphic" }, rc = { isCover: (u) => role[u] === "overburden", roleOf: (u) => role[u] };
  assert.equal(toolForRock(rc, "TILL"), COVER); assert.equal(toolForRock(rc, "DYK"), BODIES); assert.equal(toolForRock(rc, "SST"), ROCK_LAYERS, "a layered rock: the Rock layers tool");
  const e = engine(); e.st.intercepts = contactsOf();
  const r = await modelAction(() => ctxOf(e), { op: "surface", rock: "dyk" }); // case does not matter
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.changed, "body surface"); assert.equal(r.rock, "DYK"); assert.deepEqual(r.built, ["Top of DYK"]);
  assert.ok(Array.isArray(r.why) && r.why.length <= 4 && r.why.every((x) => x.length <= 240), "short answers");
  const miss = await modelAction(() => ctxOf(e), { op: "surface", rock: "GRANITE" });
  assert.match(miss.error, /^No rock 'GRANITE' in the lithology log\. The rocks logged: .*DYK/);
  // a layered rock builds the layers of the rocks that lie in a steady order (the Rock layers card's own suggestion); one that does not is refused
  const st = engine({ makes: () => [{ id: "top_sst", name: "Top of SST" }, { id: "top_slt", name: "Top of SLT" }] }); st.st.intercepts = contactsOf();
  const lay = await modelAction(() => ctxOf(st, layered), { op: "surface", rock: "sst" });
  assert.equal(lay.ok, true, JSON.stringify(lay)); assert.equal(lay.changed, "rock layers"); assert.equal(lay.tool, "layers"); assert.deepEqual(lay.ids, ["top_sst", "top_slt"]);
  assert.equal(st.st.runs[0][0], "stack"); assert.deepEqual(st.st.runs[0][1], ["TILL", "SST", "SLT"], "the layers in their order, top to bottom");
  assert.match((await modelAction(() => ctxOf(st, layered), { op: "surface", rock: "ODD" })).error, /^ODD is not one of the rocks that lie in a steady order, top to bottom, down the holes \(TILL, SST, SLT\)\. Mark it as an intrusion or as overburden in Modelling codes/);
  assert.match((await modelAction(() => ctxOf(e), { op: "nope" })).error, /Unknown model request/);
  assert.match((await modelAction(() => ctxOf(e), null)).error, /Nothing asked/);
  const cover = await modelAction(() => ctxOf(engine()), { op: "surface", rock: "TILL" }); // no contacts in this engine: the cover's base cannot be drawn
  assert.equal(cover.ok, false); assert.match(cover.error, /contacts|logs/i);
});

test("#3932b build_grade_shell: the Grade model's cut-off, cells and search read from the drilling; the notice that it is not a resource estimate; the revert takes out only what it added", async () => {
  const e = engine({ makes: () => [{ id: "shell_1", name: "Au shell ≥ 0.5 g/t", closure: null, params: { volumeM3: 2.4e5 } }] });
  const r = await modelAction(() => ctxOf(e), { op: "grade_shell", element: "au" });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.changed, "grade shell"); assert.equal(r.element, "Au"); assert.deepEqual(r.ids, ["shell_1"]);
  assert.equal(e.st.runs[0][0], "numeric"); assert.equal(e.st.numeric[0], "Au", "the metal was put in place before the run");
  assert.ok(Number(e.st.numeric[1]) > 0, "a cut-off read from the grades"); assert.ok(Number(e.st.numeric[2]) > 0, "the cells from the drill spacing");
  assert.match(r.notes.join(" "), /not a resource estimate/);
  e.st.surfaces.push({ id: "mine", name: "someone's own surface" });
  r.revert(); assert.deepEqual(e.st.removed, [["shell_1"]]); assert.deepEqual(e.st.surfaces.map((s) => s.id), ["mine"], "only what the AI added");
  const miss = await modelAction(() => ctxOf(e), { op: "grade_shell", element: "Zn" });
  assert.match(miss.error, /^No element 'Zn' in this project's assays\. Available: Au/);
  const none = await modelAction(() => ctxOf(e, { assayElements: [], assays: [] }), { op: "grade_shell", element: "Au" });
  assert.match(none.error, /No element 'Au'/);
});

test("#3932b through the change runner: one undo checkpoint each side, a toast with Undo, the activity entry, and a failure is short", async () => {
  const e = engine(); e.st.intercepts = contactsOf();
  const toasts = [], checkpoints = [], s = { undoCheckpoint: (l) => checkpoints.push(l ?? null), goToModule() {} };
  const actions = { build_surface: async (a) => {
    const r = await modelAction(() => ctxOf(e), { op: "surface", rock: a.rock });
    if (!r.ok) return r;
    const { ok, revert, ...rest } = r;
    return { ok: true, tracked: false, data: rest, say: `built the surface '${r.built[0]}'`, revert };
  } };
  const out = await runChange("build_surface", { rock: "DYK" }, { getStore: () => s, client: "Claude Desktop", toast: (t) => toasts.push(t), settle: async () => {}, actions });
  assert.equal(out.ok, true); assert.equal(out.data.changed, "body surface");
  assert.equal(checkpoints.length, 2, "before and after");
  assert.equal(toasts.length, 1); assert.match(toasts[0].message, /Claude Desktop: built the surface 'Top of DYK'/); assert.equal(typeof toasts[0].undo, "function");
  toasts[0].undo(); assert.deepEqual(e.st.removed, [["s_DYK"]]);
  const bad = await runChange("build_surface", { rock: "GRANITE" }, { getStore: () => s, client: "Claude Desktop", toast: (t) => toasts.push(t), settle: async () => {}, actions });
  assert.equal(bad.ok, false); assert.match(bad.error, /^No rock 'GRANITE' in the lithology log/); assert.equal(toasts.length, 1, "no toast for a refusal");
});

test("#3932b the tools in the protocol: change tools behind the switch, long (a model run), strict schemas, listed with 'Makes a change in GeoStrix'", async () => {
  for (const n of ["build_surface", "build_grade_shell"]) {
    const d = proto.TOOLS.find((t) => t.name === n);
    assert.ok(d, n); assert.equal(proto.isChangeTool(d), true); assert.equal(proto.isLongTool(d), true); assert.equal(proto.isNetworkTool(d), false, "no download");
    assert.match(d.description, /^Makes a change in GeoStrix:/); assert.match(d.description, /'started' with a job_id/);
    assert.equal(d.annotations.destructiveHint, false); assert.ok(ACTIONS[n], "an action for it");
  }
  assert.deepEqual(proto.TOOLS.filter(proto.isChangeTool).map((t) => t.name).sort(), Object.keys(ACTIONS).sort(), "every change tool has its action, and the reverse");
  const bs = proto.TOOLS.find((t) => t.name === "build_surface");
  assert.equal(proto.refuseArgs(bs, {})?.message, "'rock' is required."); assert.equal(proto.refuseArgs(bs, { rock: "x".repeat(65) })?.message, "'rock' is too long (at most 64 characters).");
  assert.equal(proto.refuseArgs(bs, { rock: "C:\\x" })?.code, "path"); assert.equal(proto.refuseArgs(bs, { rock: "DYK", extra: 1 })?.message, "Unknown argument 'extra'.");
  assert.equal(proto.refuseArgs(proto.TOOLS.find((t) => t.name === "build_grade_shell"), { element: "Au" }), null);
  // switched off: refused in the main process, nothing reaches the window; on: the window is told it is a long call
  const calls = [];
  const mk = (on) => proto.createSession({ changesAllowed: () => on, askAllow: async () => "once", callTool: async (n, a, meta) => { calls.push([n, meta]); return { ok: true, data: { changed: "body surface" } }; } });
  const off = mk(false), init = (s) => s.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", clientInfo: { name: "Claude Desktop" } } }));
  await init(off);
  const refused = JSON.parse(await off.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "build_surface", arguments: { rock: "DYK" } } }))).result;
  assert.equal(refused.isError, true); assert.match(refused.content[0].text, /Changes are switched off/); assert.equal(calls.length, 0);
  const on = mk(true); await init(on);
  assert.equal(JSON.parse(await on.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "build_grade_shell", arguments: { element: "Au" } } }))).result.isError, false);
  assert.deepEqual(calls[0], ["build_grade_shell", { client: "Claude Desktop", change: true, long: true }], "the host gives it the long wait");
  const host = read("../electron/mcpHost.js");
  assert.match(host, /meta\.network \|\| meta\.long \? NETWORK_CALL_TIMEOUT_MS : CALL_TIMEOUT_MS/);
});

test("#3932b make_sheet and add_best_intercepts are tracked: a Layout page is an undo step since #3935, so Ctrl+Z takes it back", () => {
  const src = read("../src/lib/mcpActions.js");
  for (const k of ['changed: "layout page", name: r.name', 'changed: "layout page", name: tr("Best intercepts")']) assert.match(src, new RegExp(`tracked: true, data: \\{ ${k.replace(/[()".]/g, "\\$&")}`), k);
  assert.doesNotMatch(src, /tracked: false, data: \{ changed: "layout page"/);
  const store = read("../src/lib/store.jsx");
  assert.match(store, /const pageStep = \(\) => \{ commitUndoBurst\(\); undoOwnStep\.current = true; \};/, "adding a page is a step of its own");
});

test("#3932b StrixViewer: the hook answers only in the 3D View, the guided card and the AI tools share one api, nothing of it is in the startup chunk", () => {
  const vm = read("../src/modules/ViewerModule.jsx");
  assert.match(vm, /const guidedApi = \{ runStackModel, runImplicitModel,/);
  assert.match(vm, /useMcpModelActions\(\(\) => \(\{ store: \{ layers, modellingCodes, assays, survey, assayElements, structuralTrends, collars, terrain \}, api: guidedApi, removeSurfaces, lastLithBlock, addLithBlockModel, removeVoxelModel \}\), mode === "view"\);/);
  assert.match(vm, /<GuidedTool tool=\{guided\} setTool=\{setGuided\} api=\{guidedApi\} \/>/);
  const hook = read("../src/modules/viewer/useMcpModelActions.js");
  assert.match(hook, /load = \(\) => import\("\.\/guided\/guidedRun\.js"\)/, "loaded on first use");
  assert.doesNotMatch(hook, /^import .*guided/m);
  assert.match(hook, /if \(!enabled\) return;/);
  // the ctx is built as GuidedTool builds it: the same fields
  const card = read("../src/modules/viewer/guided/GuidedTool.jsx"), mine = read("../src/modules/viewer/guided/guidedRun.js");
  for (const f of ["rows", "veins", "structures", "assays", "survey", "assayElements", "hasDensity", "gradeTrend", "collars", "hasTerrain", "describe", "target", "roleOf", "isCover", "intercepts"]) {
    assert.match(card, new RegExp(`\\b${f}\\b`), `GuidedTool: ${f}`); assert.match(mine, new RegExp(`\\b${f}\\b`), `guidedRun: ${f}`);
  }
  assert.ok(Buffer.byteLength(vm) <= 735000, `${Buffer.byteLength(vm)} bytes: the ViewerModule cap`);
});

// ---- add_block_model: the Result block's 'Add as block model' on the last model's lithology blocks
test("#3932c add_block_model: needs the last model's blocks (said when there are none); adds them through the Result block's own function; the protective wording comes back word for word; the revert removes only that block model", async () => {
  const removed = [];
  const none = await modelAction(() => ({ lastLithBlock: null, addLithBlockModel: async () => ({ ok: true }) }), { op: "block_model" });
  assert.equal(none.ok, false); assert.match(none.error, /^No model blocks yet: the Result block holds the last model's blocks once they are built/);
  const added = [];
  const ctx = { lastLithBlock: { title: "Top of SST", when: "10:42" }, removeVoxelModel: (id) => removed.push(id),
    addLithBlockModel: async () => { added.push(1); return { ok: true, id: "voxel_1", name: "Model units: Top of SST (10:42)", cells: 18240, units: ["SST", "SLT"],
      notes: ["Added the blocks as a block model: 18,240 cells (1 = SST, 2 = SLT). Cells above every top are left out.", "Mostly extrapolation: \"Top of SLT\" is 62% beyond its 3 pick(s) and 2 section line(s). The volume and thickness above are those surfaces extended, not measured; add contacts where the solid matters."] }; } };
  const r = await modelAction(() => ctx, { op: "block_model" });
  assert.equal(r.ok, true); assert.equal(r.changed, "block model"); assert.equal(r.id, "voxel_1"); assert.equal(r.cells, 18240); assert.deepEqual(r.units, ["SST", "SLT"]);
  assert.match(r.notes[0], /Cells above every top are left out\.$/); assert.match(r.notes[1], /^Mostly extrapolation: .* not measured; add contacts where the solid matters\.$/);
  assert.equal(added.length, 1); r.revert(); assert.deepEqual(removed, ["voxel_1"]);
  const declined = await modelAction(() => ({ ...ctx, addLithBlockModel: async () => ({ ok: false, error: "The user declined adding the blocks in GeoStrix (a very large model)." }) }), { op: "block_model" });
  assert.equal(declined.ok, false); assert.match(declined.error, /declined adding the blocks/);
  // the source: the button's function hands its result back, with the very notice it shows
  const vm = read("../src/modules/ViewerModule.jsx");
  assert.match(vm, /const addLithBlockModel = async \(\) => \{ \/\/ returns what it did, for an AI app's add_block_model/);
  assert.match(vm, /const vid = addVoxelModel\(\{ name: `Model units: \$\{lb\.title\} \(\$\{lb\.when\}\)`/);
  assert.match(vm, /return \{ ok: true, id: vid, name: `Model units: \$\{lb\.title\} \(\$\{lb\.when\}\)`, cells: cells\.length, units: stops\.map\(\(st\) => st\.label\), notes: \[done\.text, xn\?\.text\]\.filter\(Boolean\) \};/);
  assert.match(vm, /useMcpModelActions\(\(\) => \(\{.*lastLithBlock, addLithBlockModel, removeVoxelModel \}\), mode === "view"\);/);
  // the tool, in the protocol and the actions
  const d = proto.TOOLS.find((t) => t.name === "add_block_model");
  assert.ok(d); assert.equal(proto.isChangeTool(d), true); assert.equal(proto.isLongTool(d), true); assert.match(d.description, /^Makes a change in GeoStrix:/);
  assert.equal(proto.refuseArgs(d, {}), null); assert.equal(proto.refuseArgs(d, { x: 1 })?.message, "Unknown argument 'x'.");
  assert.ok(ACTIONS.add_block_model);
  const calls = [];
  const s = { undoCheckpoint() {}, goToModule() {} };
  const out = await runChange("add_block_model", {}, { getStore: () => s, client: "Claude Desktop", toast: () => {}, settle: async () => {}, actions: { add_block_model: async () => { const x = await modelAction(() => ctx, { op: "block_model" }); calls.push(x.ok); const { ok, revert, ...rest } = x; return { ok: true, data: rest, say: "added the blocks", revert }; } } });
  assert.equal(out.ok, true); assert.deepEqual(calls, [true]); assert.equal(out.data.cells, 18240);
});

// ---- suggest_trend: the trend helper's suggestion, read-only
const { runTool } = await import("../src/lib/mcpTools.js");
// vertical holes on a 5 x 5 grid 40 m apart; a lens of high grade that runs north-east to south-west, dipping steeply to the south-east: its high samples lie on a plane
function trendProject(over = {}) {
  const collars = holes.map((h) => ({ ...h, azimuth: 0, dip: -90, length: 100 }));
  const assays = [];
  for (const h of holes) for (let n = 0; n < 50; n++) {
    const x = h.x, y = h.y, z = -(n * 2 + 1);
    const planeD = (x - y) / Math.SQRT2 * Math.cos(0.3) + (z + 60) * Math.sin(0.3); // distance from a steep plane
    assays.push({ hole_id: h.hole_id, from: n * 2, to: n * 2 + 2, values: { Au: Math.abs(planeD) < 12 ? 2 + (n % 5) / 5 : 0.03 } });
  }
  const structure = ["fault", "fault", "fault", "fault"].map((v, i) => ({ hole_id: holes[i].hole_id, from: 10 + i, to: 10 + i, value: v, dip: 62 + i, azimuth: 135 + i }));
  return { project: { name: "Trend test" }, collars, survey: [], assays, assayElements: [{ symbol: "Au", unit: "g/t" }], layers: { litho: lithoRows, structure }, desurveyMethod: "minimum_curvature", ...over };
}
test("#3932c suggest_trend: the trend helper's candidates with their strength, reasons and warnings; what was read and what was not; a suggestion, not a fact", () => {
  const r = runTool("suggest_trend", { element: "au" }, trendProject());
  assert.equal(r.ok, true, JSON.stringify(r)); const d = r.data;
  assert.equal(d.element, "Au");
  assert.ok(d.candidates.length >= 1 && d.candidates.length <= 4);
  const fault = d.candidates.find((c) => c.source === "structures");
  assert.ok(fault, "the measured fault picks give a candidate"); assert.ok(["strong", "fair", "weak"].includes(fault.strength)); assert.match(fault.words, /tilts|upright|flat/); assert.match(fault.numbers, /^dip \d+° → \d{3}°$/); assert.ok(fault.reason.length > 10);
  assert.ok(d.candidates.every((c) => Array.isArray(c.warnings) && ["strong", "fair", "weak"].includes(c.strength)));
  assert.ok(d.suggested === null || d.suggested.suggested === true);
  assert.ok(d.sources_read.some((x) => /measured structure picks/.test(x)) && d.sources_read.some((x) => /Au samples at or above/.test(x)) && d.sources_read.some((x) => /assayed samples \(the drilling\)/.test(x)), d.sources_read.join(" | "));
  assert.deepEqual(d.not_read.slice(0, 3), ["modelled surfaces", "outcrop readings", "mapped contacts"]);
  assert.equal(d.note, "These are suggestions from your data, not facts: check them against what you know.");
  assert.ok(JSON.stringify(d).length < 8000, "a short answer");
  // without an element the grades are not read; a project with nothing to go on says so (the helper's own words)
  const noEl = runTool("suggest_trend", {}, trendProject()).data;
  assert.ok(!noEl.element && !noEl.sources_read.some((x) => /samples at or above/.test(x)));
  const bare = runTool("suggest_trend", {}, trendProject({ layers: { litho: [], structure: [] }, assays: [] })).data;
  assert.deepEqual(bare.candidates, []); assert.equal(bare.suggested, null); assert.match(bare.none, /Your data does not show a clear direction/);
  assert.match(runTool("suggest_trend", { element: "Zn" }, trendProject()).error, /^No element 'Zn' in this project's assays\. Available: Au/);
  assert.equal(runTool("suggest_trend", { element: "C:\\x" }, trendProject()).ok, false);
});

test("#3932c suggest_trend in the protocol: a read tool (no switch), strict schema, the element optional; it never writes", async () => {
  const d = proto.TOOLS.find((t) => t.name === "suggest_trend");
  assert.ok(d); assert.equal(proto.isChangeTool(d), false); assert.match(d.description, /^Read-only\./); assert.match(d.description, /suggestions from the data, not facts/);
  assert.equal(proto.refuseArgs(d, {}), null); assert.equal(proto.refuseArgs(d, { element: "Au" }), null);
  assert.equal(proto.refuseArgs(d, { element: "x".repeat(33) })?.message, "'element' is too long (at most 32 characters).");
  assert.equal(proto.refuseArgs(d, { element: "Au", more: 1 })?.message, "Unknown argument 'more'.");
  const { TOOL_NAMES } = await import("../src/lib/mcpTools.js");
  assert.ok(TOOL_NAMES.includes("suggest_trend"));
  const calls = [];
  const off = proto.createSession({ changesAllowed: () => false, askAllow: async () => "once", callTool: async (n, a, meta) => { calls.push([n, meta]); return { ok: true, data: { candidates: [] } }; } });
  await off.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", clientInfo: { name: "Claude Desktop" } } }));
  const r = JSON.parse(await off.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "suggest_trend", arguments: { element: "Au" } } }))).result;
  assert.equal(r.isError, false, "readable with the changes switch off"); assert.deepEqual(calls[0], ["suggest_trend", { client: "Claude Desktop" }], "an ordinary read: no change, no long wait");
  assert.equal(proto.TOOLS.filter(proto.isChangeTool).map((t) => t.name).sort().join(), Object.keys(ACTIONS).sort().join());
});
