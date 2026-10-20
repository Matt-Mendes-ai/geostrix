// TASKS.csv #623 — long-format assay exports (one row per element) pivot to one row per sample.
import test from "node:test";
import assert from "node:assert/strict";
import { detectLongAssay, pivotLongAssays, longAssayNote } from "../src/lib/longAssays.js";
import { parseTableText } from "../src/lib/tabular.js";
import { isElementColumn, inferUnit } from "../src/lib/geochem.js";

// same layout as a database export of analysis_geochem (columns and conventions, synthetic values)
const csv = `"hole_id","from","to","sample_id","purpose","cert_num","analysis_code","samp_type","analyte","internal_ref","units","concentration","flag","project"
DH-1,1.8,3.0,S1,assay,C1,ICP-130,core,Ag,"",ppm,0.8,,p
DH-1,1.8,3.0,S1,assay,C1,FAS-111,core,Au,"",ppm,-0.005,LDL,p
DH-1,1.8,3.0,S1,assay,C1,ICP-130,core,Zn,"",ppm,10000.0,UDL,p
DH-1,1.8,3.0,S1,assay,C1,ICA-6Zn,core,Zn,"",pct,1.071,,p
DH-1,3.0,4.5,S2,assay,C2,IMS-230,core,Ag,"",ppm,1.27,,p
DH-1,3.0,4.5,S2,assay,C3,IMS-230-rerun,core,Ag,"",ppm,1.25,,p
DH-1,3.0,4.5,S2,assay,C2,CPA-Au1,core,Au,"",ppm,0.031,,p
DH-1,3.0,4.5,S2,assay,C2,IMS-230,core,Zn,"",ppm,264.0,,p
DH-2,0.0,1.0,S3,assay,C4,FAS-111,core,Au,"",ppm,10.0,UDL,p
`;
const run = () => { const t = parseTableText(csv); return pivotLongAssays(t.rows, t.headers, (s) => inferUnit(s, s), (a) => isElementColumn(a)); };

test("#623 detection: analyte + concentration (+ units, method, flag)", () => {
  const c = detectLongAssay(parseTableText(csv).headers);
  assert.deepEqual([c.analyte, c.value, c.units, c.method, c.flag, c.sample], ["analyte", "concentration", "units", "analysis_code", "flag", "sample_id"]);
  assert.equal(detectLongAssay(["hole_id", "from", "to", "Au_ppm"]), null); // a wide file is not long
});

test("#623 one row per sample; methods mixed; ore-grade replaces UDL; LDL -> '<'; re-run ignored", () => {
  const p = run();
  assert.equal(p.rows.length, 3);
  assert.deepEqual(p.headers.slice(-3), ["Ag_ppm", "Au_ppm", "Zn_ppm"]);
  const [s1, s2, s3] = p.rows;
  assert.equal(s1.Zn_ppm, 10710);      // 1.071 % from the ore-grade method, in ppm, not the 10000 ppm limit
  assert.equal(s1.Au_ppm, "<0.005");   // LDL / negative = below detection
  assert.equal(s2.Ag_ppm, 1.27);       // the original, not the re-run
  assert.equal(s2.Au_ppm, 0.031);      // Au by CPA-Au1 here, FAS-111 elsewhere: both kept
  assert.equal(s3.Au_ppm, ">10");      // over-range with no re-assay
  assert.equal(s1.sample_id, "S1"); assert.equal(s1.samp_type, "core");
  const r = p.report;
  assert.deepEqual([r.overReplaced, r.overKept, r.reruns, r.belowDetection], [1, 1, 1, 1]);
  assert.match(longAssayNote(r), /9 rows → 3 samples/);
});
