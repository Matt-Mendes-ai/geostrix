// TASKS.csv #1636 — many layout pages: tabs scroll on their own, a page picker, a generated batch removed in one action
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the tab strip scrolls; the controls after it stay; a picker past 8 pages", () => {
  const m = read("../src/modules/LayoutModule.jsx");
  assert.match(m, /className="ge-layout-pagetabs" style=\{\{[^}]*flex: "1 1 auto", minWidth: 60, overflowX: "auto"/);
  assert.match(m, /layoutPages\.length > 8 && \(/);
  assert.match(m, /onChange=\{\(e\) => switchLayoutPage\(e\.target\.value\)\} aria-label=\{tr\("Go to page"\)\}/);
});

test("generated pages carry a batch and are removed together", () => {
  const s = read("../src/lib/store.jsx");
  assert.match(s, /\.\.\.\(pg\.batch \? \{ batch: pg\.batch \} : \{\}\)/);
  assert.match(s, /const gone = new Set\(Array\.isArray\(id\) \? id : \[id\]\);/);
  const a = read("../src/components/GenerateAtlasModal.jsx");
  assert.match(a, /addLayoutPages\(pages\.map\(\(pg\) => \(\{ \.\.\.pg, batch \}\)\)\)/);
  const m = read("../src/modules/LayoutModule.jsx");
  assert.match(m, /batch: `collars_\$\{sel\.id\}`/);
  assert.match(m, /deleteLayoutPage\(ids\)/);
});
