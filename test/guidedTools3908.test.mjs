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
  // #4035 — drawn in 3D Modelling too (the guide; a card opened from it); openPane keeps the guide (its bar) and opens a pane in 3D Modelling itself
  assert.match(vm, /\{guided && \(mode === "view" \|\| mode === "modelling"\) && <Suspense fallback=\{null\}><GuidedTool tool=\{guided\} setTool=\{setGuided\} api=\{guidedApi\} \/><\/Suspense>\}/);
  assert.match(vm, /openPane: \(p, keep\) => \{ if \(!keep\) setGuided\(null\); if \(mode === "modelling"\) setToolPane\(p\); else \{ pendingPaneRef\.current = p; goToModule\("modelling"\); \} \}, notices, openQc: \(\) => setQcModalOpen\(true\), showResult: \(\) => setSurfaceSolidsOpen\(true\), lastFit: lastLithBlock\?\.matchedPct \?\? null \};/);
  assert.match(vm, /const guidedApi = \{ runStackModel, runImplicitModel, runVeinModel, runStructuralModel, runNumericModel, runAlterationModel \/\* #3932 batch 3 \*\/, meshOf: \(id\) => implicitMeshesRef\.current\[id\], numeric: \{ now: \[numericSymbol, numericCutoff, numericCellSize, numericCellHeight, numericSearchRadius, numericMinHoles\],/);
  assert.match(vm, /computeIntercepts, modelResolution, setModelResolution, busy: implicitBusy \|\| veinBusy \|\| numericBusy \|\| alterationBusy,/);
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
  assert.match(BODIES.check(ctx, "SST"), /^Mark SST as an intrusion .* read as a layered rock, only its top would be drawn/); // the live finding on WA lode gold
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
  assert.match(COVER.check(ctx, "SST"), /^Mark SST as overburden .* read as a rock, its top would be drawn, not its base/);
  assert.match(COVER.notes(ctx)[0], /ground is taken from the collar heights/);
  assert.deepEqual(COVER.notes({ ...ctx, hasTerrain: true }), []);
});

test("#3908 the shell runs with the Modelling-codes key and gives the suggestion's reason only when it was kept", () => {
  const shell = rd("src/modules/viewer/guided/GuidedTool.jsx");
  assert.match(shell, /target: \(v\) => \(mcodes\.some\(\(c\) => c\.name === v\) \? `mcode:\$\{v\}` : v\)/);
  assert.match(shell, /tool\.run\(api, value, ctx, p\.auto\.values\)/); // values: #3919
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
  const st = (value, h, dip = 60) => ({ hole_id: `L${h}`, value, dip, azimuth: 120, depth: 30 });
  const structures = [st("BED", 0), st("BED", 1), st("BED", 2), st("BED", 3), st("FLT", 0), st("FLT", 1), st("FLT", 2), st("VN", 0), { hole_id: "L9", value: "FLT", dip: null, azimuth: 10 }];
  const collars = [0, 1, 2, 3].map((h) => ({ hole_id: `L${h}`, x: 40 * h, y: 25 * (h % 2), z: 100 }));
  const ctx = { structures, collars };
  assert.deepEqual(FAULTS.choices(ctx), ["FLT", "BED", "VN"]); // named like a fault first, then by picks
  assert.equal(FAULTS.suggest(ctx).value, "FLT");
  assert.match(FAULTS.suggest(ctx).reason, /FLT reads like a fault and has 3 measured picks in 3 holes/); // the pick with no dip is not counted
  assert.match(FAULTS.auto(ctx, "VN").verdict[0], /^Only 1 VN picks/);
  assert.equal(FAULTS.auto(ctx, "FLT").ok, true);
  assert.equal(FAULTS.modes(ctx, "FLT"), null); // three picks: no quick model to offer (#3919)
  assert.equal(FAULTS.suggest({ structures: [st("BED", 0)] }).value, ""); // nothing reads like a fault: the user chooses
  const calls = []; FAULTS.run({ runStructuralModel: (v) => calls.push(v) }, "FLT", ctx, { rows: null }); FAULTS.prefill({ setStructuralTarget: (v) => calls.push(v) }, "FLT");
  assert.deepEqual(calls, ["FLT", "FLT"]);
});

test("#3909 Grade model: the cut-off from the grades, cells and search from the drilling, the trend helper's trend, volume and no estimate", async () => {
  const { GRADE, GUIDED_TOOLS } = await import("../src/modules/viewer/guided/guidedTools.js");
  assert.equal(GUIDED_TOOLS[GUIDED_TOOLS.length - 1], GRADE);
  // 6 x 6 vertical holes 40 m apart; a high-grade slab in the middle holes, a low background elsewhere (seeded)
  let k = 5; const rnd = () => (k = (k * 16807) % 2147483647) / 2147483647, g = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
  const collars = [], assays = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    const hole_id = `G${i}-${j}`; collars.push({ hole_id, x: i * 40, y: j * 40, z: 0 });
    for (let d = 0; d < 80; d += 2) assays.push({ hole_id, from: d, to: d + 2, values: { Au: 10 ** (d > 30 && d < 50 && i > 1 && i < 5 ? 0.3 + 0.25 * g() : -1.3 + 0.3 * g()), Cu: d < 4 ? 0.1 : 0 } });
  }
  const ctx = { collars, assays, assayElements: [{ symbol: "Au", unit: "g/t" }, { symbol: "Cu", unit: "%" }], hasDensity: false, gradeTrend: false };
  assert.equal(GRADE.suggest(ctx).value, "Au");
  const r = GRADE.auto(ctx, "Au");
  assert.equal(r.ok, true);
  const [sym, cutoff, cell, height, radius, minHoles] = r.values.list;
  assert.equal(sym, "Au");
  assert.ok(cutoff > 0.1 && cutoff < 1);
  assert.deepEqual([cell, height, radius, minHoles], [20, "", 120, 2]); // #3922: half the 40 m drill spacing, three spacings (read from the data again)
  assert.equal(r.values.fromData, true);
  assert.ok(r.reasons.some((x) => x.field === "cutoff") && r.reasons.some((x) => x.field === "cellSize" && /^Cells 20 x 20 m: about half your 40 m drill spacing/.test(x.text)) && r.reasons.some((x) => x.field === "searchRadius"));
  assert.equal(r.notes.filter((n) => /no density/.test(n)).length, 1); // said once
  assert.ok(r.notes.some((n) => /No trend is set/.test(n)));
  assert.ok(GRADE.auto({ ...ctx, gradeTrend: true }, "Au").reasons.some((x) => x.field === "trend"));
  assert.match(GRADE.auto(ctx, "Cu").verdict.join(" "), /All the grades are the same/); // Cu: one value, nothing to split
  const api = { numeric: { now: ["", 1, 10, "", 50, 2], set: [] } }; api.numeric.set = api.numeric.now.map((_, i) => (x) => { api.numeric.now[i] = x; });
  assert.equal(GRADE.ready(api, r.values), false);
  GRADE.prepare(api, r.values);
  assert.equal(GRADE.ready(api, r.values), true);
  const lines = GRADE.result([{ name: "Au shell", params: { volumeM3: 123000 }, closure: "artificial" }]); // no mesh: the params value, shown to three figures
  assert.match(lines[0], /^Au shell: 123,000 m³ above the cut-off\.$/);
  assert.match(lines.join(" "), /closed at the search radius/);
  assert.match(lines[lines.length - 1], /not a resource estimate/);
  assert.equal(GRADE.actions[0].label, "Set a trend");
});

test("#3909 live fixes: a vein set is stopped plainly and offered last; the shell's volume from its mesh; a cancelled run is not a data verdict", async () => {
  const { VEINS, GRADE } = await import("../src/modules/viewer/guided/guidedTools.js");
  const veins = [];
  for (let h = 0; h < 6; h++) for (let k = 0; k < 8; k++) veins.push({ hole_id: `L${h}`, value: "QTZ" }); // 8 per hole: a set
  for (let h = 0; h < 4; h++) veins.push({ hole_id: `L${h}`, value: "MAIN" });
  const ctx = { rows: [], veins, roleOf: () => "stratigraphic" };
  assert.deepEqual(VEINS.choices(ctx), ["MAIN", "QTZ"]);
  assert.match(VEINS.auto(ctx, "QTZ").verdict[0], /^Split QTZ into single veins .* it is logged about 8 times down each hole\./ /* #3899: the action first */);
  // a closed 1 m cube mesh: 1 m3
  const p = [0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1], idx = [0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7];
  const geometry = { attributes: { position: { count: 8, getX: (i) => p[3 * i], getY: (i) => p[3 * i + 1], getZ: (i) => p[3 * i + 2] } }, index: { count: idx.length, getX: (i) => idx[i] } };
  assert.match(GRADE.result([{ id: "s1", name: "Au shell" }], {}, { meshOf: () => ({ geometry }) })[0], /^Au shell: 1 m³ above the cut-off\.$/);
  const shell = rd("src/modules/viewer/guided/GuidedTool.jsx");
  assert.match(shell, /out\.stopped \? tr\("Nothing was built"\) : tr\("Your data cannot support this yet"\)/);
});
