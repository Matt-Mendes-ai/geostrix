// TASKS.csv #4053 (AI app access batch 4, Matt 2026-11-24: "let's keep adding AI tools to MCP", Modelling): build_fault (the Faults pane's own sheeted-planes build, modules/viewer/faultRun.js),
// model_from_map (the Model from map pane's own run, driven by components/useMcpMapModel.js), guide_status (read-only, lib/mcpGuide.js: the guide card's own readers). SYNTHETIC: made-up
// holes, a made-up pane, made-up map units; no project data.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { faultAction } from "../src/modules/viewer/mcpFaultRun.js";
import { mapModelAction, faultFeaturesOf } from "../src/components/useMcpMapModel.js";
import { runTool, TOOL_NAMES } from "../src/lib/mcpTools.js";
import { ACTIONS, CHANGE_TOOL_NAMES } from "../src/lib/mcpActions.js";

const require = createRequire(import.meta.url);
const proto = require("../electron/mcpProtocol.js");
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const quick = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 1)));

// ---- build_fault: vertical made-up holes from z 100 down to 0 (a trace is { hole_id, pts, wx, wy, wz }), FLT picks that agree on one plane dipping 60 towards 090
const hole = (hole_id, x, y) => ({ hole_id, pts: [{ md: 0 }, { md: 100 }], wx: [x, x], wy: [y, y], wz: [100, 0] });
// four holes off one line, one pick each, on the plane z = 70 - x tan(30): a flat plane dipping 30 towards 090
const spots = [["DH-1", 0, 0], ["DH-2", 60, 0], ["DH-3", 0, 60], ["DH-4", 60, 60]];
const picks = spots.map(([h, x]) => ({ hole_id: h, depth: 100 - (70 - x * Math.tan(Math.PI / 6)), value: "FLT", dip: 30, azimuth: 90 }));
const ctxOf = (over = {}) => {
  const added = [], removed = [];
  const c = { store: { layers: { structure: picks }, terrain: null, sections: [] }, removeSurfaces: (ids) => removed.push(ids), added, removed,
    faults: { traces: () => spots.map(([h, x, y]) => hole(h, x, y)), surfaceStructures: [], mapLayers: [], addSurface: (m) => { added.push(m); return `impl_${added.length}`; } }, ...over };
  return c;
};

test("#4053 build_fault: the pane's own planes from the logged picks; each sheet a surface, its fit and dip back; the revert takes out exactly those", () => {
  const c = ctxOf();
  const r = faultAction(c, { name: "Shear" });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.changed, r.built.length === 1 ? "fault surface" : "fault surfaces");
  assert.equal(r.shape, "sheeted planes"); assert.equal(r.extent, "box");
  assert.ok(r.built.every((n) => n.startsWith("Fault: Shear")), r.built.join());
  assert.equal(c.added.length, r.built.length); assert.deepEqual(r.ids, c.added.map((_, i) => `impl_${i + 1}`));
  assert.ok(c.added.every((m) => m.type === "fault" && m.params.tool === "Faults pane: sheeted planes" && m.params.faultEvidence.shape === "planes"), "registered as the pane registers a sheet");
  const s0 = r.sheets[0];
  assert.ok(Math.abs(s0.dip - 30) <= 1 && Math.abs(s0.dip_direction - 90) <= 1, `a flat plane at 30 -> 090: ${s0.dip} -> ${s0.dip_direction}`);
  assert.ok(s0.typical_miss_m < 0.5, "the points lie on it");
  assert.equal(r.evidence[0], "oriented fault picks: 4 points");
  assert.ok(r.notes.some((n) => /extrapolated, not observed/.test(n)), "through the box: said");
  assert.doesNotMatch((r.warnings || []).join(" "), /fit (its|their) points well/, "a plane that fits is not doubted (four points are still said to be a guess)");
  r.revert({}); assert.deepEqual(c.removed, [r.ids]);
  const other = faultAction(ctxOf(), {}); assert.ok(other.built[0].startsWith("Fault: Fault 1"), "the pane's default name");
  const fin = faultAction(ctxOf(), { extent: "finite", margin_m: 150 }); assert.equal(fin.ok, true, fin.error); assert.equal(fin.extent, "finite"); assert.equal(fin.margin_m, 150);
});

test("#4053 build_fault refuses with the pane's own verdicts: no evidence, an unknown kind, lines that are each their own fault, points on one line (a dip given then builds)", () => {
  const none = faultAction(ctxOf({ store: { layers: {}, terrain: null, sections: [] } }), {});
  assert.equal(none.ok, false); assert.match(none.error, /^No fault evidence yet: the Faults pane reads oriented fault picks/);
  assert.match(faultAction(ctxOf(), { evidence: ["bogus"] }).error, /Unknown evidence 'bogus'.*This project holds: oriented fault picks: 4 points/);
  assert.match(faultAction(ctxOf(), { evidence: ["logged"] }).error, /^No logged fault intervals in this project\. It holds: oriented fault picks: 4 points/);
  assert.match(faultAction(ctxOf(), { extent: "until" }).error, /'extent' is 'box'/);
  assert.match(faultAction(ctxOf(), { dip: 60 }).error, /'dip' and 'dip_direction' together/);
  assert.match(faultAction(ctxOf(), { dip: 120, dip_direction: 10 }).error, /0 to 90 degrees/);
  // two mapped lines: each is its own fault
  const lines = ctxOf({ faults: { ...ctxOf().faults, mapLayers: [{ id: "m1", name: "Faults", geomType: "polyline", features: [{ attributes: { type: "Fault" }, parts: [[[0, 0], [0, 900]]] }, { attributes: { type: "Fault" }, parts: [[[400, 0], [400, 900]]] }] }] } });
  const two = faultAction({ ...lines, store: { layers: {}, terrain: null, sections: [] } }, { evidence: ["mapped"] });
  assert.equal(two.ok, false);
  assert.match(two.error, /each line is likely its own fault|^No fault evidence yet/);
  // one logged interval down one vertical hole: its points lie on one line
  const one = ctxOf({ store: { layers: { litho: [{ hole_id: "DH-1", from: 40, to: 42, value: "FLT" }] }, terrain: null, sections: [] } });
  const line = faultAction(one, { evidence: ["logged"] });
  assert.equal(line.ok, false); assert.match(line.error, /points on one line; give a dip\. Give 'dip' and 'dip_direction'/);
  const dipped = faultAction(one, { evidence: ["logged"], dip: 70, dip_direction: 90 });
  assert.equal(dipped.ok, true, dipped.error); assert.match((dipped.warnings || []).join(" "), /A guess: few points or one hole/);
});

test("#4053 build_fault says in words when a sheet does not fit its points: a typical miss over the Faults pane's own Check distance (10 m), and the pane's Check starts at the same number", () => {
  // the same four picks, but their depths scattered 40 m either side of the plane and one sheet allowed (sheet_gap_m 1000): the points do not lie on one flat plane
  const off = [40, -40, 35, -35];
  const c = ctxOf({ store: { layers: { structure: picks.map((p, i) => ({ ...p, depth: p.depth + off[i] })) }, terrain: null, sections: [] } });
  const r = faultAction(c, { sheet_gap_m: 1000 });
  assert.equal(r.ok, true, r.error);
  const w = (r.warnings || []).join(" ");
  assert.match(w, /(This sheet doesn't|sheets don't) fit (its|their) points well \(typical miss over 10 m, the Faults pane's own Check distance\)/, w);
  assert.match(w, /Do not present (it|them) as a good fault/);
  const bad = r.sheets.filter((s) => s.typical_miss_m > 10); assert.ok(bad.length >= 1, "the numbers agree with the words");
  const fr = read("../src/modules/viewer/faultRun.js"), fb = read("../src/modules/viewer/FaultBuilder.jsx");
  assert.match(fr, /export const FAULT_CHECK_M = 10;/); assert.match(fb, /const \[checkN, setCheckN\] = useState\(FAULT_CHECK_M\);/);
  assert.match(read("../src/modules/viewer/mcpFaultRun.js"), /typicalMissM > FAULT_CHECK_M/);
});

// ---- model_from_map: a made-up pane (the getter the panel passes), its own Build button, and the stores the run adds to
function stubPane(over = {}) {
  const st = { polys: [{ id: "m1", name: "Geology" }, { id: "m2", name: "Older map" }], lines: [{ id: "l1", name: "Faults", features: [{ attributes: { type: "Thrust fault" } }, { attributes: { type: "Normal fault" } }, { attributes: { type: "Road" } }] }, { id: "l2", name: "Roads", features: [{ attributes: { t: "road" } }] }],
    layer: { id: "m1", name: "Geology" }, unitField: "UNIT", faultLayer: null, faults: [], faultPlan: null, faultPick: null, plan: null, ageSug: { use: true }, byAge: true, orderFrom: "age", order: ["Upper", "Middle", "Lower"], relation: "onlap",
    groundAt: true, noOrient: false, busy: false, fit: null, noMapMsg: "NO MAP MESSAGE", noTerrainMsg: "NO TERRAIN MESSAGE", fewUnitsMsg: "FEW UNITS MESSAGE", noOrientMsg: "NO ORIENTATION MESSAGE", calls: [], ...over };
  st.setLayerId = (id) => { st.calls.push(["layer", id]); const l = st.polys.find((x) => x.id === id); st.layer = { id, name: l.name }; };
  st.setFaultLayerId = (id) => { st.calls.push(["faultLayer", id]); st.faultLayer = st.lines.find((l) => l.id === id) || null; st.faults = st.faultLayer ? [{ i: 0, name: "Fault 1", on: true }, { i: 1, name: "Fault 2", on: true }] : []; if (over.manyFaults && id) st.faultPlan = { before: 9 }; };
  st.takeFaults = () => { st.calls.push(["pick"]); st.faultPlan = null; st.faultPick = { keep: 1, before: 2 }; st.faults = [{ i: 0, name: "Fault 1", on: true }, { i: 1, name: "Fault 2", on: false }]; };
  st.setRelation = (r) => { st.calls.push(["relation", r]); st.relation = r; };
  st.setOrderFrom = (o) => { st.calls.push(["orderFrom", o]); st.orderFrom = o; st.byAge = o === "age"; };
  const surfaces = [{ id: "old", name: "An older surface" }], rasters = [], notices = [];
  const button = { disabled: false, clicks: 0, click() { button.clicks++; st.busy = true; setTimeout(() => { surfaces.push({ id: "s1", name: "Top of Middle" }, { id: "s2", name: "Top of Lower" }); rasters.push({ id: "r1" }, { id: "r2" }); notices.push({ message: "Terrain under 40 of 40 contact point(s)." }); st.busy = false; st.fit = over.fit === undefined ? { overall: 0.44, units: [{ unit: "Upper", pct: 0.88 }, { unit: "Middle", pct: 0.4, modelledAs: "Upper" }], unscored: ["Z"], differ: 12 } : over.fit; }, 25); } };
  const doc = { querySelector: (q) => (q === '[data-mcp="map-run"]' && !over.noButton ? button : null) };
  const removed = [], removedRasters = [];
  return { st, button, surfaces, rasters, env: { sleep: quick, doc, getSurfaces: () => surfaces, getRasters: () => rasters, getNotices: () => notices, removeSurfaces: () => (ids) => removed.push(ids) }, removed, removedRasters };
}
const run = (pane, p = {}) => mapModelAction(() => pane.st, p, pane.env);

test("#4053 model_from_map: the pane's own defaults (the map's ages, Conformable, the line layer with the most faults), the pane's Build pressed, the fit card's numbers back, the revert takes out its surfaces and pictures", async () => {
  const pane = stubPane();
  const r = await run(pane);
  assert.equal(r.ok, true, r.error);
  assert.equal(pane.button.clicks, 1);
  assert.deepEqual(pane.st.calls, [["faultLayer", "l1"]], "nothing else set: the pane's own choices");
  assert.equal(r.order_from, "the map's ages"); assert.equal(r.relation, "Conformable"); assert.deepEqual(r.order, ["Upper", "Middle", "Lower"]);
  assert.deepEqual(r.faults, ["Fault 1", "Fault 2"]);
  assert.deepEqual(r.built, ["Top of Middle", "Top of Lower"]); assert.deepEqual(r.ids, ["s1", "s2"]); assert.deepEqual(r.raster_ids, ["r1", "r2"]);
  assert.equal(r.fit.matches_the_map_percent, 44);
  assert.deepEqual(r.fit.per_unit, [{ unit: "Upper", percent: 88 }, { unit: "Middle", percent: 40, mostly: "Upper" }]);
  assert.deepEqual(r.fit.not_scored, ["Z"]); assert.equal(r.fit.cells_that_differ, 12);
  assert.match(r.notes[0], /Terrain under 40 of 40/);
  const st = { rasters: [{ id: "r1" }, { id: "rX" }], removeRaster: (id) => pane.removedRasters.push(id) };
  r.revert(st);
  assert.deepEqual(pane.removed, [["s1", "s2"]], "exactly the surfaces the run added"); assert.deepEqual(pane.removedRasters, ["r1"], "and the pictures it drew that are still there");
});

test("#4053 model_from_map: the call chooses the relation, the order and the faults; more faults than GemPy takes go through the pane's Pick for me", async () => {
  const pane = stubPane({ manyFaults: true });
  const r = await run(pane, { map: "older map", order_from: "bedding", relation: "Erosional", faults: "Faults" });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(pane.st.calls, [["layer", "m2"], ["orderFrom", "bedding"], ["relation", "erode"], ["faultLayer", "l1"], ["pick"]]);
  assert.equal(r.relation, "Erosional"); assert.equal(r.order_from, "bedding younging"); assert.equal(r.map, "Older map");
  assert.deepEqual(r.faults, ["Fault 1"]); assert.equal(r.faults_picked, "1 of 2: the pane's Pick for me");
  const none = stubPane(); const n = await run(none, { faults: "none" });
  assert.equal(n.ok, true); assert.deepEqual(none.st.calls, []); assert.deepEqual(n.faults, []);
  const noFit = stubPane({ fit: null }); const f = await run(noFit);
  assert.equal(f.ok, true); assert.match(f.fit.note, /No fit was scored/);
});

test("#4053 model_from_map refuses with the pane's own words: no map, no terrain, too few units, no orientation, a cut to take, one at a time; and what the call named wrongly", async () => {
  const msg = async (over, p) => { const pane = stubPane(over); const r = await run(pane, p); assert.equal(r.ok, false); assert.equal(pane.button.clicks, 0, "nothing was started"); return r.error; };
  assert.equal(await msg({ polys: [] }), "NO MAP MESSAGE");
  assert.equal(await msg({ groundAt: false }), "NO TERRAIN MESSAGE");
  assert.equal(await msg({ order: ["Only"] }), "FEW UNITS MESSAGE");
  assert.equal(await msg({ noOrient: true }), "NO ORIENTATION MESSAGE");
  assert.match(await msg({ plan: { merge: {} }, order: Array.from({ length: 20 }, (_, i) => `U${i}`) }), /has 20 units and GemPy takes at most 16\. Model from map is open in GeoStrix with its offer/);
  assert.match(await msg({ busy: true }), /Another model is running in GeoStrix: one at a time/);
  assert.match(await msg({ noButton: true }), /would not start with these settings/);
  assert.match(await msg({}, { map: "nope" }), /No geological map 'nope'.*Geology, Older map/);
  assert.match(await msg({}, { relation: "Both" }), /'relation' is 'Conformable'/);
  assert.match(await msg({}, { order_from: "x" }), /'order_from' is 'age'/);
  assert.match(await msg({ ageSug: { use: false }, byAge: false, orderFrom: "bedding" }, { order_from: "age" }), /does not give ages for most of its units/);
  assert.match(await msg({}, { faults: "Rivers" }), /No line layer 'Rivers'.*Faults, Roads/);
  const cancelled = stubPane(); cancelled.button.click = () => { cancelled.button.clicks++; cancelled.st.busy = true; setTimeout(() => { cancelled.st.busy = false; }, 10); };
  const c = await run(cancelled); assert.equal(c.ok, false); assert.match(c.error, /Nothing was built: it was cancelled/);
  const expired = stubPane(); const e = await mapModelAction(() => expired.st, {}, { ...expired.env, expired: () => true }); assert.equal(e.ok, false); assert.equal(expired.button.clicks, 0, "a call refused already never starts a run later");
  assert.equal(faultFeaturesOf({ features: [{ attributes: { a: "Shear zone" } }, { attributes: { a: "Contact" } }, { attributes: { a: "thrust" } }] }), 2);
});

// ---- guide_status: read-only, from the guide card's own readers, on two projects at different stages
const logs = (hs) => hs.flatMap((h) => [{ hole_id: h, from: 0, to: 10, value: "TILL" }, { hole_id: h, from: 10, to: 40, value: "SST" }, { hole_id: h, from: 40, to: 70, value: "SLT" }, { hole_id: h, from: 70, to: 100, value: "GRN" }]);
const six = ["H1", "H2", "H3", "H4", "H5", "H6"].map((h, i) => ({ hole_id: h, x: (i % 3) * 50, y: Math.floor(i / 3) * 50, z: 100, length: 100, azimuth: 0, dip: -90 }));
const logged = { project: {}, collars: six, survey: [], layers: { litho: logs(six.map((c) => c.hole_id)) }, assays: [], assayElements: [], sections: [] };
const mapOnly = { project: {}, collars: [], survey: [], layers: {}, assays: [], assayElements: [], sections: [], terrain: { id: "t", bbox: [0, 0, 10, 10] },
  mapLayers: [{ id: "m1", name: "Geology", geomType: "polygon", styleField: "UNIT", features: ["A", "B", "C"].map((u) => ({ attributes: { UNIT: u } })) }] };

test("#4053 guide_status: each step done / next / waiting / not needed with its reason, the suggested route and why, the one question; on a logged project and a map-only project", () => {
  assert.ok(TOOL_NAMES.includes("guide_status"));
  const a = runTool("guide_status", {}, logged);
  assert.equal(a.ok, true, a.error);
  const d = a.data;
  assert.deepEqual(d.steps.map((s) => s.id), ["data", "area", "rocks", "build", "faults", "grade", "check"]);
  assert.ok(d.steps.every((s) => ["done", "next", "waiting", "not_needed", "skipped"].includes(s.state)));
  assert.equal(d.steps[0].state, "done"); assert.equal(d.steps[2].state, "next", "the rocks are the next thing to do");
  assert.equal(d.next_step.id, "rocks");
  assert.equal(d.suggested_route.route, "computed"); assert.match(d.suggested_route.reason, /compute\./); assert.deepEqual(d.suggested_route.routes_open, ["computed", "drawn"]);
  assert.equal(d.project_holds.holes, 6); assert.equal(d.project_holds.surfaces_built, 0);
  assert.equal(d.steps[4].state, "not_needed"); assert.match(d.steps[4].reason, /Not needed for this data|No fault evidence/); // faults and veins: no evidence, no vein to build
  const b = runTool("guide_status", {}, mapOnly).data;
  assert.equal(b.suggested_route.route, "map"); assert.match(b.suggested_route.reason, /No logs: build from the map's 3 units\./);
  assert.equal(b.steps[2].state, "not_needed", "the order of rocks down the holes is not needed for a map"); assert.match(b.steps[2].reason, /Not needed for this data/);
  assert.equal(b.next_step.id, "build"); assert.equal(b.question, undefined, "one route open: nothing to choose, so the card asks nothing");
  assert.equal(b.project_holds.holes, 0); assert.equal(b.project_holds.map_units, 3); assert.equal(b.project_holds.terrain, true);
  // the rocks stacked in the holes' order: the guide moves on to 'Compute or draw?' and would ask it, suggesting the route the data favour
  const c = runTool("guide_status", {}, { ...logged, stratStack: { units: ["TILL", "SST", "SLT", "GRN"], faults: [] } }).data;
  assert.equal(c.steps[2].state, "done"); assert.equal(c.next_step.id, "build");
  assert.equal(c.question.text, "Compute or draw?"); assert.equal(c.question.suggested_answer, "compute it from the logs");
  // the user's own skips are said as theirs
  const s = runTool("guide_status", {}, { ...logged, modelGuide: { skipped: ["faults"] } }).data;
  assert.equal(s.steps[4].state, "skipped"); assert.deepEqual(s.skipped_by_you, ["faults"]);
  assert.equal(runTool("guide_status", { x: 1 }, logged).ok, true, "no argument is needed");
});

test("#4053 the three tools in the schemas: the changes say 'Makes a change in GeoStrix:' and are change tools, model_from_map is long, build_fault is not, guide_status is a read; the actions and the readers are in step", () => {
  const by = Object.fromEntries(proto.TOOLS.map((t) => [t.name, t]));
  for (const n of ["build_fault", "model_from_map"]) { assert.match(by[n].description, /^Makes a change in GeoStrix: /, n); assert.equal(proto.isChangeTool(by[n]), true, n); assert.equal(by[n].inputSchema.additionalProperties, false, n); }
  assert.equal(by.model_from_map._meta["geostrix/long"], true); assert.equal(by.build_fault._meta, undefined);
  assert.match(by.model_from_map.description, /'started' with a job_id/); assert.match(by.model_from_map.description, /the toast's Undo in GeoStrix removes exactly them/);
  assert.match(by.build_fault.description, /the toast's Undo in GeoStrix removes exactly them/);
  assert.match(by.guide_status.description, /^Read-only\./); assert.equal(proto.isChangeTool(by.guide_status), false);
  assert.deepEqual(Object.keys(by.model_from_map.inputSchema.properties), ["map", "order_from", "relation", "faults"]);
  assert.deepEqual(by.model_from_map.inputSchema.properties.relation.enum, ["Conformable", "Erosional"]);
  assert.deepEqual(by.build_fault.inputSchema.properties.evidence.items.enum, ["pick", "logged", "outcrop", "mapped", "drawn", "string"]);
  assert.ok(CHANGE_TOOL_NAMES().includes("build_fault") && CHANGE_TOOL_NAMES().includes("model_from_map"));
  assert.deepEqual(CHANGE_TOOL_NAMES().sort(), proto.TOOLS.filter(proto.isChangeTool).map((t) => t.name).sort(), "every change tool has its action");
  assert.deepEqual(Object.keys(ACTIONS).filter((n) => /^(build_fault|model_from_map)$/.test(n)).length, 2);
  assert.equal(proto.TOOLS.length, 37);
});

test("#4053 wiring: the pane's own build and run are what the tools call; the pane says its refusals in the same words; the snapshot carries what the guide reads; the sites and the policy list the tools", () => {
  const panel = read("../src/components/MapModelPanel.jsx");
  assert.match(panel, /useMcpMapModel\(\(\) => \(\{ polys, lines, layer, unitField, setLayerId, setFaultLayerId, faultLayer, faults, faultPlan, faultPick, takeFaults, plan, ageSug, byAge, orderFrom, setOrderFrom, order, relation, setRelation, groundAt: !!groundAt, noOrient: !!noOrient, busy, fit, noMapMsg, noTerrainMsg, fewUnitsMsg, noOrientMsg \}\)\);/);
  for (const k of ["noMapMsg", "noTerrainMsg", "fewUnitsMsg", "noOrientMsg"]) assert.match(panel, new RegExp(`\\{${k}\\}</div>`), `${k} is what the pane shows`);
  assert.match(panel, /data-mcp="map-run" disabled=\{busy \|\| !groundAt \|\| order\.length < 2 \|\| noOrient\}/);
  assert.match(panel, /<button onClick=\{\(\) => onRun\(\{ layer: effLayer/, "the Build button still calls the run itself");
  const hook = read("../src/modules/viewer/useMcpModelActions.js");
  assert.match(hook, /if \(p\.op === "map_model"\) return viaMapPane\(c, p\);/); assert.match(hook, /if \(p\.op === "fault"\) return \(await import\("\.\/mcpFaultRun\.js"\)\)\.faultAction\(c\(\), p\);/);
  assert.match(hook, /api\?\.openPane\?\.\("mapmodel", true\)/);
  assert.match(read("../src/modules/viewer/FaultBuilder.jsx"), /buildFaultPlanes\(\{ faults, extent, marginM, gapM, other, dips, terrain, traces: tracesRef\?\.current \|\| \[\], addSurface: addWorldMeshSurface, msgs \}\)/);
  const acts = read("../src/lib/mcpActions.js");
  assert.match(acts, /async build_fault\(a, s\) \{\n\s*const r = await viaModule\(s, "viewer", "mcp-model", \{ op: "fault"/); assert.match(acts, /async model_from_map\(a, s\) \{\n\s*const r = await viaModule\(s, "viewer", "mcp-model", \{ op: "map_model"/);
  const app = read("../src/App.jsx");
  for (const k of ["mapLayers", "terrain", "explicitSurfaces", "generatedSurfaces", "stratStack", "modellingCodes", "lithoGroups", "surfaceStructures", "rasters", "modelGuide"]) assert.match(app, new RegExp(`${k}: s\\.${k}`), `the snapshot carries ${k}`);
  assert.match(read("../src/lib/mcpTools.js"), /TOOLS\.guide_status = \(snap\) => guideStatusTool\(snap\);/);
  for (const f of ["../PRIVACY.md", "../website/privacy.html", "../website/es/privacy.html", "../website/fr/privacy.html", "../website/pt-br/privacy.html", "../website/ar/privacy.html"]) {
    const t = read(f);
    assert.match(t, /(fault|falla|faille|falha|صدع)/i, `${f}: lists the fault tool`);
    assert.match(t, /(Model from map|Modelo desde mapa|Modèle à partir de la carte|Modelo a partir do mapa|النموذج من الخريطة)/, `${f}: lists the model from the map`);
  }
});
