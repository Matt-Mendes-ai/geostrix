// TASKS.csv #3682 (rehearsal round 3) — three places stated two density ranges: Data QC flagged outside 1-6 t/m3, Help said 1-8, and lib/densityWeight.js (the density-weighted grades of Best intercepts and Compositing)
// accepted 1-8 from a constant of its own. oneDensityRange3587 missed it because it listed five files by name. Now: no source file may define a density range of its own (the rule is every file under src), the
// weighted grades read the project's range, Help says what the app does, and the import notice says a value outside is left out of the density mean.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { densityLookup } from "../src/lib/densityWeight.js";
import { DEFAULT_DENSITY_RANGE } from "../src/lib/densityRange.js";
import { importCheckSummary } from "../src/lib/dataQC.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8").replace(/\r\n/g, "\n");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "locales" ? [] : walk(path.join(dir, e.name))) : /\.(js|jsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));

test("no source file defines a density range of its own, or states 1-8 for a density", () => {
  for (const f of walk(path.join(here, "..", "src"))) {
    if (/densityRange\.js$/.test(f)) continue;
    const text = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(text, /DENSITY_M(IN|AX)\s*=/, `${f}: a density range constant of its own`);
    assert.doesNotMatch(text, /\b(sg|density|specific gravity)\b[^\n]{0,80}\b1\s*(–|-|,|to)\s*8\b/i, `${f}: a 1-8 density range in code or text`);
  }
  assert.deepEqual(DEFAULT_DENSITY_RANGE, { min: 1, max: 6 });
});

test("the density-weighted grades read the project's range: 7 t/m3 is out by default, in with a 1-8 range", () => {
  const rows = [{ hole_id: "H", from: 0, to: 1, value: 7 }, { hole_id: "H", from: 1, to: 2, value: 6.5 }];
  assert.equal(densityLookup(rows), null, "outside 1-6: not a reading");
  const l = densityLookup(rows, { min: 1, max: 8 });
  assert.ok(l); assert.equal(l("H", 0, 1), 7);
  assert.match(read("../src/components/BestIntercepts.jsx"), /densityLookup\(layers\?\.sg, densityRange\)/);
  assert.match(read("../src/components/CompositingModal.jsx"), /densityLookup\(layers\?\.sg, densityRange\)/);
});

test("Help says 1 to 6 and what happens outside it; the density import notice says the value is left out of the mean", () => {
  const help = read("../src/help/pages/data.js");
  assert.match(help, /outside the plausible 1–6 range for Specific gravity/); assert.match(help, /1 to 6 t\/m³ until you change it in Data QC's Density boxes/); assert.match(help, /left out of the density mean/);
  const rows = [{ hole_id: "H", from: 0, to: 1, value: 6.9 }, { hole_id: "H", from: 1, to: 2, value: 2.7 }];
  const note = importCheckSummary(rows, [{ hole_id: "H" }], null, "Specific gravity rows", { min: 1, max: 6 }, { density: true });
  assert.match(note, /outside the plausible 1–6/); assert.match(note, /the density mean the tonnage tools use leaves them out/);
  assert.doesNotMatch(importCheckSummary(rows, [{ hole_id: "H" }], null, "Specific gravity rows", { min: 1, max: 6 }), /density mean/);
});
