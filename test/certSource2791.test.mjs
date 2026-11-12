// TASKS.csv #2791 (#2035's second point) — the QC rows a lab certificate adds were listed in 'Imported files & elements — remove…' as
// '(imported earlier · file not recorded)': the certificate import passed no file name. Each row now records its certificate file.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { combineCertificates } from "../src/lib/labCertificate.js";
import { assayFileSummary, removeAssayFile } from "../src/lib/geochem.js";

test("combineCertificates: each row keeps the file it came from", () => {
  const all = combineCertificates([
    { meta: { file: "WOO24-001.csv", certificate: "WOO24-001" }, columns: [], rows: [{ sample_id: "A1" }, { sample_id: "A2" }] },
    { meta: { file: "WOO24-002.csv" }, columns: [], rows: [{ sample_id: "B1" }] },
    { meta: {}, columns: [], rows: [{ sample_id: "C1" }] },
  ]);
  assert.deepEqual(all.rows.map((r) => r._file), ["WOO24-001.csv", "WOO24-001.csv", "WOO24-002.csv", undefined]);
  assert.ok(!all.headers.includes("_file"), "not a column of the sheet");
});

test("the remove panel names the certificate and removes its QC rows", () => {
  const assays = [
    { hole_id: "H1", from: 0, to: 1, values: { Cu: 1 }, srcFile: "Assay Samples.csv" },
    { hole_id: "H1", from: 1, to: 1, values: { Cu: 0.5 }, sample_type: "standard", srcFile: "WOO24-001.csv" },
    { hole_id: "H1", from: 2, to: 2, values: { Cu: 0.01 }, sample_type: "blank", srcFile: "WOO24-002.csv" },
  ];
  assert.deepEqual(assayFileSummary(assays).map((f) => f.file).sort(), ["Assay Samples.csv", "WOO24-001.csv", "WOO24-002.csv"]);
  const r = removeAssayFile(assays, "WOO24-001.csv");
  assert.equal(r.removed, 1);
  assert.equal(r.assays.length, 2);
});

test("wiring: the certificate commit maps each row's file, and the wide import reads it before the import's name", () => {
  const s = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.equal((s.match(/src_file: cert\._file \|\| "" \/\* #2791 \*\//g) || []).length, 2, "QC rows and filled rows");
  assert.match(s, /mapping: \{ hole_id: "hole_id", from: "from", to: "to", src_file: "src_file"/);
  assert.match(s, /const srcFile = \(mapping\.src_file && String\(r\[mapping\.src_file\] \?\? ""\)\.trim\(\)\) \|\| modal\.fileName;/);
  assert.match(s, /source: modal\.isPxrf \? "pXRF" : "assay", \.\.\.\(srcFile \? \{ srcFile \} : \{\}\) \};/);
});
