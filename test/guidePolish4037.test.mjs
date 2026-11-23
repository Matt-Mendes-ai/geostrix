// TASKS.csv #4037 — the guide's polish from the walk-through (#4036): one count for the stack's rocks, rocks that return said before the run, Not needed
// instead of a tick, Macpass's way to step 6, what each count feeds, one card on a map, vein buttons that name their vein, the clusters' word, the drill
// spacing at depth, the fit in step 7, the dots' states in words. Synthetic data.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { guideFacts, clearGuideFacts } from "../src/lib/guide/guideFacts.js";
import { guideStepById } from "../src/lib/guide/guideSteps.js";
import { suggestRoute } from "../src/lib/guide/suggestRoute.js";
import { depthSites, siteSpacing } from "../src/lib/auto/autoCommon.js";
import { autoSurface } from "../src/lib/auto/autoSurface.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, "..", p), "utf8").replace(/\r\n/g, "\n");
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-guide4037-"));
const out = path.join(dir, "steps.mjs");
writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", "src", "modules", "viewer", "guided", "GuideSteps.jsx")], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react"], logLevel: "silent" }).outputFiles[0].text);
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });
const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");

function project({ holes = 8, units = ["SST", "SH", "LST", "MDST"], thick = 20, order = () => null, extra = {} } = {}) {
  const collars = [], litho = [];
  for (let i = 0; i < holes; i++) {
    const id = `H${i + 1}`;
    collars.push({ hole_id: id, x: 1000 + (i % 4) * 100, y: 2000 + Math.floor(i / 4) * 100, z: 500, length: units.length * thick + 10 });
    (order(i) || units).forEach((u, k) => litho.push({ hole_id: id, from: k * thick, to: (k + 1) * thick, value: u }));
  }
  return { collars, layers: { litho }, assays: [], assayElements: [], mapLayers: [], terrain: {}, sections: [], explicitSurfaces: [], generatedSurfaces: [], stratStack: { units: [], faults: [] }, modellingCodes: null, lithoGroups: [], surfaceStructures: [], voxelModels: [], rasters: [], survey: [], modelGuide: { route: null, skipped: [], at: null }, ...extra };
}
const facts = (p) => { clearGuideFacts(); return guideFacts(p); };
const step = (f, id, guide = {}) => guideStepById(id).status(f, guide);
const render = async (store, viewId, api = { modelResolution: 48, notices: [] }) => {
  const { default: GuideSteps } = await import(pathToFileURL(out).href);
  return renderToStaticMarkup(React.createElement(GuideSteps, { store: { ...store, setGuideRoute() {}, setGuideSkipped() {}, setGuideAt() {} }, api, setTool() {}, toBar() {}, viewId, setViewId() {}, since: 0 }));
};

test("(1) one count: the stack's rocks. Step 4, Add all and the Strat. stack say the same number; a rare rock is in none of them", () => {
  const p = project({ units: ["A", "B", "C", "D", "E"], thick: 20, order: (i) => (i % 2 ? ["A", "B", "C", "D", "E"] : ["A", "B", "C", "D", "E", "R"]) });
  p.layers.litho.push({ hole_id: "H1", from: 130, to: 130.5, value: "TINY" }); // under 1 % of the metres
  const f = facts(p);
  assert.equal(f.order.takes, f.order.addable);
  assert.ok(f.order.steady.includes("TINY") === false || f.order.takes < f.order.steady.length, "steady counts the thin rock; the stack does not take it");
  assert.match(suggestRoute(f).reason, new RegExp(`^${f.order.takes} rocks for the stack`));
  assert.equal(step(f, "rocks").asks.rows.find((x) => x.key === "add").text, `Add ${f.order.addable} rocks in the holes' order.`);
  const built = facts({ ...p, stratStack: { units: ["A", "B", "C"], faults: [] } });
  assert.equal(built.order.takes, 3, "with a stack, its units");
});

test("(2) a rock that returns is seen before the run: a row in step 3 and a note under step 4's cards, with the run's own bar", () => {
  const units = ["A", "B", "C", "D"], alt = ["A", "B", "A", "C", "B", "D"]; // A and B return
  const p = project({ holes: 8, units, order: () => alt, thick: 10 });
  const f = facts(p);
  assert.equal(f.order.returns.over, true); assert.equal(f.order.returns.repeating, 8);
  assert.deepEqual(f.order.returns.units.map((u) => u.unit).sort(), ["A", "B"]);
  const row = step(f, "rocks").asks.rows.find((x) => x.key === "returns");
  assert.equal(row.text, "Rocks return in 8 of 8 holes: surfaces cut through them.");
  assert.equal(step(f, "build", { route: "computed" }).asks.returns, row.text);
  // a clean pile says nothing; two returning holes of eight are under the run's bar
  assert.equal(facts(project()).order.returns.over, false);
  assert.equal(facts(project({ holes: 8, order: (i) => (i < 2 ? alt : null) })).order.returns.over, false);
});

test("(3) no evidence: Not needed (a skipped state), not a Done tick; (4) assays only: steps 3 and 4 point to step 6", () => {
  const f = facts(project());
  const s = step(f, "faults");
  assert.equal(s.state, "skipped"); assert.equal(s.reason, "Not needed for this data.");
  const m = project({ holes: 5, units: [] }); m.assays = [{ hole_id: "H1", from: 0, to: 1, Zn: 2 }];
  const g = facts(m);
  for (const id of ["rocks", "build"]) { const t = step(g, id); assert.equal(t.state, "waiting"); assert.equal(t.to, "grade"); assert.equal(t.reason, "No logs: step 6 needs none."); }
  // logs short of three contacts keep their own words, not the assays-only hint
  assert.doesNotMatch(step(facts(project({ holes: 2 })), "rocks").reason, /step 6/);
});

test("(5) step 1 says what each count feeds", () => {
  const p = project(); p.assays = [{ hole_id: "H1", from: 0, to: 1, Au: 1 }]; p.layers.structure = [{ hole_id: "H1", value: "BED", dip: 40, azimuth: 90 }];
  const rows = step(facts(p), "data").asks.rows.map((r) => r.text);
  assert.deepEqual(rows.slice(0, 3), ["Logged holes: 8 (layers, bodies)", "Oriented picks: 1 (faults, veins)", "Assays: 1 (grade)"]);
});

test("(6) a map alone: one card, no 'Compute or draw?' question; two cards keep it", async () => {
  const poly = (u) => ({ geometry: [[0, 0], [1, 0], [1, 1]], parts: [[[0, 0], [1, 0], [1, 1]]], attributes: { UNIT: u } });
  const map = project({ holes: 0, extra: { mapLayers: [{ id: "m", geomType: "polygon", styleField: "UNIT", features: ["Ka", "Kb", "Kc"].map(poly) }] } });
  const h = await render(map, "build");
  assert.doesNotMatch(h, /role="radiogroup"|Compute or draw\?/);
  assert.match(h, /No logs: build from the map&#x27;s 3 units\./, "its reason stays, in the body");
  assert.match(h, />Model from map</);
  const both = await render(project(), "build");
  assert.match(both, /role="radiogroup"/);
});

test("(7) step 5: a vein's button names it; faults show their suggested answer", async () => {
  const p = project();
  p.layers.structure = [1, 2, 3, 4].map((i) => ({ hole_id: `H${i}`, value: "FLT", structure_id: "", dip: 60, azimuth: 90 }));
  p.layers.vein = [1, 2, 3, 4].map((i) => ({ hole_id: `H${i}`, from: 30, to: 31, value: "QV" })).concat([1, 2, 3].map((i) => ({ hole_id: `H${i}`, from: 40, to: 41, value: "AU" })));
  const h = await render(p, "faults");
  assert.match(h, />Build QV</); assert.match(h, />Build AU</);
  assert.doesNotMatch(h, />Veins and dykes</, "no button named for the card");
  assert.match(h, /Faults in this model\?<span[^>]*> · Suggested: Yes<\/span>/);
  const none = await render(project(), "faults");
  assert.match(none, /Suggested: No/);
});

test("(8) step 2 counts the logged holes' clusters, the word and the number of the Strat. stack's note", () => {
  const p = project({ holes: 0 });
  const at = [[0, 0], [60, 0], [0, 60], [60, 60], [5000, 0], [5060, 0], [5000, 60], [5060, 60], [9000, 9000], [9040, 9000]]; // two clusters of four, one of two
  p.collars = at.map(([x, y], i) => ({ hole_id: `H${i}`, x, y, z: 100, length: 100 }));
  p.layers.litho = p.collars.flatMap((c) => [{ hole_id: c.hole_id, from: 0, to: 50, value: "A" }, { hole_id: c.hole_id, from: 50, to: 100, value: "B" }]);
  const f = facts(p);
  assert.equal(f.area.clusters.length, 3, "every cluster, the two-hole one too");
  const a = step(f, "area");
  assert.match(a.reason, /^3 clusters of holes, .* apart: start with 4 holes\.$/);
  assert.equal(guideStepById("area").question, "Whole property, or one cluster?");
  // only the logged holes: an unlogged outlier is no cluster
  const q = project({ holes: 0 }); q.collars = [...p.collars, { hole_id: "FAR", x: 90000, y: 0, z: 100, length: 100 }]; q.layers = p.layers;
  assert.equal(facts(q).area.clusters.length, 3);
});

test("(9) the drill spacing at half the hole length: a fan from a pad is not 3 m between holes", () => {
  // four pads, three holes each from one pad, fanned in different directions at -45
  const holes = [], survey = [];
  [[0, 0], [400, 0], [0, 400], [400, 400]].forEach(([px, py], pad) => [0, 120, 240].forEach((az, k) => {
    const id = `P${pad}-${k}`;
    holes.push({ hole_id: id, x: px + k * 1.5, y: py, length: 400 });
    survey.push({ hole_id: id, depth: 0, azimuth: az, dip: -45 }, { hole_id: id, depth: 200, azimuth: az, dip: -45 }, { hole_id: id, depth: 400, azimuth: az, dip: -45 });
  }));
  const atCollars = siteSpacing(holes).spacing, deep = depthSites(holes, survey), atDepth = siteSpacing(deep).spacing;
  assert.ok(atCollars < 5 || atDepth > 10 * atCollars, `collars ${atCollars} m, at depth ${atDepth} m`);
  assert.ok(atDepth > 50, `the holes are about ${atDepth} m apart where they cut the contacts`);
  // a hole with no length or no attitude stays at its collar; parallel holes keep the grid's spacing
  assert.deepEqual(depthSites([{ hole_id: "X", x: 1, y: 2 }], survey), [{ hole_id: "X", x: 1, y: 2 }]);
  const grid = [0, 100, 200].flatMap((x) => [0, 100, 200].map((y) => ({ hole_id: `G${x}${y}`, x, y, length: 200, azimuth: 90, dip: -60 })));
  assert.ok(Math.abs(siteSpacing(depthSites(grid, [])).spacing - siteSpacing(grid).spacing) < 1e-6);
  // the guide's step 2 and autoSurface use it
  const f = facts({ ...project({ holes: 0 }), collars: holes, survey, layers: { litho: holes.flatMap((h) => [{ hole_id: h.hole_id, from: 0, to: 200, value: "A" }, { hole_id: h.hole_id, from: 200, to: 400, value: "B" }]) } });
  assert.ok(f.area.spacing > 50, `step 2 reads ${f.area.spacing} m`);
  const contacts = holes.map((h, i) => ({ hole_id: h.hole_id, x: h.x + i, y: h.y + 3 * i, z: -100 - i }));
  const flat = autoSurface({ collars: holes, contacts, hasLogs: true }), deepRun = autoSurface({ collars: holes, contacts, hasLogs: true, survey });
  assert.ok(flat.ok && deepRun.ok);
  assert.ok(deepRun.values.cellsM[0] > flat.values.cellsM[0] || deepRun.values.extent[1] - deepRun.values.extent[0] >= flat.values.extent[1] - flat.values.extent[0], "the model box and cells follow the wider spacing");
  assert.match(read("src/modules/viewer/guided/GuidedTool.jsx"), /maxResolution: QUICK_RESOLUTION, survey: ctx\.survey \}/);
  assert.match(read("src/modules/viewer/guided/guidedRun.js"), /maxResolution: QUICK_RESOLUTION, survey: ctx\.survey \}/);
});

test("(10) step 7 shows the model's fit: a low match is flagged", async () => {
  const mapped = project({ extra: { rasters: [{ id: "r1", name: "Where the model differs", provenance: { tool: "Model from map: where the model's unit at the ground is not the mapped one", overall: 0.41, differ: 59, compared: 100 } }], generatedSurfaces: [{ id: "s1", type: "stratigraphic_contact", params: { surface: "SH" } }] } });
  const f = facts(mapped);
  assert.equal(f.fit.map, 0.41);
  const c = step(f, "check");
  assert.deepEqual(c.asks.rows.map((r) => [r.text, r.low]), [["Map match: 41 %", true]]);
  const logs = step(facts({ ...mapped, rasters: [] }), "check", { ui: { fit: 83 } });
  assert.deepEqual(logs.asks.rows.map((r) => [r.text, r.low]), [["Log match: 83 %", false]]);
  const h = await render(mapped, "check");
  assert.match(h, /Map match: 41 %/);
  assert.match(read("src/modules/viewer/modellingRuns.js"), /provenance: \{ tool: DIFFER_TOOL, cellM, differ: fit\.differ, compared: fit\.compared, overall: fit\.overall/);
  assert.match(read("src/modules/ViewerModule.jsx"), /lastFit: lastLithBlock\?\.matchedPct \?\? null/);
});

test("(11) the dots' states in words beside the step's title; Skip only where it means something", async () => {
  const h = await render(project(), "rocks");
  assert.match(h, /3\. Rocks and order<span[^>]*> · Next<\/span>/);
  assert.match(h, />Skip</);
  const skipped = await render(project(), "faults"); // Not needed: nothing to skip
  assert.match(skipped, /5\. Faults and veins<span[^>]*> · Skipped<\/span>/);
  assert.doesNotMatch(skipped, />Skip</);
});

test("the Rock layers card shows its own reason only while its own suggestion is ticked", () => {
  assert.match(read("src/modules/viewer/guided/GuidedTool.jsx"), /\{sug\?\.reason && \(!tool\.multi \|\| keptSuggestion\) && <div/);
});
