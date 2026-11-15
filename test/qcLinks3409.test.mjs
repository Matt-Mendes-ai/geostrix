// TASKS.csv #3409 — a QC link table (sample id, parent, category; no results) matched to the assays by sample id, kept with the project so assays imported
// later pair up, and said plainly (0 matches included). SYNTHETIC samples; the review's shape: 988 check samples linked to originals, none of their results present.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { idKey, readLinks, mergeLinks, applyLinks, linkReport, packLinks, unpackLinks, linkCount } from "../src/lib/qcLinks.js";
import { isMarkedQcRow } from "../src/lib/qaqcCore.js";

const tr = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
const COLS = { sample_id: "SampleID", parent_id: "Orig_SampleID", sample_type: "QC_Category" };
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("sample ids compare trimmed, case-blind, and 12345.0 is 12345", () => {
  assert.equal(idKey(" AB-1 "), "ab-1"); assert.equal(idKey("12345.0"), "12345"); assert.equal(idKey(12345), "12345"); assert.equal(idKey(null), "");
});

test("the link table: links with an id and a parent or a category; blanks, repeats and unknown categories are counted", () => {
  const rows = [
    { SampleID: "D1", Orig_SampleID: "S1", QC_Category: "Field Duplicate" },
    { SampleID: "D2", Orig_SampleID: "S2", QC_Category: "Lab Check" },
    { SampleID: "", Orig_SampleID: "S3", QC_Category: "Field Duplicate" },
    { SampleID: "D4", Orig_SampleID: "", QC_Category: "" },
    { SampleID: "d1", Orig_SampleID: "S1b", QC_Category: "Field Duplicate" },
    { SampleID: "X9", Orig_SampleID: "S9", QC_Category: "Mystery" },
  ];
  const r = readLinks(rows, COLS);
  assert.deepEqual(r.links.map((l) => l.sample_id), ["d1", "D2", "X9"], "the last row of a repeated id is kept");
  assert.equal(r.links[0].parent_id, "S1b");
  assert.equal(r.blank, 2); assert.equal(r.repeated, 1);
    assert.ok(r.unknownTypes.includes("Mystery"));
});

test("applied to the assays by sample id: type and parent filled, the rows become check samples; no guess by hole and depth", () => {
  const assays = [
    { hole_id: "H1", from: 0, to: 2, sample_id: "S1", values: { Au: 1 } },
    { hole_id: "H1", from: 0, to: 2, sample_id: "D1", values: { Au: 1.1 } },
    { hole_id: "H1", from: 2, to: 4, sample_id: "STD1", values: { Au: 3 } },
    { hole_id: "H1", from: 4, to: 6, values: { Au: 0.2 } }, // no sample id
  ];
  const links = [{ sample_id: "D1", parent_id: "S1", sample_type: "field duplicate" }, { sample_id: "std1", parent_id: "OREAS-45", sample_type: "standard" }, { sample_id: "GONE", parent_id: "S7", sample_type: "duplicate" }];
  const a = applyLinks(assays, links);
  assert.equal(a.matched, 2); assert.equal(a.changed, 2); assert.deepEqual(a.unmatched, ["GONE"]); assert.equal(a.noId, 1);
  assert.equal(a.rows[1].sample_type, "field duplicate"); assert.equal(a.rows[1].parent_id, "S1"); assert.ok(isMarkedQcRow(a.rows[1]), "now a check sample");
  assert.equal(a.rows[2].qc_code, "OREAS-45", "a standard's parent is its CRM");
  assert.equal(a.rows[0], assays[0], "an original is untouched"); assert.equal(a.rows[3], assays[3]);
  assert.equal(assays[1].sample_type, undefined, "the input is not changed");
  // nothing to change: the same array back
  assert.equal(applyLinks(a.rows, links).rows, a.rows); assert.equal(applyLinks(a.rows, links).changed, 0);
});

test("the review's shape: 988 links, no check sample's result in the project -> 'matched 0 of 988', links kept, and later assays pair up", () => {
  const originals = Array.from({ length: 964 }, (_, i) => ({ hole_id: "H1", from: i, to: i + 1, sample_id: `O${i}`, values: { U: 1 } }));
  const links = Array.from({ length: 988 }, (_, i) => ({ sample_id: `C${i}`, parent_id: `O${i % 964}`, sample_type: i < 818 ? "lab check" : "field duplicate" }));
  const a = applyLinks(originals, links);
  assert.equal(a.matched, 0); assert.equal(a.rows, originals);
  const say = linkReport({ links, applied: a, blank: 0, repeated: 0, assayCount: originals.length }, tr);
  assert.match(say, /^Matched 0 of 988: the check samples' results are not in the project\. The 988 links are kept: assays imported later with these sample ids pair up\.$/);
  // the project keeps them (merged with any it had), and the check samples' results arrive later
  const kept = mergeLinks([{ sample_id: "C0", parent_id: "old", sample_type: "x" }], links);
  assert.equal(kept.length, 988); assert.equal(kept.find((l) => l.sample_id === "C0").parent_id, "O0", "a later link replaces the earlier for the same id");
  const later = [{ hole_id: "H1", from: 0, to: 1, sample_id: "C5", values: { U: 1.02 } }, { hole_id: "H1", from: 9, to: 10, sample_id: "C900", values: { U: 0.9 } }];
  const b = applyLinks(later, kept);
  assert.equal(b.matched, 2);
  assert.deepEqual(b.rows.map((r) => [r.parent_id, r.sample_type]), [["O5", "lab check"], ["O" + (900 % 964), "field duplicate"]]);
});

test("the project keeps the links compactly: parallel arrays and a dictionary of categories, round-trip, the older shape read, far smaller than objects", () => {
  const links = Array.from({ length: 40000 }, (_, i) => ({ sample_id: `C${i}`, parent_id: `O${i}`, sample_type: i % 3 ? "field duplicate" : "lab check" }));
  const p = packLinks(links);
  assert.deepEqual(Object.keys(p), ["ids", "parents", "types", "dict"]);
  assert.deepEqual(p.dict, ["lab check", "field duplicate"]);
  assert.deepEqual(unpackLinks(p), links);
  assert.equal(linkCount(p), 40000); assert.equal(linkCount(links), 40000); assert.equal(linkCount(null), 0);
  assert.equal(unpackLinks(links), links, "an array of links (an earlier shape) reads as it is");
  assert.deepEqual(unpackLinks(packLinks([])), []);
  assert.ok(JSON.stringify(p).length < JSON.stringify(links).length * 0.6, `${JSON.stringify(p).length} bytes packed against ${JSON.stringify(links).length} as objects`);
});

test("the sentences: partial matches, no sample ids at all, rows left out, nothing to link", () => {
  const links = [{ sample_id: "A" }, { sample_id: "B" }, { sample_id: "C" }];
  const some = linkReport({ links, applied: { matched: 2, changed: 2, noId: 5, unmatched: ["C"] }, blank: 3, repeated: 1, unknownTypes: ["Mystery"], assayCount: 100 }, tr);
  assert.match(some, /^Matched 2 of 3 link\(s\): 2 assay row\(s\) now carry their QC category and parent sample\. The other 1 are kept: assays imported later with their sample ids pair up\./);
  assert.match(some, /5 assay row\(s\) have no sample id and cannot be reached\./);
  assert.match(some, /3 row\(s\) of the table had no sample id/); assert.match(some, /1 sample id\(s\) appeared more than once/); assert.match(some, /do not recognise these categories[^.]*: Mystery\./);
  assert.match(linkReport({ links, applied: { matched: 0, changed: 0, noId: 40 }, blank: 0, repeated: 0, assayCount: 40 }, tr), /None of the 40 assay rows has a sample id/);
  assert.match(linkReport({ links: [], applied: null, blank: 4, repeated: 0 }, tr), /^No link in this table/);
});

test("wired: a button in the link-table note, the commit in Geochem, the project keeps the links, a later import applies them", () => {
  const m = read("../src/components/AssayImportModal.jsx"), g = read("../src/modules/GeochemModule.jsx"), s = read("../src/lib/store.jsx");
  assert.match(m, /onQcLinks && \(modal\.qc\?\.parent_id \|\| modal\.qc\?\.sample_type\) && modal\.qc\?\.sample_id && <div[^\n]*<button type="button" onClick=\{onQcLinks\}/);
  assert.match(m, /tr\("Import as QC links \(\{n\} rows\)"/);
  assert.match(g, /const commitQcLinks = \(modal\) => \{/);
  assert.match(g, /store\.setProjectQcLinks\?\.\(packLinks\(all\)\);/);
  assert.match(g, /pairedLinks \? tr\("\{n\} check sample\(s\) in this file paired with the QC links kept with the project/);
  assert.match(g, /onQcLinks=\{\(\) => commitQcLinks\(assayModal\)\}/);
  assert.match(g, /if \(linkCount\(project\?\.qcLinks\)\) \{ const ap = applyLinks\(rows, unpackLinks\(project\.qcLinks\)\); rows = ap\.rows; pairedLinks = ap\.matched; \}\n\s+\/\/ TASKS\.csv #336/);
  assert.match(s, /const setProjectQcLinks = useCallback\(\(qcLinks\) => setProject\(/);
  assert.match(s, /setProjectDataCredit \/\* #3496 \*\/, setProjectQcLinks \/\* #3409 \*\/,/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["Import as QC links ({n} rows)", "Matched 0 of {m}: the check samples' results are not in the project. The {m} links are kept: assays imported later with these sample ids pair up."]) assert.ok(d[k], `${lang}: ${k.slice(0, 30)}`);
  }
});
