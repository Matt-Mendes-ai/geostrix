// TASKS.csv #1172, #1175, #1177, #1185, #1232, #1269, #1285
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { unitsForMethod } from "../src/lib/geophysSurveys.js";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#1172 units follow the method unless the geologist typed their own", () => {
  assert.deepEqual(unitsForMethod({ units: "nT" }, "grav"), { units: "mGal" }, "another method's default is replaced");
  assert.deepEqual(unitsForMethod({}, "mag"), { units: "nT" });
  assert.deepEqual(unitsForMethod({ units: "gamma" }, "grav"), {}, "typed units stay");
  assert.deepEqual(unitsForMethod({ units: "nT" }, ""), {});
});

test("#1175 no message sends anyone to a pane that moved", () => {
  for (const f of ["src/components/DcipPanel.jsx", "src/components/InterpretPane.jsx", "src/components/InversionPanel.jsx", "src/modules/viewer/modellingRuns.js", "src/modules/ViewerModule.jsx"]) {
    const s = read(f);
    assert.doesNotMatch(s, /tr\("[^"]*Geophysics (>|→) (Terrain|Map layers)/, f);
    assert.doesNotMatch(s, /Terrain section above/, f);
  }
});

test("#1177 the legend shows the range the colours use", () => {
  assert.match(read("src/modules/GeophysicsModule.jsx"), /geophysPtsMin \?\? drawnRange\.min/);
});

test("#1185 box plots share the histogram's log axis", async () => {
  const src = read("src/components/GradeStatistics.jsx");
  assert.match(src, /logScale=\{logScale\} unit=/);
  const fn = src.slice(src.indexOf("export function boxPlotScale"), src.indexOf("function BoxPlots"));
  const scale = new Function(`${fn.replace("export ", "")}; return boxPlotScale;`)();
  const stats = [{ min: 1, q1: 10, median: 100, q3: 1000, max: 10000 }];
  const log = scale(stats, true, 0, 400);
  assert.equal(Math.round(log.x(100)), 200, "two decades of four");
  assert.equal(log.x(0), 0, "zero sits at the smallest positive value");
  const lin = scale(stats, false, 0, 400);
  assert.ok(lin.x(100) < 5);
});

test("#1232 a notice that dropped data stays until read", () => {
  assert.match(read("src/modules/viewer/useImportPipeline.js"), /structure dip\(s\)[^\n]*level: "error"/);
});

test("#1269 the QC stamp describes the run it exports", () => {
  const s = read("src/components/DataQCModal.jsx");
  assert.match(s, /dogleg warning \$\{ranWith\.current\.warnDeg\}/);
  assert.doesNotMatch(s, /runDataQC\(qcArgs\(\)\)\);? *\}|useState\(\(\) => runDataQC/);
});

test("#1285 the dialogs that guard unsaved work are translated", () => {
  const s = read("src/lib/store.jsx");
  assert.doesNotMatch(s, /window\.confirm\(`/);
  assert.doesNotMatch(s, /window\.confirm\("/);
  assert.match(s, /window\.confirm\(tr\("Close/);
});

test("#1180 a fence covers the drilling unless asked for the models, and counts before it creates", async () => {
  const { fenceExtentPoints, fenceSectionCount } = await import("../src/lib/sectionDefs.js");
  const traces = [{ wx: [0, 5000], wy: [0, 0] }];
  const models = [{ cells: [{ x: 25000, y: 0, dx: 100, dy: 100 }] }];
  const onlyHoles = fenceExtentPoints(models, traces, false);
  assert.equal(onlyHoles.length, 2);
  assert.equal(fenceExtentPoints(models, traces, true).length, 6);
  assert.equal(fenceExtentPoints(models, [], false).length, 4, "no holes: the models");
  assert.equal(fenceExtentPoints([{ visible: false, cells: models[0].cells }], [], false).length, 0);
  assert.ok(Math.abs(fenceSectionCount(onlyHoles, 0, 1000) - 6) <= 1, String(fenceSectionCount(onlyHoles, 0, 1000)));
  assert.ok(fenceSectionCount(fenceExtentPoints(models, traces, true), 0, 1000) >= 25);
  assert.equal(fenceSectionCount([], 0, 1000), 0);
  assert.match(read("src/modules/ViewerModule.jsx"), /n > 50 && !window\.confirm/);
});
