// TASKS.csv #842 — QA/QC for surface programs: ALS-style certificates (Finalized + QC) into QC records, samples joined to
// their certificate, the program's own inserts found by name, lab duplicates paired with their certificate original
// (an over-range result never used as a value), batches against user targets, standards against certified values,
// blanks against a multiple of the detection limit, and QC rows of a sample file kept apart
import test from "node:test";
import assert from "node:assert/strict";
import { parseLabCertificate } from "../src/lib/labCertificate.js";
import { qcFromCertificates, certValues, classifyLabQcName, batchSummary, standardsByCode, blankResults, duplicatePairsSurface, duplicateStats, detectionLimitOf, qcRecordFromFileRow, qcSettings, censoredShares, methodsByElement } from "../src/lib/surfaceQaqc.js";

const head = (id, status, n) => `${id} - ${status}\nCLIENT : "Test Co"\n# of SAMPLES : ${n}\nDATE RECEIVED : 2024-07-01  DATE FINALIZED : 2024-07-10\nPROJECT : "Creek"\n`;
const FIN = head("VA24000001", "Finalized", 6) + `,Au-AA23,ME-ICP41,ME-ICP41,Cu-OG46
SAMPLE,Au,Cu,Zn,Cu
DESCRIPTION,ppm,ppm,ppm,%
S001, 0.012, 45, 120,
S002,<0.005, 30, 95,
S003, 0.250,>10000, 300, 1.85
S004, 0.008, 60, 140,
STD-OREAS45, 0.045, 700, 140,
BLANK #1,<0.005,<1,<2,
S004 DUP, 0.010, 52, 150,
`;
const QC = head("VA24000001", "QC", 6) + `,Au-AA23,ME-ICP41,ME-ICP41,Cu-OG46
SAMPLE,Au,Cu,Zn,Cu
DESCRIPTION,ppm,ppm,ppm,%
S001-DUP, 0.011, 47, 118,
S003-DUP, 0.240,>10000, 310, 1.80
BLANK,<0.005,<1,<2,
OXF28, 0.805,,,
OXF28, 0.790,,,
OXF28, 0.930,,,
`;
const units = { Au: "ppb", Cu: "ppm", Zn: "ppm" };
const samples = ["S001", "S002", "S003", "S004"].map((id, i) => ({ sample_id: id, x: i, y: 0, medium: "soil", values: {} }));

test("#842 lab QC names", () => {
  assert.deepEqual(classifyLabQcName("BLANK"), { kind: "blank", code: "BLANK" });
  assert.deepEqual(classifyLabQcName("B89618-DUP"), { kind: "duplicate", parent: "B89618" });
  assert.deepEqual(classifyLabQcName("OXF28"), { kind: "standard", code: "OXF28" });
});

test("#842 certificate values: unit conversion, below detection, ore-grade over the over-range ICP result", () => {
  const p = parseLabCertificate(FIN, "VA24000001.csv");
  const s3 = p.rows.find((r) => r.sample_id === "S003");
  const v = certValues(s3, p.columns, units);
  assert.equal(v.values.Au, 250, "0.250 ppm -> 250 ppb");
  assert.equal(v.values.Cu, 18500, "1.85 % ore grade, not '>10000'");
  assert.equal(v.methods.Cu, "Cu-OG46");
  assert.deepEqual(v.over, []);
  const s2 = certValues(p.rows.find((r) => r.sample_id === "S002"), p.columns, units);
  assert.ok(s2.bdl.includes("Au") && s2.values.Au === 2.5);
});

test("#842 certificates -> records, joined samples, the program's inserts by name", () => {
  const r = qcFromCertificates([parseLabCertificate(FIN, "VA24000001.csv"), parseLabCertificate(QC, "VA24000001QC.csv")], samples, units);
  assert.deepEqual(r.joined, { S001: "VA24000001", S002: "VA24000001", S003: "VA24000001", S004: "VA24000001" });
  assert.deepEqual(r.counts, { standard: 4, blank: 2, duplicate: 3 });
  const ins = r.records.filter((x) => x.source === "inserted").map((x) => [x.sample_id, x.kind, x.code || x.parent_id || null]);
  assert.deepEqual(ins, [["STD-OREAS45", "standard", "STD-OREAS"], ["BLANK #1", "blank", null], ["S004 DUP", "duplicate", "S004"]]);
  assert.deepEqual(r.unclassified, []);
  assert.equal(r.certificates[0].samples, 7);
  assert.deepEqual(methodsByElement(r.certificates).Cu.sort(), ["Cu-OG46", "ME-ICP41"]);
});

test("#842 duplicates pair with their original (certificate or project sample); an over-range side is skipped", () => {
  const r = qcFromCertificates([parseLabCertificate(FIN, "f.csv"), parseLabCertificate(QC, "fQC.csv")], samples, units);
  const cu = duplicatePairsSurface(r.records, samples, "Cu", units, { rpd: qcSettings(null).rpd });
  // samples carry no values here, so the originals come from the Finalized certificate
  assert.deepEqual(cu.map((p) => [p.sample_id, p.v1, p.v2, p.type]).sort(), [["S001-DUP", 45, 47, "lab"], ["S003-DUP", 18500, 18000, "lab"], ["S004 DUP", 60, 52, "field"]].sort());
  const s4 = cu.find((p) => p.sample_id === "S004 DUP");
  assert.ok(Math.abs(s4.rpd - 14.2857) < 1e-3 && !s4.fails, "field limit 30 %");
  const withSample = duplicatePairsSurface(r.records, [{ sample_id: "S001", values: { Cu: 90 } }], "Cu", units);
  assert.equal(withSample.find((p) => p.sample_id === "S001-DUP").v1, 90, "a project sample wins over the certificate copy");
  const floored = duplicatePairsSurface(r.records, samples, "Cu", units, { floor: 100 });
  assert.equal(duplicateStats(floored).used, 1, "pairs under the floor are shown but not counted");
});

test("#842 standards against their own repeats, then against a certified value", () => {
  const r = qcFromCertificates([parseLabCertificate(QC, "fQC.csv")], [], units);
  const own = standardsByCode(r.records, "Au", units).find((g) => g.code === "OXF28");
  assert.equal(own.n, 3); assert.equal(own.limits.certified, false);
  assert.ok(Math.abs(own.observed.mean - 841.67) < 0.01);
  const cert = standardsByCode(r.records, "Au", units, { OXF28: { Au: { mean: 805, sd: 25 } } }).find((g) => g.code === "OXF28");
  assert.equal(cert.limits.certified, true);
  assert.equal(cert.fails, 1, "930 is 5 SD above 805");
  assert.ok(Math.abs(cert.biasPct - 4.555) < 0.01);
});

test("#842 blanks against a multiple of the detection limit read from the data", () => {
  const recs = [{ kind: "blank", sample_id: "B1", values: { Au: 2.5 }, bdl: ["Au"] }, { kind: "blank", sample_id: "B2", values: { Au: 30 } }, { kind: "blank", sample_id: "B3", values: { Au: 20 } }];
  const dl = detectionLimitOf([...recs, { values: { Au: 2.5 }, bdl: ["Au"] }], "Au");
  assert.deepEqual(dl, { limit: 5, basis: "lt" });
  const b = blankResults(recs, "Au", units, 5 * dl.limit);
  assert.deepEqual(b.map((x) => x.fails), [false, true, false]);
});

test("#842 batches: program inserts and lab checks apart, insertion rate against the user's targets", () => {
  const smp = Array.from({ length: 40 }, (_, i) => ({ sample_id: `S${i}`, cert: i < 20 ? "A" : "B", values: {} }));
  const recs = [{ kind: "standard", batch: "A", source: "inserted" }, { kind: "standard", batch: "B", source: "inserted" }, { kind: "standard", batch: "B", source: "inserted" }, { kind: "blank", batch: "A", source: "lab" }];
  const s = batchSummary(smp, recs, qcSettings({ settings: { targets: { standard: 15 } } }));
  assert.deepEqual(s.map((b) => [b.batch, b.samples, b.standard, b.lab.blank, b.short.standard]), [["A", 20, 1, 1, true], ["B", 20, 2, 0, false]]);
  assert.equal(s[0].rate.standard, 20);
  const byCol = batchSummary([{ attrs: { Crew: "x" } }, { attrs: { Crew: "y" } }], [], qcSettings({ settings: { batchBy: "attr:Crew" } }));
  assert.deepEqual(byCol.map((b) => b.batch), ["x", "y"]);
});

test("#842 QC rows of a sample file become records; regular rows do not", () => {
  assert.equal(qcRecordFromFileRow({ sample_id: "1", type: "STREAM", values: {} }), null);
  assert.equal(qcRecordFromFileRow({ sample_id: "2", type: "Soil", values: {} }), null);
  const s = qcRecordFromFileRow({ sample_id: "3", type: "STD", values: { Cu: 700 }, attrs: { CRM: "OREAS 45" } });
  assert.equal(s.kind, "standard"); assert.equal(s.code, "OREAS 45");
  const d = qcRecordFromFileRow({ sample_id: "4", type: "Field Dup", values: { Cu: 50 }, parent_id: "1" });
  assert.equal(d.kind, "duplicate"); assert.equal(d.dupType, "field"); assert.equal(d.parent_id, "1");
  assert.equal(qcRecordFromFileRow({ sample_id: "5", type: "BLK", values: {} }).kind, "blank");
});

test("#842 below-detection shares", () => {
  const sm = [{ values: { Au: 2.5 }, bdl: ["Au"] }, { values: { Au: 10 } }, { values: { Au: 2.5 }, bdl: ["Au"] }, { values: {} }];
  assert.deepEqual(censoredShares(sm, [{ symbol: "Au", unit: "ppb" }]), [{ symbol: "Au", unit: "ppb", n: 3, bdl: 2, pct: (200 / 3) }]);
});

test("#842 a certificate re-saved through Excel (every line padded with commas) is still recognised", async () => {
  const { isLabCertificateText } = await import("../src/lib/labCertificate.js");
  const padded = FIN.split("\n").map((l, i) => (i === 0 ? `${l},,,,,,` : l)).join("\r\n");
  assert.ok(isLabCertificateText(FIN) && isLabCertificateText(padded));
  assert.ok(!isLabCertificateText("Hole,From,To\nSAMPLE,x\nDESCRIPTION,y"));
});

test("#842 certificate batches use the certificate's own sample count when its samples are not in the project", () => {
  const s = batchSummary([], [{ kind: "standard", batch: "C1", source: "inserted" }, { kind: "blank", batch: "C1", source: "lab" }], qcSettings(null), [{ id: "C1", samples: 41 }]);
  assert.deepEqual([s[0].samples, s[0].fromCertificate, s[0].standard], [40, true, 1], "41 rows minus the 1 program insert");
});
