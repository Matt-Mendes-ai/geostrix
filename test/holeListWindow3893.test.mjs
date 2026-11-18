// TASKS.csv #3893 (Matt, 2026-11-17: the Holes list "give it a scroll bar within it") and #3892 ("make all titles in the side panel bold"). Made-up hole ids.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { windowRange } from "../src/lib/listWindow.js";

const rd = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("windowRange: the rows in view plus the overscan, and the spacers that keep the scroll bar whole", () => {
  // 26 px rows, a 312 px box (12 rows), 10 rows over: at the top rows 0-22 (12 in view + 1 partial + 10 below)
  assert.deepEqual(windowRange(0, 26, 312, 1000, 10), { start: 0, end: 23, padTop: 0, padBottom: (1000 - 23) * 26 });
  // scrolled to row 500 (13,000 px): 490 - 523
  assert.deepEqual(windowRange(13000, 26, 312, 1000, 10), { start: 490, end: 523, padTop: 490 * 26, padBottom: (1000 - 523) * 26 });
  // the end: the last rows, no space below
  const e = windowRange(1000 * 26 - 312, 26, 312, 1000, 10);
  assert.equal(e.end, 1000); assert.equal(e.padBottom, 0); assert.equal(e.start, 978);
  // scrolled past the end (a list that just got shorter): still the last rows, never an empty window
  const past = windowRange(999999, 26, 312, 40, 10);
  assert.equal(past.end, 40); assert.ok(past.start < 40);
  // fewer rows than the box: all of them
  assert.deepEqual(windowRange(0, 26, 312, 5, 10), { start: 0, end: 5, padTop: 0, padBottom: 0 });
  // empty, and nonsense input
  assert.deepEqual(windowRange(0, 26, 312, 0, 10), { start: 0, end: 0, padTop: 0, padBottom: 0 });
  assert.deepEqual(windowRange(-50, 26, 312, 3, 10), { start: 0, end: 3, padTop: 0, padBottom: 0 });
  // every row is either drawn or under a spacer
  for (const top of [0, 7, 2600, 25999]) { const w = windowRange(top, 26, 312, 1000, 10); assert.equal(w.padTop / 26 + (w.end - w.start) + w.padBottom / 26, 1000); }
});

// HoleRowList rendered statically (bundled with esbuild, react left out) with 10,000 made-up holes: a bounded number of rows, in a labelled list box
const here = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-holes3893-"));
const out = path.join(dir, "holes.bundle.mjs");
writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", "src", "modules", "viewer", "ViewerParts.jsx")], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react", "three"], loader: { ".js": "jsx" }, logLevel: "silent" }).outputFiles[0].text);
test.after(() => rmSync(dir, { recursive: true, force: true }));

test("10,000 holes: the list draws a window of rows, not 10,000; one fixed row height; no 'Show more'", async () => {
  const { HoleRowList, HOLE_ROW_H, HOLE_LIST_ROWS, HOLE_LIST_OVERSCAN } = await import(pathToFileURL(out).href);
  const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");
  const holes = Array.from({ length: 10000 }, (_, i) => ({ hole_id: `DH-${String(i).padStart(5, "0")}` }));
  const html = renderToStaticMarkup(React.createElement(HoleRowList, { holes, filterKey: "", visibleHoles: {}, onToggle() {}, onOpenStripLog() {}, onSection() {}, onZoom() {} }));
  const rows = (html.match(/role="listitem"/g) || []).length;
  assert.equal(rows, HOLE_LIST_ROWS + 1 + HOLE_LIST_OVERSCAN, `${rows} rows drawn`);
  assert.match(html, /role="list" aria-label="Holes list" tabindex="0"/);
  assert.match(html, /max-height:min\(40vh, 312px\);overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable/);
  assert.ok(html.includes(`height:${(10000 - rows) * HOLE_ROW_H}px`), "the space below stands for the rows not drawn");
  assert.ok(html.includes("DH-00000") && !html.includes("DH-09999"), "the top of the list, sorted by id");
  assert.ok(!/Show \d+ more/.test(html));
  const few = renderToStaticMarkup(React.createElement(HoleRowList, { holes: holes.slice(0, 4), filterKey: "", visibleHoles: {}, onToggle() {}, onOpenStripLog() {} }));
  assert.equal((few.match(/role="listitem"/g) || []).length, 4); assert.ok(!/aria-hidden="true" style="height/.test(few), "no spacer for a short list");
});

test("wiring: a new filter scrolls back to the top; a row's text never wraps (the window depends on one height)", () => {
  const p = rd("../src/modules/viewer/ViewerParts.jsx");
  assert.match(p, /useEffect\(\(\) => \{ if \(boxRef\.current\) boxRef\.current\.scrollTop = 0;[^\n]*\}, \[filterKey\]\);/);
  assert.match(p, /height: HOLE_ROW_H, boxSizing: "border-box"/);
  assert.match(p, /whiteSpace: "nowrap" \}\} title=\{hole_id\}>\{hole_id\}<\/span>/);
  assert.ok(!p.includes("HOLE_ROWS_STEP"), "the 300-row step is gone");
});

test("#3892: the side-panel headings are bold through one token, mirrored in theme.js; no heading with the class sets its own weight", async () => {
  const css = rd("../src/styles/app.css");
  assert.match(css, /--font-weight-title: 700;/);
  assert.match(css, /\.ge-section-label \{[^}]*font-weight: var\(--font-weight-title\);/);
  const { fontWeights } = await import("../src/lib/theme.js");
  assert.equal(fontWeights.title, 700);
  assert.match(rd("../src/modules/viewer/ViewerParts.jsx"), /const popoverHeader = \{[^}]*fontWeight: "var\(--font-weight-title\)"/);
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".jsx") ? [p] : []; });
  const bad = [];
  for (const f of walk(path.join(here, "..", "src"))) { const s = readFileSync(f, "utf8"); for (const m of s.matchAll(/className="ge-section-label"[^>]*?style=\{\{[^}]*fontWeight/g)) bad.push(path.basename(f) + ": " + m[0].slice(0, 80)); }
  assert.deepEqual(bad, []);
});
