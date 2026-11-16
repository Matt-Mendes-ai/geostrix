// TASKS.csv #3858 (Scottie Gold review) — a drill plan of a fan-drilled zone: at the fitted scale 6 of 33 holes printed with no id and the sheet did not
// say so, three holes of one pad were three ids round one dot, and the plan coloured by best intercept but could not print one. Synthetic holes only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { placeLabels, bestInterceptRows, interceptLabel, traceBetween, drillPlanGeometry, planTraces } from "../src/lib/drillPlan.js";

// the drawing function lives in the component file: bundled with esbuild (react left out)
const here = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-plan3858-"));
const out = path.join(dir, "dpe.bundle.mjs");
writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", "src", "components", "DrillPlanElement.jsx")], bundle: true, write: false, format: "esm", platform: "node", jsx: "transform", external: ["react"], loader: { ".js": "jsx" }, logLevel: "silent" }).outputFiles[0].text);
const { drillPlanDrawing } = await import(pathToFileURL(out).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));

// three pads of six holes each (one collar point, six directions) and a tight line of nine collars 6 px apart
const pads = [[100, 100], [170, 110], [130, 180]].flatMap(([x, y], k) => [0, 1, 2, 3, 4, 5].map((i) => ({ id: `SR-${k}${i}`, x, y })));
const line = Array.from({ length: 9 }, (_, i) => ({ id: `SR-L${i}`, x: 220 + i * 6, y: 140 }));
const pts = [...pads, ...line];

test("labels with no room beside their collar get a leader; the ones still left are named", () => {
  const plain = placeLabels(pts, { fontPx: 9, w: 400, h: 300 });
  const led = placeLabels(pts, { fontPx: 9, w: 400, h: 300, leaders: true });
  assert.ok(plain.skipped >= 6, `without leaders ${plain.skipped} of ${pts.length} go unlabelled`);
  assert.equal(plain.missed.length, plain.skipped, "the missed ids are listed");
  assert.equal(led.skipped, 0, "every hole labelled with leaders");
  const withLeader = led.placed.filter((l) => l.leader);
  assert.ok(withLeader.length >= plain.skipped - 1);
  // a leader starts at its own collar; no two labels overlap
  for (const l of withLeader) { const p = pts.find((q) => q.id === l.id); assert.equal(l.leader.x1, p.x); assert.equal(l.leader.y1, p.y); }
  const box = (l) => { const tw = l.id.length * 9 * 0.56, x0 = l.anchor === "start" ? l.x : l.anchor === "end" ? l.x - tw : l.x - tw / 2; return { x0, x1: x0 + tw, y0: l.y - 9 * 0.35 - 9 / 2 + 0.5, y1: l.y - 9 * 0.35 + 9 / 2 - 0.5 }; };
  const bs = led.placed.map(box);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) assert.ok(!(bs[i].x0 < bs[j].x1 && bs[j].x0 < bs[i].x1 && bs[i].y0 < bs[j].y1 && bs[j].y0 < bs[i].y1), `${led.placed[i].id} / ${led.placed[j].id} overlap`);
  // a hole whose label fits beside it keeps the close spot (leaders come after)
  assert.equal(placeLabels([{ id: "A", x: 50, y: 50 }], { fontPx: 9, w: 400, h: 300, leaders: true }).placed[0].leader, undefined);
  // no room anywhere: missed
  const tiny = placeLabels([{ id: "LONGHOLEID-1", x: 10, y: 10 }], { fontPx: 9, w: 30, h: 20, leaders: true });
  assert.deepEqual(tiny.missed, ["LONGHOLEID-1"]);
});

test("the best intercept per hole as a row and as a label", () => {
  const comps = [
    { hole_id: "SR-1", from: 10, to: 12, length: 2, avgGrade: 5 },
    { hole_id: "SR-1", from: 137.3, to: 141, length: 3.7, avgGrade: 56.41 },
    { hole_id: "SR-2", from: 50, to: 51, length: 1, avgGrade: 0.55 },
  ];
  const rows = bestInterceptRows(comps);
  assert.deepEqual(rows.get("SR-1"), { from: 137.3, to: 141, length: 3.7, grade: 56.41 });
  assert.equal(interceptLabel(rows.get("SR-1"), "g/t", "Au"), "3.70 m @ 56.4 g/t Au");
  assert.equal(interceptLabel(rows.get("SR-2"), "g/t", "Au"), "1.00 m @ 0.55 g/t Au");
  assert.equal(interceptLabel(null, "g/t", "Au"), "");
});

test("the intercept's place on the trace: along the straight line by length, along a surveyed path by its depths", () => {
  const straight = { ax: 0, ay: 0, bx: 100, by: 0, length: 200, path: null, mds: null };
  assert.deepEqual(traceBetween(straight, 50, 100), [[25, 0], [50, 0]]);
  assert.deepEqual(traceBetween({ ...straight, bx: 0 }, 50, 100), [], "a vertical hole is a point");
  // a surveyed hole bending east: the segment between 60 and 140 m follows the path's stations
  const collars = [{ hole_id: "S1", x: 1000, y: 2000, z: 500, azimuth: 0, dip: -60, length: 200 }];
  const survey = [{ hole_id: "S1", depth: 0, azimuth: 0, dip: -60 }, { hole_id: "S1", depth: 100, azimuth: 30, dip: -60 }, { hole_id: "S1", depth: 200, azimuth: 60, dip: -60 }];
  const traces = planTraces(collars, survey, "minimumCurvature");
  assert.ok(Array.isArray(traces.get("S1").mds), "the depths kept beside the path");
  assert.deepEqual(traces.get("S1").at(-1).length, 2, "the path's points stay [x, y]");
  const g = drillPlanGeometry({ w: 600, h: 600, scale: 1000, centre: { x: 1050, y: 2050 } }, collars, traces);
  const seg = traceBetween(g.holes[0], 60, 140);
  assert.ok(seg.length >= 3, "the stations between are kept");
  const hole = g.holes[0], first = seg[0], last = seg.at(-1);
  assert.ok(first[0] >= hole.ax - 0.01 && last[1] < first[1], "it starts below the collar and runs north (up the page)");
});

test("the drawing: labelled with the intercept, marked on the trace, the holes with no label named on the sheet", () => {
  const collars = [
    { hole_id: "SR23-232", x: 433678, y: 6200000, z: 900, azimuth: 0, dip: -50, length: 200 },
    { hole_id: "SR23-233", x: 433678, y: 6200000, z: 900, azimuth: 120, dip: -50, length: 200 },
    { hole_id: "SR23-235", x: 433678, y: 6200000, z: 900, azimuth: 240, dip: -50, length: 200 },
    ...[60, 180, 300].map((az, i) => ({ hole_id: `SR23-24${i}`, x: 433678, y: 6200000, z: 900, azimuth: az, dip: -70, length: 150 })), // six holes from one pad
  ];
  const assays = [
    { hole_id: "SR23-232", from: 100, to: 101, values: { Au: 0.2 } }, { hole_id: "SR23-232", from: 137.3, to: 141, values: { Au: 56.41 } },
    { hole_id: "SR23-233", from: 60, to: 62, values: { Au: 3 } },
    { hole_id: "SR23-235", from: 10, to: 11, values: { Au: 0.1 } },
  ];
  const el = { id: "p", type: "drillplan", w: 500, h: 400, scale: 2500, centre: { x: 433678, y: 6200000 }, colourBy: "bi:Au", biCutoff: 1, biDilution: 2, labelWith: "bi", fontPt: 7 };
  const d = drillPlanDrawing(el, collars, assays, [{ symbol: "Au", unit: "g/t" }]);
  const texts = d.labels.placed.map((l) => l.id);
  assert.ok(texts.some((t) => /^SR23-232 3\.70 m @ 56\.4 g\/t Au$/.test(t)), texts.join(" | "));
  assert.ok(texts.includes("SR23-235"), "no intercept: the id alone");
  assert.equal(d.labels.skipped, 0, "six holes of one pad, each labelled");
  assert.ok(d.labels.placed.filter((l) => l.leader).length >= 1, "the pad's labels tied by leaders");
  assert.deepEqual(d.marks.map((m) => m.id).sort(), ["SR23-232", "SR23-233"]);
  assert.equal(d.unlabelledNote, "");
  const off = drillPlanDrawing({ ...el, labels: "room", labelWith: "id" }, collars, assays, [{ symbol: "Au", unit: "g/t" }]);
  assert.equal(off.marks.length, 0, "no marks without the intercept labels");
  if (off.labels.skipped) assert.match(off.unlabelledNote, /^\d hole\(s\) without a label: SR23-/);
});

test("wiring: the panel's choices and the 7,500 fit scale", () => {
  const L = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(L, /const SCALE_PRESETS = \[500, 1000, 1500, 2000, 2500, 5000, 7500, 10000,/);
  assert.match(L, /<option value="room">\{tr\("Only holes with room beside the collar"\)\}<\/option>/);
  assert.match(L, /colourByKind\(sel\.colourBy\)\.kind === "bi" && <label/);
  const D = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");
  assert.match(D, /leaders: el\.labels !== "room"/);
});
