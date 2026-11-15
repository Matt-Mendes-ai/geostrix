// TASKS.csv #3626 (Fireweed rehearsal) — internal note numbers ('(#532)', '(#656 — ...)', '(#803)') reached the user's files and dialogs: the composites CSV stamp, a trend-fitted shell's export stamp,
// a model package's notes, the public-geochemistry caveat and the run summaries. The strings a person reads carry no '(#nnnn' now. The one unit for silver ('Ag (g/t)' beside 'Ag (ppm)') is #3586's.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("no '(#nnnn' inside a string a file or a dialog prints", () => {
  const files = ["../src/lib/meshExport.js", "../src/lib/modelExport.js", "../src/lib/publicGeochem.js", "../src/modules/viewer/intrusionRun.js", "../src/modules/viewer/modellingRuns.js", "../src/components/CompositingModal.jsx"];
  for (const f of files) {
    for (const [i, line] of read(f).split("\n").entries()) {
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, ""); // a comment may cite the backlog
      assert.doesNotMatch(code, /["`'][^"`']*\(#\d{3,4}[^)"`']*\)[^"`']*["`']/, `${f}:${i + 1}`);
    }
  }
  assert.match(read("../src/lib/meshExport.js"), /m \(the block model's ellipsoid for the same radius\)/);
});
