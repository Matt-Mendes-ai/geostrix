// TASKS.csv #2889 (review #2876, WA bedded iron) — the material-type log opened as Lithology with no Value and Import disabled: its only
// code column (Logged_Strand, 34 codes) matched no alias, and its 43 Met_*_pct columns could only be added one Add click at a time.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { codeColumnGuess, numberColumnsLeft } from "../src/lib/valueGuess.js";
import { guessMapping } from "../src/lib/layers.js";

const MET = ["Met_ASB_pct", "Met_CLA_pct", "Met_GOE_pct", "Met_HEM_pct"];
const H = ["Hole_id", "Depth From", "Depth To", "Projectcode", "PRIORITY", "Logged_Strand", ...MET, "Pyrite_Found", "Cmnts"];
const STRANDS = ["CAV", "FILL", "DID_L", "MNG", "DID_M", "NJ", "NS"];
const rows = Array.from({ length: 400 }, (_, i) => ({ Hole_id: `RC${i % 20}`, "Depth From": String(i % 20), "Depth To": String((i % 20) + 1), Projectcode: "RH", PRIORITY: "1",
  Logged_Strand: STRANDS[i % STRANDS.length], Met_ASB_pct: "10", Met_CLA_pct: String(i % 40), Met_GOE_pct: "30", Met_HEM_pct: "", Pyrite_Found: i % 9 ? "No" : "Yes", Cmnts: `note ${i}` }));

test("no alias matched: the one code column is the guess (not the project, the yes / no flag or the comments)", () => {
  const m = guessMapping("litho", H);
  assert.equal(m.value, "", "no lithology alias in this file");
  assert.deepEqual(codeColumnGuess("litho", H, rows, m), { col: "Logged_Strand", codes: 7 });
  // a matched Value is left alone; numeric layers and the custom route are not guessed
  assert.equal(codeColumnGuess("litho", H, rows, { ...m, value: "Logged_Strand" }), null);
  assert.equal(codeColumnGuess("sg", H, rows, m), null);
  assert.equal(codeColumnGuess("custom", H, rows, m), null);
  // two code columns: no guess
  const two = rows.map((r, i) => ({ ...r, Rock2: i % 2 ? "BIF" : "SHL" }));
  assert.equal(codeColumnGuess("litho", [...H, "Rock2"], two, m), null);
});

test("every number column left over, for 'Add every number column'", () => {
  const m = { hole_id: "Hole_id", from: "Depth From", to: "Depth To", value: "Logged_Strand" };
  assert.deepEqual(numberColumnsLeft(H, rows, m, []), ["PRIORITY", ...MET.filter((c) => c !== "Met_HEM_pct")]);
  assert.deepEqual(numberColumnsLeft(H, rows, m, [{ column: "PRIORITY" }]), MET.filter((c) => c !== "Met_HEM_pct"), "already added: left out");
});

test("the import paths and the dialog use them", () => {
  const u = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.equal((u.match(/const codeGuess = codeColumnGuess\(target, headers, (data|rows), mapping0\), mapping = codeGuess \? \{ \.\.\.mapping0, value: codeGuess\.col \} : mapping0;/g) || []).length, 3);
  assert.equal((u.match(/\.\.\.\(codeGuess \? \{ valueGuess: codeGuess \} : \{\}\)/g) || []).length, 3);
  const d = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(d, /f\.key === "value" && modal\.valueGuess && modal\.mapping\.value === modal\.valueGuess\.col/);
  assert.match(d, /onClick=\{addAllNumbers\}/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["No column name matched, so {col} was chosen: the file's only column of codes ({n} codes). Check it is the one to draw.", "Add every number column ({n})", "as number fields on each row: {list}"]) assert.ok(j[k], `${l}: ${k}`);
  }
});
