// TASKS.csv #2024 — the Lab certificates review also counts the drill side: the drill samples no certificate in the files names
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assaysWithoutCertificate } from "../src/lib/labCertificate.js";

test("drill samples with an id and no certificate row are counted; QC, ids-less and named rows are not", () => {
  const cert = [{ sample_id: "A1001" }, { sample_id: " a1002 " }, { sample_id: "STD-1" }];
  const assays = [
    { sample_id: "A1001" }, { sample_id: "A1002" }, { sample_id: "A1003" }, { sample_id: "A1004" },
    { sample_id: "" }, { sample_id: "BLK-9", qc: true },
  ];
  const r = assaysWithoutCertificate(cert, assays, (a) => !a.qc);
  assert.deepEqual(r, { count: 2, examples: ["A1003", "A1004"] });
  assert.equal(assaysWithoutCertificate(cert, []).count, 0);
});

test("wired: regular lab samples only, shown in the review header", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /assaysWithoutCertificate\(all\.rows, assays, \(a\) => !isPxrfRow\(a\) && classifyQAQCRow\(a\) === "regular"\)/);
  const m = readFileSync(new URL("../src/components/LabCertificateModal.jsx", import.meta.url), "utf8");
  assert.match(m, /s\.noCert\?\.count > 0 &&/);
});
