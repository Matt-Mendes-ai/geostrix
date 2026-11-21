// TASKS.csv #3899 — the Help pane shows each page's title and area through tr() (the page heading, the index, search results, "See also"), and the First
// steps page's summary too. They are not literal tr() keys, so test/i18n786 cannot see them: four titles had no key and showed in English in every
// language. Every page of every Help file (Mine Design's included, for when it is switched on) must have its title and area in es / pt / fr / ar.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const dir = new URL("../src/help/pages/", import.meta.url);
const pages = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js")).sort()) for (const p of (await import(new URL(f, dir).href)).default) pages.push({ file: f, ...p });

test("#3899 every Help page title and area has a translation key in es / pt / fr / ar", () => {
  assert.ok(pages.length > 60, "the pages loaded");
  const pane = fs.readFileSync(new URL("../src/components/HelpPane.jsx", import.meta.url), "utf8");
  assert.match(pane, /\{tr\(page\.title\)\}/); assert.match(pane, /\{tr\(page\.area\)\}/); // what the pane passes through tr()
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    const missing = [];
    for (const p of pages) {
      for (const k of [p.title, p.area, ...(p.guide ? [p.summary] : [])]) if (!(k in d)) missing.push(`${p.file} ${p.id}: "${k}"`);
    }
    assert.deepEqual([...new Set(missing)], [], `${lang}: Help text the pane translates has no key`);
    for (const p of pages) assert.notEqual(d[p.title], "", `${lang}: an empty title for ${p.id}`);
  }
});
