// TASKS.csv #2198 — the pXRF import says when the file looks like lab assays (lab batch columns, no instrument columns)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pxrfSignature } from "../src/lib/pxrfSignature.js";

test("the review's WAMEX lab file reads as lab assays; a pXRF export does not", () => {
  const lab = pxrfSignature(["HOLEID", "SAMPFROM", "SAMPTO", "SAMPLEID", "LABCODE", "LABJOBNO", "DESPATCHNO", "Au"]);
  assert.equal(lab.looksLikeLab, true);
  assert.deepEqual(lab.lab, ["LABCODE", "LABJOBNO", "DESPATCHNO"]);
  const xrf = pxrfSignature(["Reading No", "Instrument Serial", "Duration", "Hole", "From", "To", "Cu", "Cu Err", "Bal"]);
  assert.equal(xrf.looksLikeLab, false);
  assert.ok(xrf.pxrf.length >= 3);
  assert.equal(pxrfSignature(["Hole", "From", "To", "Cu"]).looksLikeLab, false); // nothing either way: no warning
});

test("the pXRF dialog shows the warning", () => {
  const a = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.match(a, /const labLike = modal\.isPxrf \? pxrfSignature\(modal\.headers \|\| \[\]\) : null;/);
  assert.match(a, /This file looks like lab assays/);
});
