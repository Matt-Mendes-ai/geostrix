// TASKS.csv #3137 (the rest of #3064 / #2982, WA iron) — the level plan is built a slice at a time in modules/viewer/levelPlanBuild.js (loaded
// with the window, not at startup): the busiest-RL pick reads the holes only, a newer RL cancels the build under way, and the path text is
// written without toFixed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { planBuild, planBuildNow, runSliced, PLAN_HOLE_STEP } from "../src/modules/viewer/levelPlanBuild.js";
import { busiestRl } from "../src/lib/levelPlan.js";

// n vertical holes 100 m deep from collars at 400 m, a log every 10 m, an assay every 2 m
function ctxOf(n) {
  const traces = [], intervals = [], points = [];
  for (let h = 0; h < n; h++) {
    const id = `H${h}`, pts = [], wx = [], wy = [], wz = [];
    for (let md = 0; md <= 100; md += 10) { pts.push({ md }); wx.push(h * 25); wy.push(0); wz.push(400 - md); }
    traces.push({ hole_id: id, pts, wx, wy, wz });
    for (let d = 0; d < 100; d += 10) intervals.push({ hole_id: id, layer: "litho", from: d, to: d + 10, color: d < 50 ? "#aa0000" : "#00aa00", label: d < 50 ? "BIF" : "SH" });
    for (let d = 0; d < 100; d += 2) points.push({ hole_id: id, md: d + 1, color: "#333", label: `Fe ${50 + (d % 7)}`, assay: { from: d, to: d + 2, sym: "Fe" } });
  }
  let primsCalls = 0;
  return {
    get primsCalls() { return primsCalls; },
    traces, visibleHoles: {}, cache: { current: null }, layerVisible: {}, layers: {},
    layerPrimitivesFor: () => { primsCalls++; return { intervals, points }; },
    isRowVisible: () => true, effectiveColor: () => "#000", effectiveLabel: (k, v) => v,
    voxelModels: [], voxelCellShown: () => true, colorForVoxelValue: () => "#000", origin: { x: 0, y: 0, z: 0 }, implicitSurfaces: [], implicitMeshes: {},
    plannedHoles: [], plannedHoleTrace: () => null, assayLegend: () => [], projectValues: () => [],
  };
}

test("the busiest-RL pick reads the holes only: no layer primitives, no slab, the same RL a full build gives", () => {
  const ctx = ctxOf(50);
  const holesOnly = planBuildNow(ctx, 350, 12.5, { holesOnly: true });
  assert.equal(ctx.primsCalls, 0, "the layers' primitives are not built for the pick");
  assert.equal(holesOnly.holes.length, 50);
  assert.ok(holesOnly.holes.every((h) => h.trace.length && !h.runs && !h.pierce));
  const full = planBuildNow(ctx, 350, 12.5);
  assert.equal(busiestRl(holesOnly.holes), busiestRl(full.holes));
});

test("the full build: the slab's runs, clipped logs, points and pierce points; the primitives kept between RLs", () => {
  const ctx = ctxOf(20);
  const p = planBuildNow(ctx, 355, 5); // the slab 350-360: md 40-50
  assert.equal(p.holes.length, 20);
  assert.ok(p.holes.every((h) => h.runs.length === 1 && h.pierce.length === 1));
  assert.ok(p.intervals.length >= 20 && p.intervals.every((iv) => iv.lines.length));
  assert.ok(p.points.length >= 20 * 5 && p.points.every((pt) => pt.md >= 40 - 1e-9 && pt.md <= 50 + 1e-9));
  assert.equal(p.holes[0].pierce[0].logs[0].label, "BIF", "the log at the pierce point (the assay layer follows it)");
  planBuildNow(ctx, 300, 5);
  assert.equal(ctx.primsCalls, 1, "an RL step reuses the primitives (#2982)");
});

test("it pauses: 6,000 holes give many steps with a growing progress; a cancelled run resolves null", async () => {
  const ctx = ctxOf(6000), g = planBuild(ctx, 350, 12.5), prog = [];
  let r = g.next();
  while (!r.done) { prog.push(r.value); r = g.next(); }
  assert.ok(prog.length >= (2 * 6000) / PLAN_HOLE_STEP, `${prog.length} pauses`);
  assert.ok(prog.every((v, i) => typeof v === "number" && v >= 0 && v <= 1 && (i === 0 || v >= prog[i - 1] - 1e-9)), "a fraction that only grows");
  assert.equal(r.value.holes.length, 6000);
  let stop = false;
  const p = runSliced(planBuild(ctxOf(500), 350, 12.5), { sliceMs: 0, cancelled: () => stop });
  stop = true;
  assert.equal(await p, null);
  const done = await runSliced(planBuild(ctxOf(30), 350, 12.5), { sliceMs: 1 });
  assert.equal(done.holes.length, 30);
});

test("the path numbers: one decimal as toFixed gave, without toFixed", async () => {
  const src = fs.readFileSync(new URL("../src/lib/levelPlanDraw.js", import.meta.url), "utf8");
  const m = src.match(/const f1 = (\(v\) => \{[^\n]*\});/);
  assert.ok(m, "f1 is the integer form");
  const f1 = eval(m[1]);
  for (const v of [0, 0.04, 0.05, 1.25, 12.34, 123456.789, -3.21, -0.4, 99.95, 640.1]) assert.equal(f1(v), Math.abs(v) < 0.05 ? "0.0" : v.toFixed(1), String(v));
  assert.equal(f1(-0.02), "0.0", "not '-0.0'");
});

test("wiring: ViewerModule hands the window its context, with no eager import of the build; the window builds it sliced", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(!/from "\.\.\/lib\/levelPlan\.js"/.test(v), "lib/levelPlan.js is not in ViewerModule's (startup) imports");
  assert.ok(!/import[^\n]*levelPlanBuild/.test(v), "nor the build");
  assert.match(v, /planCtx=\{planCtx\}/);
  const w = fs.readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8");
  assert.match(w, /import \{ planBuild, runSliced, hiddenPlanLayers \} from "\.\.\/modules\/viewer\/levelPlanBuild\.js";/);
  assert.match(w, /runSliced\(planBuild\(ctxRef\.current\(\), r0, 12\.5, \{ holesOnly: true \}\)/);
  assert.match(w, /cancelled: \(\) => buildGen\.current !== gen \}\)/);
});
