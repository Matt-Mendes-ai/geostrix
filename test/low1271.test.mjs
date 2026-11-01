import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sgSummary } from "../src/lib/gradeTonnage.js";
import { diagramExportRows, DIAGRAMS } from "../src/lib/geochemDiagrams.js";

const read = (f) => readFileSync(f, "utf8");
test("#1216 the SG layer's mean is length-weighted, and leaves out what is not a density", () => {
  const r = sgSummary([{ from: 0, to: 1, value: 2 }, { from: 1, to: 4, value: 3 }, { from: 4, to: 5, value: -99 }, { from: 5, to: 6, value: 27 }, { from: 6, to: 7, value: "" }, { from: 7, to: 7, value: 3 }]);
  assert.deepEqual(r, { mean: 2.75, n: 2, left: 2, min: 2, max: 3 });
  assert.equal(sgSummary([]), null);
  assert.equal(sgSummary(undefined), null);
  assert.equal(sgSummary([{ from: 0, to: 1, value: -99 }]), null);
  const m = read("src/components/GradeTonnageModal.jsx");
  assert.match(m, /length-weighted mean of \$\{sgLayer\.n\} Specific gravity rows/); // the CSV says where the density came from
  assert.match(m, /setDensity\(e\.target\.value\); setFromSg\(false\)/); // typing over it is then "entered by the user"
});
test("#1212 plot data columns are named after the axes, for a diagram with an explanation in the label and one without", () => {
  const assays = [{ hole_id: "H", from: 0, to: 1, values: { K: 3, Mg: 2, Na: 1, Ca: 1, Fe: 5, Si: 30 } }];
  assert.deepEqual(Object.keys(diagramExportRows(assays, DIAGRAMS.boxplot, { K: "%", Mg: "%", Na: "%", Ca: "%", Fe: "%" })[0]), ["hole_id", "from", "to", "CCPI", "AI"]);
  assert.deepEqual(Object.keys(diagramExportRows(assays, { project: () => ({ x: 1, y: 2 }) }, {})[0]), ["hole_id", "from", "to", "x", "y"]);
  assert.match(read("src/modules/GeochemModule.jsx"), /tool: `Plot data: /);
});
test("#1237 only a name that states the plane follows it", () => {
  const p = read("src/components/TrendsPanel.jsx");
  const re = new RegExp(p.match(/const autoName = \/(.+)\/\.test/)[1].replace(/\\\\/g, "\\"));
  for (const n of ["Stereonet mean (88° → 247°)", "Mean of FLT (69° → 37°)", "Plane of Vein (10° → 5°)"]) assert.ok(re.test(n), n);
  for (const n of ["Main trend", "Stereonet mean", "Mean of FLT"]) assert.ok(!re.test(n), n);
});
test("#1187 labels narrow before they go; #1271, #1207, #1209 in place", () => {
  const rib = read("src/components/Ribbon.jsx");
  assert.ok(rib.indexOf('setAttribute("data-snug"') < rib.indexOf('setAttribute("data-compact"'));
  assert.match(read("src/styles/app.css"), /\.ge-ribbon-inner\[data-snug\] \.ge-ribbon-btn/);
  assert.match(read("src/components/BoundaryInterceptsModal.jsx"), /layerFilter === "all" \|\| i\.layerKey === layerFilter\) n\.set/);
  assert.match(read("src/components/StereonetModal.jsx"), /typeFilter === "all" && types\.length > 1/);
  assert.match(read("src/components/EvidenceOverlayPane.jsx"), /SURVEY_METHODS\[geophysSurveys\[k\]\?\.method\]/);
});
