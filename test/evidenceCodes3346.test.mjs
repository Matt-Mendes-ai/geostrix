// TASKS.csv #3346 (review #3195, Galore Creek) — missing-information codes ('NR', 'No High-T Assemblage') and a source's shifted rows
// ('Calcic-BX (abundant gnt') were offered as geological evidence, each as four cards. Kept out now, with codes of fewer than five rows.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { notEvidenceCode, CODE_MIN_ROWS } from "../src/lib/evidenceSources.js";
import { roleForLithology } from "../src/lib/layers.js";

test("not recorded, no recovery and cut-off descriptions are not evidence; real codes are", () => {
  for (const c of ["NR", "nr", "N/R", "n/a", "NA", "None", "nil", "Unknown", "not logged", "No High-T Assemblage", "no alteration", "-", "?", "Calcic-BX (abundant gnt", ""]) assert.equal(notEvidenceCode(c, roleForLithology), true, c);
  assert.equal(notEvidenceCode("NRCV", roleForLithology), true, "no recovery by the name rules");
  for (const c of ["Potassic", "Calcic-BX", "Calcic-BX (abundant gnt)", "CPY", "1", "Biotite-Magnetite", "NOR", "North zone"]) assert.equal(notEvidenceCode(c, roleForLithology), false, c);
  assert.equal(CODE_MIN_ROWS, 5);
});

test("wiring: the evidence list's code cards skip them and need five rows", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.match(p, /foldedCodes\(rows, traces, \{ min: CODE_MIN_ROWS, field \}\)/);
  assert.match(p, /if \(notEvidenceCode\(c\.label, roleForLithology\) \|\| c\.variants\.some\(\(v\) => notEvidenceCode\(v, roleForLithology\)\)\) continue;/);
});
