// TASKS.csv #601 — lab certificates: parse, join by sample id, QC-type suggestions, placement, and the merge key
// that keeps a QC duplicate from overwriting its original.
import test from "node:test";
import assert from "node:assert/strict";
import { isLabCertificateText, parseLabCertificate, combineCertificates, joinCertificatesToAssays, suggestQcTypes, qcPlacement, indexAssaysForPlacement } from "../src/lib/labCertificate.js";
import { mergeAssayRows } from "../src/lib/geochem.js";
import { isMarkedQcRow, classifyQAQCRow } from "../src/lib/qaqc.js";

const SYMS = ["Au", "Ag", "Al", "As", "Ba", "Ca", "Cu", "Fe", "K", "Mo", "Pb", "Zn", "S", "Sb", "Bi", "W", "Cu"];
const UNITS = ["ppm", "ppm", "%", "ppm", "ppm", "%", "ppm", "%", "%", "ppm", "ppm", "ppm", "%", "ppm", "ppm", "ppm", "%"];
const METH = ["Au-ICP21", ...Array(15).fill("ME-MS61"), "Cu-OG62"];
// a drill sample whose values scale with k (each sample differs), a CRM (fixed), a blank (very low)
const drill = (k) => [0.01 * k, 0.2 * k, 7, 3 * k, 900 + k, 2.5, 100 * k, 3, 3, 2 * k, 5 * k, 40 * k, 0.5 * k, 0.4 * k, 0.1 * k, 1 * k, ""];
const CRM = [0.24, 1.1, 6.8, 12, 700, 3.1, 2750, 4.1, 2.2, 55, 18, 90, 1.2, 0.9, 0.6, 3, ""];
const BLANK = ["<0.001", "<0.01", 7.2, "<0.2", 950, 2.4, 3, 2.5, 3.1, "<0.05", 1.1, 4, "<0.01", "<0.05", "<0.01", "<0.1", ""];
function certText(rows) {
  return ['KL99000001 - Finalized', 'CLIENT : "Test Co"', '# of SAMPLES : ' + rows.length, 'DATE RECEIVED : 2023-07-14  DATE FINALIZED : 2023-08-11', 'PROJECT : "Test"', 'PO NUMBER : "T-1"',
    "," + METH.join(","), "SAMPLE," + SYMS.join(","), "DESCRIPTION," + UNITS.join(","),
    ...rows.map(([id, v]) => `${id},${v.join(",")}`)].join("\r\n");
}

test("#601 certificate parsed: metadata, method/symbol/unit headers, '<x' kept raw", () => {
  const t = certText([["S100", drill(1)], ["S101", CRM]]);
  assert.ok(isLabCertificateText(t));
  assert.ok(!isLabCertificateText("hole_id,from,to\nA,0,1\n"));
  const p = parseLabCertificate(t, "KL99000001.csv");
  assert.equal(p.meta.certificate, "KL99000001");
  assert.equal(p.meta.status, "Finalized");
  assert.equal(p.meta.project, "Test");
  assert.equal(p.meta.received, "2023-07-14");
  assert.equal(p.meta.finalized, "2023-08-11");
  assert.deepEqual(p.columns.filter((c) => c.symbol === "Cu").map((c) => c.header), ["Cu ppm ME-MS61", "Cu % Cu-OG62"]);
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[0].sample_id, "S100");
  assert.equal(p.rows[0]["Au ppm Au-ICP21"], "0.01");
});

test("#601 join by sample id; QC suggestions: blanks, one standard group, a duplicate of its neighbour", () => {
  const rows = [];
  const assays = [];
  let n = 100;
  for (let i = 1; i <= 40; i++) {
    const id = `S${n++}`; rows.push([id, drill(i)]); assays.push({ hole_id: "DH1", from: i * 2, to: i * 2 + 2, sample_id: id, values: {} });
    if (i % 10 === 0) rows.push([`S${n++}`, CRM]);
    if (i % 10 === 5) rows.push([`S${n++}`, BLANK]);
    if (i === 7 || i === 23) rows.push([`S${n++}`, drill(i).map((v) => (typeof v === "number" ? v * 1.05 : v))]); // duplicate of the sample just before
  }
  const all = combineCertificates([parseLabCertificate(certText(rows), "c.csv")]);
  const j = joinCertificatesToAssays(all.rows, assays);
  assert.equal(j.matched.length, 40);
  assert.equal(j.unmatched.length, 4 + 4 + 2);
  const cols = parseLabCertificate(certText(rows)).columns;
  const sug = suggestQcTypes(j.unmatched, j.matched.map((m) => m.cert), cols);
  const by = (t) => sug.filter((s) => s.type === t);
  assert.equal(by("blank").length, 4, JSON.stringify(sug));
  assert.equal(by("standard").length, 4);
  assert.equal(new Set(by("standard").map((s) => s.qc_code)).size, 1);
  assert.equal(by("duplicate").length, 2);
  const d = by("duplicate").map((s) => [s.sample_id, s.parent_id]);
  const dupOf7 = rows.findIndex(([id]) => id === d[0][0]);
  assert.equal(d[0][1], rows[dupOf7 - 1][0]); // its parent is the sample just before it
  assert.ok(sug.every((s) => s.reason));
});

test("#601 placement: duplicate on its parent's interval, standard at the insertion point; merge keeps the original", () => {
  const assays = [{ hole_id: "DH1", from: 0, to: 2, sample_id: "S100", source: "assay", values: { Cu: 100 } }, { hole_id: "DH1", from: 2, to: 4, sample_id: "S102", source: "assay", values: { Cu: 200 } }];
  const { byId, byPrefix } = indexAssaysForPlacement(assays);
  assert.deepEqual(qcPlacement("S101", null, byId, byPrefix), { hole_id: "DH1", from: 2, to: 2 }); // after S100
  assert.deepEqual(qcPlacement("S103", "S102", byId, byPrefix), { hole_id: "DH1", from: 2, to: 4 });
  const dup = { hole_id: "DH1", from: 2, to: 4, source: "assay", sample_type: "duplicate", sample_id: "S103", parent_id: "S102", values: { Cu: 205 } };
  assert.ok(isMarkedQcRow(dup) && !isMarkedQcRow(assays[0]));
  const m = mergeAssayRows(assays, [dup]);
  assert.equal(m.rows.length, 3); // added, NOT merged into S102
  assert.equal(m.rows[1].values.Cu, 200);
  assert.equal(mergeAssayRows(m.rows, [dup]).rows.length, 3); // re-importing the same QC sample merges with itself
  assert.equal(classifyQAQCRow(dup), "duplicate");
});
