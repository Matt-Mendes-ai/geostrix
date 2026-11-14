// TASKS.csv #3370 — pages the app makes (Atlas, a collar table's continuation, a snapshot's own page, Best intercepts) take the paper of
// the page they are laid out for, not always A4 landscape
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addPagesOnPaper, snapshotPagePaper } from "../src/lib/pageFormats.js";

// the store's addLayoutPages keeps only id / name / elements / batch, as store.jsx does
function fakeStore() {
  const pages = [];
  return {
    pages,
    add: (pgs) => pgs.map((pg, i) => { const id = `p${pages.length}_${i}`; pages.push({ id, name: pg.name, elements: pg.elements, ...(pg.batch ? { batch: pg.batch } : {}) }); return id; }),
    setFormat: (id, format) => { const p = pages.find((x) => x.id === id); if (p) p.format = format; },
  };
}

test("each new page gets the paper it was laid out for", () => {
  const s = fakeStore();
  const ids = addPagesOnPaper(s.add, s.setFormat, [{ name: "GC-1", elements: [] }, { name: "GC-2", elements: [], batch: "atlas_1" }], { size: "a4", orientation: "portrait" });
  assert.equal(ids.length, 2);
  assert.deepEqual(s.pages.map((p) => p.format), [{ size: "a4", orientation: "portrait" }, { size: "a4", orientation: "portrait" }]);
  assert.equal(s.pages[1].batch, "atlas_1");
});

test("a page on the default paper is left without a format, as before", () => {
  const s = fakeStore();
  addPagesOnPaper(s.add, s.setFormat, [{ name: "P", elements: [] }], null);
  assert.equal(s.pages[0].format, undefined);
});

test("a snapshot's page: the source page's paper, portrait for tall pictures", () => {
  assert.deepEqual(snapshotPagePaper({ size: "a3", orientation: "portrait" }, [2.5]), { size: "a3", orientation: "portrait" });
  assert.deepEqual(snapshotPagePaper({ size: "a3", orientation: "landscape" }, [0.4]), { size: "a3", orientation: "portrait" });
  assert.deepEqual(snapshotPagePaper(null, [0.4]), { size: "a4", orientation: "portrait" });
  assert.equal(snapshotPagePaper(null, [1.8]), null);
  assert.deepEqual(snapshotPagePaper({ size: "letter", orientation: "landscape" }, [0.5, 1.6]), { size: "letter", orientation: "landscape" });
});

test("wired where pages are made", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /const paper = snapshotPagePaper\(activePage\?\.format, additions\.map\(\(a\) => a\.aspect\)\), P = pagePx\(paper\);/);
  assert.match(m, /addPagesOnPaper\(addLayoutPages, setLayoutPageFormat, \[\{ name, elements: \[\.\.\.atTop, \.\.\.moved\] \}\], paper\)/);
  assert.match(m, /addPagesOnPaper\(addLayoutPages, setLayoutPageFormat, conts\.map\(/);
  assert.match(m, /addLayoutPages=\{\(pgs\) => addPagesOnPaper\(addLayoutPages, setLayoutPageFormat, pgs, activePage\?\.format\)/);
  const b = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(b, /addLayoutPages: addPagesRaw, setLayoutPageFormat/);
  assert.match(b, /const addLayoutPages = typeof addPagesRaw === "function" \? \(pgs\) => addPagesOnPaper\(addPagesRaw, setLayoutPageFormat, pgs,/);
});
