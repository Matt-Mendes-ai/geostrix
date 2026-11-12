// TASKS.csv #2552 / #2429 / #1744 / #2697 / #2720 — the Grade tools open on the element last used there or the project's lead commodity (not the
// file's first column), list only elements with a lab value, label gold in g/t; the kriging line says 'fitted' once; under a structural trend
// the below-the-drilling advice points at the trend (the Vertical reach box is disabled); Surface query's CSV carries the sampled metres.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { preferredElement } from "../src/lib/preferredElement.js";
import { surfaceQueryRows } from "../src/lib/tableExports.js";

const read = (p) => fs.readFileSync(p, "utf8");

test("#2552: a lithium project's tools open on Li (the lead commodity), not on As, the first column", () => {
  assert.equal(preferredElement(["As", "Ba", "Cs", "Li", "Nb"], null, "Li"), "Li");
  assert.equal(preferredElement(["As", "Ba", "U"], null, null), "U", "the first commodity present");
  const est = read("src/components/GradeEstimationModal.jsx"), vg = read("src/components/VariogramModal.jsx"), mp = read("src/modules/viewer/ModellingPanes.jsx");
  assert.match(est, /keep\("symbol", preferredElement\(symbols, "estimate", lead\)/);
  assert.match(vg, /useState\(\(\) => preferredElement\(symbols, "variogram", lead\)/);
  assert.match(mp, /setNumericSymbol\(preferredElement\(shellSymbols, "gradeShell", shellLead\)\)/);
  for (const s of [est, vg]) assert.match(s, /\{s\} \(\{gradeUnitLabel\(s, elementUnits\[s\] \|\| "ppm"\)\}\)/, "g/t for gold in ppm (#2429)");
});

test("#1744: only elements with a lab value are offered", () => {
  const est = read("src/components/GradeEstimationModal.jsx"), vg = read("src/components/VariogramModal.jsx"), mp = read("src/modules/viewer/ModellingPanes.jsx");
  assert.match(est, /for \(const a of assays\) for \(const k in a\.values \|\| \{\}\) if \(Number\.isFinite\(a\.values\[k\]\)\) has\.add\(k\)/);
  assert.match(vg, /excludeQAQC\(labAssays\(assays \|\| \[\]\)\)/);
  assert.match(mp, /const symbols = shellSymbols; \/\/ #1744/);
});

test("#2429 / #2697: the kriging line says 'fitted' once; under a trend the advice names the trend", () => {
  const est = read("src/components/GradeEstimationModal.jsx");
  assert.ok(est.includes('tr("Kriged with the {model} variogram{v}:') && !est.includes("Kriged with the fitted"));
  assert.match(est, /modelTrend \? tr\("\{pct\}% of the estimated metal \(\{k\} of \{n\} blocks\) lies below the deepest sample of every hole within \{r\} m: carried down past the drilling\. The structural trend/);
});

test("#2720: Surface query's CSV has the sampled metres for a grade shell's element", () => {
  const rows = [{ hole_id: "A", minDistance: 0, atMd: 10, intercepts: [{ md: 10 }], insideLength: 20, sampledInside: 7.5, totalLength: 80 }];
  const q = surfaceQueryRows(rows, { surfaceName: "U shell", closed: true, sampledFor: "U" });
  assert.ok(q[0].includes("metres_inside_sampled_for_U"));
  assert.equal(q[1][q[0].indexOf("metres_inside_sampled_for_U")], "7.50");
  assert.ok(!surfaceQueryRows(rows, { surfaceName: "x", closed: true })[0].some((h) => /sampled/.test(h)), "no column without an element");
  assert.match(read("src/components/SurfaceQueryModal.jsx"), /sampledFor: mesh\?\.closed \? shellEl : null/);
});
