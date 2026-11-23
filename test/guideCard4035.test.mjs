// TASKS.csv #4035 (guided modelling row 5) — the guide card on a fake store: the strip and the step it opens on, the route cards with the suggested one,
// the doors (guideActs.js: a pane opened filled in and the guide shrunk to its bar, a card, a setter), the Next buttons after a failure notice, skip,
// and the bar. Synthetic data.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { runAct, explicitUnit, ACT_LABELS, ROUTE_LABELS } from "../src/modules/viewer/guided/guideActs.js";
import { clearGuideFacts, guideFacts } from "../src/lib/guide/guideFacts.js";
import { guideStatus, GUIDE_STEPS } from "../src/lib/guide/guideSteps.js";
import { takePaneIntent } from "../src/lib/guide/paneIntent.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, "..", p), "utf8").replace(/\r\n/g, "\n");
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-guide4035-"));
const bundle = (entry, name) => { const out = path.join(dir, name); writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", entry)], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react"], logLevel: "silent" }).outputFiles[0].text); return pathToFileURL(out).href; };
const stepsUrl = bundle("src/modules/viewer/guided/GuideSteps.jsx", "steps.mjs"), barUrl = bundle("src/modules/viewer/guided/GuideBar.jsx", "bar.mjs");
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });
const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");

// eight holes of a layered pile under a cover rock (the top rock starts every hole)
function project(extra = {}) {
  const collars = [], litho = [], units = ["SST", "SH", "LST", "MDST"];
  for (let i = 0; i < 8; i++) {
    const id = `H${i + 1}`;
    collars.push({ hole_id: id, x: 1000 + (i % 4) * 100, y: 2000 + Math.floor(i / 4) * 100, z: 500, length: 90 });
    units.forEach((u, k) => litho.push({ hole_id: id, from: k * 20, to: (k + 1) * 20, value: u }));
  }
  return { collars, layers: { litho }, assays: [], assayElements: [], mapLayers: [], terrain: {}, sections: [], explicitSurfaces: [], generatedSurfaces: [], stratStack: { units: [], faults: [] }, modellingCodes: null, lithoGroups: [], surfaceStructures: [], voxelModels: [], modelGuide: { route: null, skipped: [], at: null }, ...extra };
}
function fakes(store = {}) {
  const calls = [];
  const rec = (name) => (...a) => calls.push([name, ...a]);
  const api = { openPane: rec("openPane"), openQc: rec("openQc"), showResult: rec("showResult"), setStackUnits: rec("setStackUnits"), modelResolution: 48, notices: [] };
  const st = { ...store, goToModule: rec("goToModule"), setModellingCodes: (f) => calls.push(["setModellingCodes", f(store.modellingCodes || null)]), setGuideRoute: rec("setGuideRoute"), setGuideSkipped: rec("setGuideSkipped"), setGuideAt: rec("setGuideAt") };
  const env = { api, store: st, setTool: rec("setTool"), toBar: rec("toBar"), intent: rec("intent"), action: rec("action") };
  return { calls, api, store: st, env };
}

test("doors: a pane opens filled in and the guide shrinks to its bar; a card opens; a setter is one click", () => {
  const { calls, env } = fakes(project());
  runAct("add-all", null, env);
  assert.deepEqual(calls, [["intent", { pane: "stack", addAll: { mode: "share" } }], ["openPane", "stack", true], ["toBar"]]);
  calls.length = 0;
  runAct("settings", { asks: { suggest: "group", group: { ids: ["H1", "H2", "H3"], n: 3 }, resolution: 48, act: "settings" } }, env);
  assert.deepEqual(calls[0], ["intent", { pane: "settings", suggest: "group", group: { ids: ["H1", "H2", "H3"], n: 3 }, resolution: 48 }]);
  calls.length = 0;
  runAct("explicit", { unit: "LST" }, env); runAct("stack-faults", null, env);
  assert.deepEqual(calls.filter((c) => c[0] === "intent").map((c) => c[1]), [{ pane: "explicit", unit: "LST" }, { pane: "stack", faults: true }]);
  calls.length = 0;
  runAct("role-overburden", null, env); runAct("vein", { vein: "PO" }, env); runAct("grade", null, env); runAct("layers", { units: ["SH", "LST"] }, env);
  assert.deepEqual(calls.slice(0, 3).map((c) => c.join(":")), ["setTool:cover", "setTool:veins:PO", "setTool:grade"]);
  assert.deepEqual(calls[3], ["setTool", "layers", ["SH", "LST"]], "Rock layers starts on the Strat. stack's units (design step 4)");
  calls.length = 0;
  runAct("leave-out", { codes: ["R1", "R2"] }, env);
  assert.deepEqual(calls[0][1].codes, [{ name: "R1", leftOut: true }, { name: "R2", leftOut: true }]);
  calls.length = 0;
  runAct("sort", { order: ["SH", "LST"] }, env); runAct("qc", null, env); runAct("result-block", null, env); runAct("terrain", null, env);
  assert.deepEqual(calls.map((c) => c[0]), ["setStackUnits", "openQc", "openPane", "showResult", "toBar", "goToModule", "action"]);
  assert.deepEqual(calls.at(-1), ["action", "maps-terrain"]);
  for (const a of Object.keys(ACT_LABELS)) assert.equal(typeof ACT_LABELS[a], "string");
});

test("a real intent reaches the pane it names (#4033's slot), once", () => {
  const { env } = fakes(project());
  delete env.intent;
  runAct("add-all", null, env);
  assert.equal(takePaneIntent("settings"), null, "another pane does not take it");
  assert.deepEqual(takePaneIntent("stack"), { pane: "stack", addAll: { mode: "share" } });
  assert.equal(takePaneIntent("stack"), null);
});

test("Next after a failure: the newest coded notice since the guide opened gives its buttons; Draw it instead sets the route", async () => {
  const { nextAfterFailure } = await import(stepsUrl);
  const old = { text: "x", code: "order", detail: { order: ["A", "B"] } }, now = { text: "GemPy could not solve this model", code: "singular", detail: { unit: "SH" } };
  assert.deepEqual(nextAfterFailure([old], 1), []);
  const next = nextAfterFailure([old, "a plain notice", now], 1);
  assert.deepEqual(next.map((n) => [n.label, n.act.id]), [["Leave out of the model", "leave-out"], ["Draw it instead", "draw-instead"]]);
  const { calls, env } = fakes(project());
  runAct(next[1].act.id, next[1].act, env);
  assert.deepEqual(calls.slice(0, 2), [["setGuideRoute", "drawn"], ["intent", { pane: "explicit", unit: "SH" }]]);
  calls.length = 0;
  runAct("use-holes-order", { order: ["B", "A"] }, env);
  assert.deepEqual(calls, [["setStackUnits", ["B", "A"]]]);
});

test("the card on a layered pile: seven dots, the step it opens on, its rows and doors; step 4's route cards with the suggestion", async () => {
  const { default: GuideSteps, shownStep } = await import(stepsUrl);
  clearGuideFacts();
  const { store, api } = fakes(project());
  const status = guideStatus(guideFacts(store), store.modelGuide);
  const shown = { current: null };
  const html = renderToStaticMarkup(React.createElement(GuideSteps, { store, api, setTool() {}, toBar() {}, viewId: null, setViewId() {}, since: 0, shown }));
  assert.equal((html.match(/role="tab"/g) || []).length, 7);
  assert.deepEqual(shown.current, { n: 3, of: 7, title: "Rocks and order" }); // what the bar says
  assert.equal(status.at, "rocks", JSON.stringify(status.steps.map((s) => s.state)));
  assert.match(html, /data-guide-step="rocks"/);
  assert.match(html, /SST starts 8 of 8 holes: the cover\./);
  assert.match(html, />Cover and weathering</); assert.match(html, />Add all units</);
  assert.match(html, /aria-label="1\. Your data: Done"/);
  // step 4 pressed: the routes the data allows, Compute marked Suggested with its reason, then the cards in order
  const h4 = renderToStaticMarkup(React.createElement(GuideSteps, { store, api, setTool() {}, toBar() {}, viewId: "build", setViewId() {}, since: 0 }));
  assert.match(h4, /role="radiogroup"/);
  assert.match(h4, new RegExp(`${ROUTE_LABELS.computed}<span[^>]*>Suggested</span>`));
  assert.match(h4, /4 rocks for the stack, in 8 holes: compute\./);
  assert.match(h4, /4\. Compute or draw<span[^>]*> · Waiting<\/span>/, "the state in words beside the title, the dots' legend (#4037)");
  assert.match(h4, />Draw</);
  assert.ok(h4.indexOf(">Cover and weathering<") < h4.indexOf(">Rock layers<"), "the cover's card first, then the layers");
  // the saved place opens the guide when its step is not done; a pressed dot wins
  assert.equal(shownStep(status, null, "check"), "check"); // waiting, not done: the saved place opens
  assert.equal(shownStep(status, null, "data"), "rocks", "a done step is not reopened from the saved place");
  assert.equal(shownStep(status, "data", "check"), "data");
});

test("skip: a step the person skipped shows as skipped, with Undo; the bar names the step", async () => {
  const { default: GuideSteps } = await import(stepsUrl);
  clearGuideFacts();
  const p = project({ modelGuide: { route: null, skipped: ["rocks"], at: null } });
  const { store, api } = fakes(p);
  const html = renderToStaticMarkup(React.createElement(GuideSteps, { store, api, setTool() {}, toBar() {}, viewId: "rocks", setViewId() {}, since: 0 }));
  assert.match(html, /aria-label="3\. Rocks and order: Skipped"/);
  assert.match(html, />Undo</);
  const { default: GuideBar } = await import(barUrl);
  const bar = renderToStaticMarkup(React.createElement(GuideBar, { n: 3, of: GUIDE_STEPS.length, title: "Rocks and order", open() {}, close() {} }));
  assert.match(bar, /Guide: step 3 of 7, Rocks and order\./);
  assert.match(bar, />Back to the guide</);
});

test("assays only (Macpass): the guide opens on step 6, Grade model", async () => {
  const { default: GuideSteps } = await import(stepsUrl);
  clearGuideFacts();
  const p = project({ layers: { litho: [] }, assays: [{ hole_id: "H1", from: 0, to: 1, Zn: 2 }] });
  const { store, api } = fakes(p);
  const html = renderToStaticMarkup(React.createElement(GuideSteps, { store, api, setTool() {}, toBar() {}, viewId: null, setViewId() {}, since: 0 }));
  assert.match(html, /data-guide-step="grade"/);
  assert.match(html, />Grade model</);
});

test("wiring: Start here is the guide and shrinks to its bar; the single cards close; the Guide button opens it from 3D Modelling", () => {
  const g = read("src/modules/viewer/guided/GuidedTool.jsx");
  assert.match(g, /const close = !tool \? \(\) => setBar\(true\) : fromGuide\.current \? \(\) => \{ setTool\("start"\); setBar\(true\); \} : quit;/);
  assert.match(g, /const openCard = \(id, value\) => \{ fromGuide\.current = true;/, "a card the guide opens returns to the guide's bar");
  assert.match(g, /useModuleAction\(\["guided-open"\], \(a, p\) => \{ fromGuide\.current = false; reopen\(\); \}\);/, "the Model menu's cards close as before");
  assert.match(g, /useDismiss\(true, \(n\) => !!box\.current\?\.contains\(n\), close\);/);
  assert.match(g, /<Suspense fallback=\{null\}><GuideSteps store=\{store\} api=\{api\} setTool=\{openCard\} toBar=\{\(\) => setBar\(true\)\}/);
  assert.match(g, /preset=\{preset\?\.id === tool\.id \? preset\.value : null\}/);
  assert.match(g, /const GuideSteps = React\.lazy\(\(\) => import\("\.\/GuideSteps\.jsx"\)\);/, "the guide is its own chunk: the single cards do not load it");
  assert.doesNotMatch(g, /lib\/guide\//, "nor its facts"); 
  assert.doesNotMatch(g, /function StartHere/);
  assert.doesNotMatch(read("src/modules/viewer/guided/GuideSteps.jsx") + read("src/modules/viewer/guided/GuideBar.jsx") + read("src/modules/viewer/guided/guideActs.js"), /from "three"|modellingRuns|ViewerModule/);
  const r = read("src/modules/viewer/ModeRibbons.jsx");
  assert.match(r, /<RibbonButton icon=\{ModelIcon\} label="Guide" tone="model" [^\n]*onClick=\{\(\) => requestModuleAction\("guided-open", \{ tool: "start" \}\)\} \/>/);
  explicitUnit({ order: { steady: [] }, cover: null }); // no rocks: no unit, no throw
  assert.equal(explicitUnit({ order: { steady: ["SH", "LST"] }, cover: { unit: "SST" } }), "LST");
});
