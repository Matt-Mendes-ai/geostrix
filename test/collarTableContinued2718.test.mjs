// TASKS.csv #2718 — a continued collar table prints 'Continued on page N' when the export holds its continuation
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { continuationPageIndex, continuationTables } from "../src/lib/collarTable.js";

const t1 = { id: "t1", type: "table", source: "collars", firstRow: 1, maxRows: 40 };

test("the pages that 'Continue on new pages' makes are found, page by page", () => {
  const conts = continuationTables(t1, 130); // rows 41, 81, 121
  const pages = [{ elements: [t1] }, ...conts.map((c) => ({ elements: [{ id: "x", type: "text" }, c] }))];
  assert.equal(continuationPageIndex(pages, 0, t1, 41), 1);
  assert.equal(continuationPageIndex(pages, 1, conts[0], 81), 2);
  assert.equal(continuationPageIndex(pages, 2, conts[1], 121), 3);
});

test("no continuation: another start row, another filter, an earlier page, a static table", () => {
  const pages = [
    { elements: [{ type: "table", source: "collars", firstRow: 41, holeFilter: "DD" }] },
    { elements: [t1] },
    { elements: [{ type: "table", source: "static", firstRow: 41 }, { type: "table", source: "collars", firstRow: 51 }] },
    { elements: [{ type: "table", source: "collars", firstRow: 41, holeFilter: "AC" }] },
  ];
  assert.equal(continuationPageIndex(pages, 1, t1, 41), null);
  assert.equal(continuationPageIndex(pages, 1, { ...t1, holeFilter: "AC" }, 41), 3);
});

test("wired: the print copy asks for the continuation; the key is in every dictionary", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /continuedOn: \(t, r\) => \{ const j = continuationPageIndex\(pages, i, t, r\); return j == null \? null : j \+ pageOffset \+ 1; \}/);
  assert.match(m, /ctx\?\.continuedOn\?\.\(el, nextRow\) \? tr\("Continued on page \{p\}"/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(d["Continued on page {p}"], lang);
  }
});
