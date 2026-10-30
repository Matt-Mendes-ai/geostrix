// TASKS.csv #1141 — the Layout PDF printed the startup banners as extra pages: while a print root exists, everything outside
// it is hidden by an allow-list, not by a list of names. (Measured in Electron: 3 pages for a 1-page layout before, 1 after.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#1141 print hides everything that is not the print root, inside it or an ancestor of it", () => {
  const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
  assert.ok(css.includes("body:has(.ge-print-root) *:not(:has(.ge-print-root)):not(.ge-print-root):not(.ge-print-root *)"));
  const rule = css.slice(css.indexOf("body:has(.ge-print-root)"));
  assert.match(rule.slice(0, rule.indexOf("}")), /display: none !important/);
});

test("#1143 a section PDF is one page: the figure takes the page's height, on the paper that suits its shape", async () => {
  const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
  assert.match(css, /\.ge-section-body > svg \{[^}]*height: 98vh !important/); // a fixed mm height came out 10 % too tall when printed
  assert.match(css, /\.ge-section-body > :not\(svg\) \{ display: none !important; \}/);
  const { sectionPaper } = await import("../src/lib/pageFormats.js");
  assert.deepEqual(sectionPaper(1100, 1000), { landscape: true });
  assert.deepEqual(sectionPaper(1100, 1100), { landscape: true });
  assert.deepEqual(sectionPaper(1100, 2441), { landscape: false });
  const win = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(win, /savePDF\(`\$\{baseName\}\.pdf`, sectionPaper\(/);
});
