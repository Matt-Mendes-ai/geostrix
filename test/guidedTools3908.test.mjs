// TASKS.csv #3908 (batch P7a) — the guided modelling tools in StrixViewer: the questions answered from the logs (lib/auto/autoUnits.js), the
// shared shell (viewer/guided/), its lazy loading and its one-line hooks. Synthetic logs only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { stackOrder, suggestCover, suggestBody } from "../src/lib/auto/autoUnits.js";

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// ten holes: cover, then three layers; a dyke inside the sandstone in the odd holes and inside the siltstone in every third
function logs() {
  const rows = [];
  for (let h = 0; h < 10; h++) {
    let d = 0;
    const add = (value, t) => { rows.push({ hole_id: `L${h}`, from: d, to: d + t, value }); d += t; };
    add("TILL", 5 + (h % 3)); add("SST", 20); if (h % 2) { add("DYK", 3); add("SST", 5); } add("SLT", 30); if (h % 3 === 0) { add("DYK", 4); add("SLT", 6); } add("CGL", 25);
  }
  return rows;
}

test("the layers: the rocks in a steady order, top first; a rock inside another is a body, not a layer", () => {
  const s = stackOrder(logs());
  assert.deepEqual(s.order, ["TILL", "SST", "SLT", "CGL"]);
  assert.deepEqual(s.bodies, ["DYK"]);
  assert.equal(s.holeCount, 10);
  assert.equal(suggestBody(logs()).unit, "DYK");
  assert.match(suggestBody(logs()).reason, /^DYK lies inside another rock .* in 7 of its 7 holes/);
  // a rock cut by fewer than three holes is neither
  assert.ok(!stackOrder(logs().filter((r) => r.hole_id === "L0" || r.hole_id === "L1")).order.length);
});

test("the cover: the code that starts the holes, its words a hint only", () => {
  const c = suggestCover(logs());
  assert.equal(c.unit, "TILL");
  assert.match(c.reason, /starts 100 % of the holes and its name or description reads like cover/);
  const plain = logs().map((r) => ({ ...r, value: r.value === "TILL" ? "U1" : r.value }));
  assert.match(suggestCover(plain).reason, /^U1 starts 100 % of the holes: the top of the drilled column\.$/);
  assert.equal(suggestCover([]), null);
});

test("the shell: lazy, behind one Basic Model button; ViewerModule has one-line hooks", () => {
  const vm = rd("src/modules/ViewerModule.jsx");
  assert.match(vm, /const GuidedTool = React\.lazy\(\(\) => import\("\.\/viewer\/guided\/GuidedTool\.jsx"\)\);/);
  assert.match(vm, /const \[guided, setGuided\] = useState\(null\); useModuleAction\(\["guided-open"\], \(a, p\) => setGuided\(p\?\.tool \|\| "start"\)\);/);
  assert.match(vm, /\{guided && mode === "view" && <Suspense fallback=\{null\}><GuidedTool tool=\{guided\} setTool=\{setGuided\} api=\{\{ runStackModel, runImplicitModel, runVeinModel, runStructuralModel, computeIntercepts, modelResolution, setModelResolution, busy: implicitBusy \|\| veinBusy \|\| numericBusy,/);
  assert.doesNotMatch(vm, /^import .*guided/m); // nothing of it in the startup chunk
  const vp = rd("src/modules/viewer/ViewerParts.jsx");
  assert.doesNotMatch(vp, /^import .*guided/m);
  assert.match(vp, /requestModuleAction\("guided-open", \{ tool: id \}\)/);
  const menu = [...vp.match(/const GUIDED_MENU = \[(.*)\];/)[1].matchAll(/\["([a-z]+)", "([^"]+)"\]/g)].map((m) => m[1]);
  const tools = rd("src/modules/viewer/guided/guidedTools.js");
  for (const id of menu.slice(1)) assert.match(tools, new RegExp(`id: "${id}"`), id);
  assert.equal(menu[0], "start");
  const shell = rd("src/modules/viewer/guided/GuidedTool.jsx");
  for (const s of ["Build it for me", "What I chose and why", "Change these", "Your data cannot support this yet", "Start here"]) assert.ok(shell.includes(`tr("${s}")`), s);
  assert.match(shell, /\(a, v\) => a\.setModelResolution\(v\.resolution\)/); // default: autoSurface's resolution (a tool may bring its own, #3909) // the size and detail from lib/auto/autoSurface.js
  assert.match(shell, /disabled=\{api\.busy \|\|/); // one heavy run at a time
});

test("every sentence of the guided tools has a key in each language", () => {
  const dir = new URL("../src/modules/viewer/guided/", import.meta.url);
  const src = [...readdirSync(dir).map((f) => readFileSync(new URL(f, dir), "utf8")), rd("src/lib/auto/autoUnits.js")].join("\n");
  const keys = [...src.matchAll(/\btr\("((?:[^"\\]|\\.)*)"|\b(?:title|line|sentence|question): "((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1] ?? m[2]}"`));
  assert.ok(keys.length >= 20);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(rd(`src/locales/${lang}.json`));
    assert.deepEqual(keys.filter((k) => !d[k]), [], lang);
  }
});

test("the order follows each pair's majority: a rock cut by more holes does not outrank the one above it", () => {
  // UPPER (6 holes) lies over WIDE (all 12) wherever both are logged; WIDE also lies over many others, so it would win a plain tally
  const rows = [];
  for (let h = 0; h < 12; h++) {
    let d = 0;
    const add = (value, t) => { rows.push({ hole_id: `P${h}`, from: d, to: d + t, value }); d += t; };
    if (h < 6) add("UPPER", 10);
    add("WIDE", 10); add("A", 5); add("B", 5); add("C", 5);
  }
  const s = stackOrder(rows);
  assert.deepEqual(s.order.slice(0, 2), ["UPPER", "WIDE"]);
});

test("#3908 Intrusions and bodies: one rock, suggested from the logs, built by the implicit run", async () => {
  const { BODIES, GUIDED_TOOLS } = await import("../src/modules/viewer/guided/guidedTools.js");
  assert.ok(GUIDED_TOOLS.includes(BODIES));
  const ctx = { rows: logs(), roleOf: (u) => (u === "DYK" ? "dyke" : "stratigraphic"), intercepts: () => [{ unit: "DYK", hole_id: "L1" }, { unit: "SST", hole_id: "L1" }] };
  assert.equal(BODIES.suggest(ctx).value, "DYK");
  assert.deepEqual(BODIES.contacts(ctx, "DYK"), [{ unit: "DYK", hole_id: "L1" }]);
  assert.match(BODIES.check(ctx, ""), /Choose a rock first/);
  assert.equal(BODIES.check(ctx, "DYK"), null);
  assert.match(BODIES.check(ctx, "SST"), /reads SST as a layered rock, so it would draw its top, not a body/); // the live finding on WA lode gold
  assert.deepEqual(BODIES.notes(ctx), []);
  const calls = [];
  const plain = { target: (v) => v }, coded = { target: (v) => `mcode:${v}` };
  BODIES.run({ runImplicitModel: (u) => calls.push(["run", u]) }, "DYK", plain);
  BODIES.prefill({ setImplicitTarget: (u) => calls.push(["fill", u]) }, "DYK", coded); // a code named in Modelling codes runs as mcode:<code>, with its role
  assert.deepEqual(calls, [["run", "DYK"], ["fill", "mcode:DYK"]]);
  assert.equal(BODIES.expertPane, "implicit");
});

test("#3908 Cover and weathering: the code that starts the holes; its base, and only for a code read as cover", async () => {
  const { COVER, GUIDED_TOOLS } = await import("../src/modules/viewer/guided/guidedTools.js");
  assert.equal(GUIDED_TOOLS[0], COVER); // the Start here card lists what lies on top first
  // L0: TILL 0-5, then SST from 5; the base contact is the top of what lies under the cover's last interval
  const ctx = { rows: logs(), hasTerrain: false, describe: () => "", isCover: (v) => v === "TILL",
    intercepts: () => [{ unit: "SST", hole_id: "L0", from: 5 }, { unit: "SLT", hole_id: "L0", from: 25 }, { unit: "SST", hole_id: "L1", from: 6 }] };
  assert.equal(COVER.suggest(ctx).value, "TILL");
  assert.deepEqual(COVER.contacts(ctx, "TILL").map((c) => c.hole_id), ["L0", "L1"]);
  assert.equal(COVER.check(ctx, "TILL"), null);
  assert.match(COVER.check(ctx, "SST"), /reads SST as a rock, so it would draw its top, not its base/);
  assert.match(COVER.notes(ctx)[0], /ground is taken from the collar heights/);
  assert.deepEqual(COVER.notes({ ...ctx, hasTerrain: true }), []);
});

test("#3908 the shell runs with the Modelling-codes key and gives the suggestion's reason only when it was kept", () => {
  const shell = rd("src/modules/viewer/guided/GuidedTool.jsx");
  assert.match(shell, /target: \(v\) => \(mcodes\.some\(\(c\) => c\.name === v\) \? `mcode:\$\{v\}` : v\)/);
  assert.match(shell, /tool\.run\(api, value, ctx\)/);
  assert.match(shell, /reasons: \[keptSuggestion \? sug\.reason : null,/);
});

test("#3909 Veins and dykes: the vein cut by the most holes, a verdict under three, the Vein run on its key", async () => {
  const { VEINS, GUIDED_TOOLS } = await import("../src/modules/viewer/guided/guidedTools.js");
  assert.ok(GUIDED_TOOLS.includes(VEINS));
  const veins = []; for (let h = 0; h < 5; h++) veins.push({ hole_id: `L${h}`, value: "QV" }); veins.push({ hole_id: "L0", value: "CB" }, { hole_id: "L1", value: "CB" });
  const ctx = { rows: logs(), veins, roleOf: (u) => (u === "DYK" ? "dyke" : "stratigraphic") };
  assert.deepEqual(VEINS.choices(ctx), ["litho:DYK", "QV", "CB"]); // a lithology code read as a dyke is offered too (DYK: 7 holes)
  assert.equal(VEINS.suggest(ctx).value, "litho:DYK");
  assert.equal(VEINS.label("litho:DYK"), "DYK");
  assert.equal(VEINS.auto(ctx, "QV").ok, true);
  assert.match(VEINS.auto(ctx, "CB").verdict[0], /^Only 2 holes cut CB: a sheet needs three or more\.$/);
  assert.equal(VEINS.auto(ctx, "litho:DYK").ok, true);
  const calls = []; VEINS.run({ runVeinModel: (v) => calls.push(v) }, "litho:DYK");
  assert.deepEqual(calls, ["litho:DYK"]);
  assert.match(VEINS.feed({ rows: [], veins: [], roleOf: () => "stratigraphic" }), /No veins or dykes logged/);
});

test("#3909 Faults: the measured type that reads like a fault, a verdict under three picks, the Structural run on it", async () => {
  const { FAULTS, GUIDED_TOOLS } = await import("../src/modules/viewer/guided/guidedTools.js");
  assert.ok(GUIDED_TOOLS.includes(FAULTS));
  const st = (value, h, dip = 60) => ({ hole_id: `L${h}`, value, dip, azimuth: 120 });
  const structures = [st("BED", 0), st("BED", 1), st("BED", 2), st("BED", 3), st("FLT", 0), st("FLT", 1), st("FLT", 2), st("VN", 0), { hole_id: "L9", value: "FLT", dip: null, azimuth: 10 }];
  const ctx = { structures };
  assert.deepEqual(FAULTS.choices(ctx), ["FLT", "BED", "VN"]); // named like a fault first, then by picks
  assert.equal(FAULTS.suggest(ctx).value, "FLT");
  assert.match(FAULTS.suggest(ctx).reason, /FLT reads like a fault and has 3 measured picks in 3 holes/); // the pick with no dip is not counted
  assert.match(FAULTS.auto(ctx, "VN").verdict[0], /^Only 1 VN picks/);
  assert.equal(FAULTS.auto(ctx, "FLT").ok, true);
  assert.equal(FAULTS.suggest({ structures: [st("BED", 0)] }).value, ""); // nothing reads like a fault: the user chooses
  const calls = []; FAULTS.run({ runStructuralModel: (v) => calls.push(v) }, "FLT"); FAULTS.prefill({ setStructuralTarget: (v) => calls.push(v) }, "FLT");
  assert.deepEqual(calls, ["FLT", "FLT"]);
});
