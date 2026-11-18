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
  assert.match(vm, /\{guided && mode === "view" && <Suspense fallback=\{null\}><GuidedTool tool=\{guided\} setTool=\{setGuided\} api=\{\{ runStackModel, runImplicitModel, computeIntercepts, modelResolution, setModelResolution, busy: implicitBusy,/);
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
  assert.match(shell, /api\.setModelResolution\(auto\.values\.resolution\)/); // the size and detail from lib/auto/autoSurface.js
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
  const ctx = { rows: logs(), intercepts: () => [{ unit: "DYK", hole_id: "L1" }, { unit: "SST", hole_id: "L1" }] };
  assert.equal(BODIES.suggest(ctx).value, "DYK");
  assert.deepEqual(BODIES.contacts(ctx, "DYK"), [{ unit: "DYK", hole_id: "L1" }]);
  assert.match(BODIES.check(ctx, ""), /Choose a rock first/);
  const calls = [];
  BODIES.run({ runImplicitModel: (u) => calls.push(["run", u]) }, "DYK");
  BODIES.prefill({ setImplicitTarget: (u) => calls.push(["fill", u]) }, "DYK");
  assert.deepEqual(calls, [["run", "DYK"], ["fill", "DYK"]]);
  assert.equal(BODIES.expertPane, "implicit");
});
