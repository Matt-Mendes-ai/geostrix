// TASKS.csv #3586 (Matt: 'g/t everywhere') — Au / Ag / Pt / Pd stored in ppm read as g/t (1 ppm = 1 g/t) in EVERY tool: the 3D legend, the hover, Identify, the strip log and its Atlas
// twin, the fence track, the Downhole logs and QAQC lists as well as the Grade tools. Base metals keep their own unit; the project's 'Show in' unit still overrides.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assayLegendGroups } from "../src/lib/legendGroups.js";
import { surfaceSampleTip, mappedOfSample } from "../src/lib/viewer/sampleTip.js";
import { numericTrackSources } from "../src/lib/fenceTrack.js";
import { gradeUnitLabel } from "../src/lib/geochemColumns.js";
import { buildStripLogSvgMarkup } from "../src/lib/striplogSvg.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the one rule: Au / Ag / Pt / Pd stored in ppm are g/t; nothing else is renamed", () => {
  for (const s of ["Au", "Ag", "Pt", "Pd"]) { assert.equal(gradeUnitLabel(s, "ppm"), "g/t", s); assert.equal(gradeUnitLabel(s, undefined), "g/t", `${s}: no unit stored`); assert.equal(gradeUnitLabel(s, "ppb"), "ppb"); assert.equal(gradeUnitLabel(s, "%"), "%"); }
  for (const s of ["Cu", "Zn", "Pb", "Fe"]) assert.equal(gradeUnitLabel(s, "ppm"), "ppm", s);
});

test("the 3D legend: 'Ag (g/t)' with its classes in g/t; a base metal 'Zn (ppm)'; the project's own unit wins", () => {
  const mk = (sym, unit, displayUnits) => assayLegendGroups({ assays: [{}], assayElements: [{ symbol: sym, unit }], assayVisible: true, assayDisplayElements: [sym], assayStyle: { [sym]: { breaks: [{ max: 1, color: "#aaa" }, { max: 5, color: "#bbb" }] } }, displayUnits })[0];
  const ag = mk("Ag", "ppm"), zn = mk("Zn", "ppm");
  assert.equal(ag.label, "Ag (g/t)"); assert.deepEqual(ag.items.map((i) => i[0]), ["≤ 1 g/t", "> 1 g/t"]);
  assert.equal(zn.label, "Zn (ppm)");
  assert.equal(mk("Ag", "ppm", { Ag: "ppb" }).label, "Ag (ppb)", "Show in still overrides");
});

test("Identify and the hover of a surface sample: 'Ag: 0.93g/t', 'Ag 0.93 g/t'; the coloured-by label 'Ag (g/t)'", () => {
  const units = { Ag: "ppm", Zn: "ppm" };
  const row = { sample_id: "S1", medium: "soil", x: 1, y: 2, z: 3, values: { Ag: 0.93, Zn: 48.5 } };
  assert.match(surfaceSampleTip(row, { units }), /Ag: 0\.93g\/t/); assert.match(surfaceSampleTip(row, { units }), /Zn: 48\.5ppm/);
  const m = mappedOfSample({ mode: "element", classOf: [0], classes: [{ label: "x" }], values: [0.93] }, { symbol: "Ag" }, 0, units);
  assert.equal(m.label, "Ag (g/t)");
});

test("the fence track, the strip log (window and Atlas) and the lists", () => {
  assert.deepEqual(numericTrackSources({ assays: [{ hole_id: "H" }], assayElements: [{ symbol: "Ag", unit: "ppm" }, { symbol: "Zn", unit: "ppm" }] }).map((t) => t.label), ["Ag (g/t)", "Zn (ppm)"]);
  const collars = [{ hole_id: "H", length: 20 }], assays = [{ hole_id: "H", from: 0, to: 2, values: { Ag: 3, Zn: 400 } }];
  const out = buildStripLogSvgMarkup({ holeId: "H", collars, layers: {}, assays, assaySymbols: ["Ag", "Zn"], elementUnits: { Ag: "ppm", Zn: "ppm" } });
  assert.match(out.svg, /Ag \(g\/t\)/); assert.match(out.svg, /Zn \(ppm\)/); assert.doesNotMatch(out.svg, /Ag \(ppm\)/);
  const s = read("../src/components/StripLog.jsx");
  assert.match(s, /label: sym \? `\$\{sym\} \(\$\{gradeUnitLabel\(sym, elementUnits\[sym\]\)\}\)`/);
  assert.match(s, /\{s\} \(\{gradeUnitLabel\(s, elementUnits\[s\]\)\}\)<\/option>/);
  assert.match(read("../src/components/DownholeLogsPane.jsx"), /\{s\} \(\{gradeUnitLabel\(s, elementUnits\[s\]\)\}\)<\/option>/);
  assert.match(read("../src/components/QAQCPanel.jsx"), /v: gradeUnitLabel\(symbol, elementUnits\[symbol\]\) \/\* #3586 \*\//);
  assert.match(read("../src/components/SurfaceQaqcPanel.jsx"), /\(\$\{gradeUnitLabel\(s, units\[s\]\)\}\)/);
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /\$\{elementUnits\[sym\] \? gradeUnitLabel\(sym, elementUnits\[sym\]\) : ""\}\$\{px \? " \(pXRF\)" : ""\}/, "the drillhole assay hover");
});
