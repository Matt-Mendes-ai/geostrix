// TASKS.csv #2195 (review #2174, WA gold) — export stamps say 'Project CRS: not set' on a project whose CRS was never chosen, not the placeholder
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stampLines, stampEpsg } from "../src/lib/provenance.js";

test("#2195 the stamp's CRS line", () => {
  assert.equal(stampEpsg({ epsg: 3156, crsSet: false }), "unset");
  assert.equal(stampEpsg({ epsg: 28351, crsSet: true }), 28351);
  assert.equal(stampEpsg({ epsg: 26910 }), 26910); // older projects without the flag
  const unset = stampLines({ tool: "QAQC", epsg: stampEpsg({ epsg: 3156, crsSet: false }) });
  assert.ok(unset.some((l) => /^Project CRS: not set/.test(l)));
  assert.ok(!unset.some((l) => /3156/.test(l)));
  assert.ok(stampLines({ tool: "QAQC", epsg: 28351 }).includes("Project CRS: EPSG:28351"));
});

test("#2195 every project-CRS stamp goes through stampEpsg", () => {
  for (const f of ["src/components/BestIntercepts.jsx", "src/components/CompositingModal.jsx", "src/components/DataQCModal.jsx", "src/components/GradeStatistics.jsx", "src/components/QAQCPanel.jsx", "src/modules/GeophysicsModule.jsx", "src/components/DcipPanel.jsx", "src/components/GradeTonnageLauncher.jsx", "src/components/GradeEstimationModal.jsx"]) {
    const s = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.match(s, /stampEpsg\(project\)/, f);
    assert.doesNotMatch(s, /stampLines\(\{[^}]*epsg: project\?\.epsg/, f);
  }
});
