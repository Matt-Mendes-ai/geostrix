// Small 3D Modelling slips from the Copley / Kodiak / Woodjam / WA reviews: TASKS.csv #1743 (#1846's empty-point part), #1847, #2069, #2071,
// #2233.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pointFromInputs } from "../src/lib/pointInput.js";
import { summarizeSupport } from "../src/lib/estimation.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");

test("#1743: Surface query's point needs all three coordinates (a blank box is not 0)", () => {
  assert.equal(pointFromInputs("", "", ""), null);
  assert.equal(pointFromInputs("381912.6", "5956098.2", ""), null);
  assert.equal(pointFromInputs("1", "x", "3"), null);
  assert.deepEqual(pointFromInputs("0", " 5 ", 7), { x: 0, y: 5, z: 7 }, "a typed 0 is a coordinate");
  assert.match(read("src", "components", "SurfaceQueryModal.jsx"), /const pt = pointFromInputs\(ptX, ptY, ptZ\);/);
});

test("#1847: the Estimation pane does not point at tools 'below' that are not there", () => {
  const s = read("src", "modules", "viewer", "ModellingPanes.jsx");
  assert.ok(s.includes("a separate workflow from the implicit surface tools.") && !s.includes("implicit surface tools below"));
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(!read("src", "locales", `${l}.json`).includes("implicit surface tools below"), l);
});

test("#2069: a restricted estimate (or one from the checked holes) is named so", () => {
  const s = read("src", "components", "GradeEstimationModal.jsx");
  assert.match(s, /params\.restrictedToVolumeName = shellInfo\.name;/);
  assert.match(s, /w = p\.restrictedToVolumeName \? `, in \$\{p\.restrictedToVolumeName\}` : ""/);
  // the checked-holes count read back from the recorded samplesFrom text
  const re = /^holes checked in the Holes list \((\d+) of/;
  assert.equal(re.exec("holes checked in the Holes list (18 of 430)")[1], "18");
  assert.ok(s.includes("/^holes checked in the Holes list \\((\\d+) of/") && s.includes("samplesFrom: samplesFrom === \"checked\""));
});

test("#2071: the Grade shell's support advice names controls its pane has", () => {
  const counts = { interpolated: 10, extrapolated: 20, unsupported: 70, searchLimited: 3 };
  assert.match(summarizeSupport(counts), /Raising max samples, lengthening composites, or limiting samples per hole/);
  const sh = summarizeSupport(counts, { tool: "shell" });
  assert.doesNotMatch(sh, /Raising max samples/);
  assert.match(sh, /Longer composites would convert those/);
  assert.match(read("src", "modules", "viewer", "modellingRuns.js"), /summarizeSupport\(grid\.supportCounts, \{ tool: "shell"[,}]/); // #2066 adds beyond
});

test("#2233: picks loaded but no type ticked under Contact orientations is said as such, not 'no structure picks found'", () => {
  const s = read("src", "modules", "viewer", "modellingRuns.js");
  const i = s.indexOf("No structure type is chosen as a contact orientation"), j = s.indexOf("No structure picks found — estimated");
  assert.ok(i > 0 && j > i, "the new branch comes before the import wording");
  assert.match(s.slice(i - 400, i), /!picksAtStart && \(layers\.structure \|\| \[\]\)\.some\(\(r\) => r\.dip != null && r\.azimuth != null\)/);
});
