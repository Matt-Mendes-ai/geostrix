// TASKS.csv #3245 — a dropped 'Mag Sus.csv' with From = To on every row (point readings) opened as a Custom layer although its name says mag susc; 'Specific Gravity.csv' did too. Reproduced with
// guessTargetFor over synthetic rows (a pure function: no state of earlier imports can change it, so the 'after a session of imports' was the shape of the file). Mag susc keeps its layer; a zero-length SG stays a
// Custom layer (a zero-length density interval has no length to weight and the tonnage tools leave it out); a log channel (Density_Best) is as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { guessTargetFor } from "../src/lib/layersImport.js";

const rows = (h, n, f) => Array.from({ length: n }, (_, i) => Object.fromEntries(h.map((c) => [c, f(c, i)])));
const point = (c, i) => /hole/i.test(c) ? "H" + (i % 5) : /from|^to$|depth/i.test(c) ? i + 1 : /comment/i.test(c) ? "ok" : 2.5 + (i % 9) / 10;
const span = (c, i) => (/^to$/i.test(c) ? i + 1.5 : point(c, i));
test("Mag Sus.csv keeps Mag susc whatever the shape; Specific Gravity.csv keeps SG unless it is point samples", () => {
  const ms = ["Hole ID", "From", "To", "Mag Sus", "Comments"], sg = ["Hole ID", "From", "To", "SG"];
  for (let k = 0; k < 3; k++) { // repeated: no state
    assert.equal(guessTargetFor(ms, "Mag Sus.csv", rows(ms, 40, point)), "magsusc", "From = To: point readings");
    assert.equal(guessTargetFor(ms, "Mag Sus.csv", rows(ms, 40, span)), "magsusc");
    assert.equal(guessTargetFor(["Hole ID", "Depth", "Mag Sus"], "Mag Sus.csv", rows(["Hole ID", "Depth", "Mag Sus"], 40, point)), "magsusc");
    assert.equal(guessTargetFor(sg, "Specific Gravity.csv", rows(sg, 40, span)), "sg");
    assert.equal(guessTargetFor(sg, "Specific Gravity.csv", rows(sg, 40, point)), "custom", "zero-length density intervals: asked as a custom layer");
  }
  const log = ["Hole ID", "From", "To", "MagSus_Best"];
  assert.equal(guessTargetFor(log, "Mag Sus.csv", rows(log, 40, point)), "custom", "a downhole log's channel is not this");
});

// TASKS.csv #3665 (Matt: 'C now, B later') — a point density table stays a Custom layer and the dialog says why and what to do
import fs from "node:fs";
import { pointDensityFile } from "../src/lib/layersImport.js";
test("#3665 point density readings: the dialog is told (file named for density, From = To), and only then", () => {
  const sg = ["Hole ID", "From", "To", "SG"];
  assert.equal(pointDensityFile(sg, "Specific Gravity.csv", rows(sg, 40, point)), true);
  assert.equal(pointDensityFile(sg, "Specific Gravity.csv", rows(sg, 40, span)), false, "real intervals: SG, no note");
  assert.equal(pointDensityFile(sg, "readings.csv", rows(sg, 40, point)), false, "not named for density: no note");
  assert.equal(pointDensityFile(["Hole ID", "From", "To", "Mag Sus"], "Mag Sus.csv", rows(["Hole ID", "From", "To", "Mag Sus"], 40, point)), false, "mag susc keeps its layer (#3245)");
  assert.equal(pointDensityFile(sg, "Specific Gravity.csv", []), false);
  const m = fs.readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8"), p = fs.readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(m, /modal\.pointDensity && \(/); assert.match(m, /give each reading a From–To interval/); assert.match(p, /pointDensityFile\(headers, file\.name, data\) \? \{ pointDensity: true \}/);
  const key = "This looks like a table of point density readings: From equals To on every row, so it opens as a Custom layer. A zero-length density reading cannot be length-weighted, so the density summary and the tonnage would leave it out. To use it as Specific gravity, give each reading a From–To interval and import it again; or keep it as a Custom layer to view.";
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(fs.readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))[key], l);
});
