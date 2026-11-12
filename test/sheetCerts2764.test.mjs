// TASKS.csv #2764 (split from #2024, review #2013 Woodjam) — the assay sheet keeps each sample's certificate number, and the Lab
// certificates review names the sheet's certificates that none of the given files is (VA23186444 in the sheet, VA24189659.csv given)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { qcColumns, qcFields } from "../src/lib/assayQcColumns.js";
import { sheetCertificatesNotGiven } from "../src/lib/labCertificate.js";

test("qcColumns: a certificate / lab job column is found, else the first per-element certificate column", () => {
  assert.equal(qcColumns(["HoleID", "From", "To", "SampleID", "Certificate", "Cu_ppm"]).certificate, "Certificate");
  assert.equal(qcColumns(["hole", "from", "to", "Lab Job No", "Au"]).certificate, "Lab Job No");
  assert.equal(qcColumns(["hole", "from", "to", "Cu ppm", "Cu certificate", "Au_Cert_No"]).certificate, "Cu certificate");
  assert.equal(qcColumns(["hole", "from", "to", "Au"]).certificate, "");
  assert.equal(qcColumns(["hole", "Description"]).certificate, "", "not a free-text column");
  assert.deepEqual(qcFields({ C: " VA23186444 " }, { certificate: "C" }), { certificate: "VA23186444" });
});

test("sheetCertificatesNotGiven: by the title's certificate number or the file name, most samples first", () => {
  const assays = [
    ...Array.from({ length: 5 }, () => ({ certificate: "VA24189653" })),
    ...Array.from({ length: 3 }, () => ({ certificate: "VA23186444" })),
    ...Array.from({ length: 2 }, () => ({ certificate: "KL24246430" })),
    { certificate: "va24189659" }, // given by file name, another case
    { certificate: "" }, {},
    { certificate: "QC1", sample_type: "standard" },
  ];
  const metas = [{ file: "VA24189653.csv", certificate: "VA24189653" }, { file: "C:\\certs\\VA24189659.csv" }];
  const r = sheetCertificatesNotGiven(assays, metas, (a) => !a.sample_type);
  assert.equal(r.rowsWith, 11);
  assert.deepEqual(r.missing, [{ certificate: "VA23186444", n: 3 }, { certificate: "KL24246430", n: 2 }]);
  assert.deepEqual(sheetCertificatesNotGiven([{ hole_id: "A" }], metas), { rowsWith: 0, missing: [] }, "no certificate column: nothing to say");
});

test("wiring: the import dialog shows the column, the review computes and shows the list", () => {
  const imp = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.match(imp, /\["certificate", tr\("Lab certificate"\) \/\* #2764 \*\/\]/);
  const geo = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(geo, /const sheetCerts = sheetCertificatesNotGiven\(assays, parsed\.map\(\(p\) => p\.meta\)/);
  assert.match(geo, /noCert \/\* #2024 \*\/, sheetCerts \/\* #2764 \*\//);
  const m = readFileSync(new URL("../src/components/LabCertificateModal.jsx", import.meta.url), "utf8");
  assert.match(m, /tr\("The assay sheet names \{n\} certificate\(s\) that none of these files is: \{list\}\."/);
  assert.match(m, /tr\("\{certificate\} \(\{n\} sample\(s\)\)"/);
});
