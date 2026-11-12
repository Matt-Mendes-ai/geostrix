// TASKS.csv #2614 — Export PNG prints only the page it saves (it printed every page of the document to a PDF and kept one), with that page's
// {page} / {pages} as in the document
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");

test("the print root gets the active page only for a PNG, with its place in the document", () => {
  assert.match(m, /pages=\{pagesWithPrintSrcs\(printing\.kind === "png" \? layoutPages\.filter\(\(pg\) => pg\.id === activeLayoutPageId\) : layoutPages, printSrcs\)/); // #2303: with the print-pass images
  assert.match(m, /pageOffset=\{printing\.kind === "png" \? Math\.max\(0, layoutPages\.findIndex\(\(pg\) => pg\.id === activeLayoutPageId\)\) : 0\} pageTotal=\{layoutPages\.length\}/);
  assert.match(m, /textContextFor\(pg\.elements \|\| \[\], project, pg, i \+ pageOffset, pageTotal \?\? pages\.length,/);
});

test("the PNG renders page 1 of that one-page print", () => {
  assert.match(m, /const canvas = await renderPdfPage\(doc, 1, \(Math\.max\(wmm, hmm\) \/ 25\.4\) \* dpi\);/);
});
