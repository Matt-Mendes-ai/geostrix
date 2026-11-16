// TASKS.csv #3854 (Scottie Gold, regression of #3591) — the pages Best intercepts added to Layout from the 3D View carried no data credit: the
// credit was put on by LayoutModule's own wrapper only. Now the store's addLayoutPages puts it on, so every caller gets it; checked here through the
// store itself (bundled with esbuild, rendered with react-test-renderer), called from outside Layout the way Best intercepts calls it.
import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { addPagesOnPaper } from "../src/lib/pageFormats.js";
import { pagePrintsCredit } from "../src/lib/layoutCredits.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window.confirm = () => true;
globalThis.window.desktop = {
  saveFile: async () => ({ ok: true }), openFile: async () => ({ ok: false }),
  autosaveWrite: async () => ({ ok: true }), autosaveRead: async () => ({ ok: false }), autosaveClear: async () => ({ ok: true }), autosaveQuarantine: async () => ({ ok: false }), setDirtyState: () => {},
};
const here = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-credit3854-"));
const out = path.join(dir, "store.bundle.mjs");
writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", "src", "lib", "store.jsx")], bundle: true, write: false, format: "esm", platform: "node", jsx: "transform",
  external: ["react", "react-dom"], loader: { ".js": "jsx" }, logLevel: "silent" }).outputFiles[0].text);
const { StoreProvider, useStore } = await import(pathToFileURL(out).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));

function mount() {
  const ref = { current: null };
  const Probe = () => { ref.current = useStore(); return null; };
  let r;
  act(() => { r = TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Probe))); });
  return { s: () => ref.current, unmount: () => act(() => r.unmount()) };
}
const table = (id) => ({ id, type: "table", x: 40, y: 40, w: 700, h: 400, rows: [] });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); }); // the credit's code is loaded just after startup (#3854: not in the startup bundle)
const creditOnFoot = (pg, maxY) => {
  assert.ok(pagePrintsCredit(pg.elements), `${pg.name} prints the credit`);
  const c = pg.elements.find((el) => el.type === "text" && /\{credits\}/.test(el.text));
  assert.ok(c.y > maxY * 0.7 && c.y < maxY, `${pg.name}: along the foot of its paper (y ${c.y})`);
  assert.equal(pg.elements.filter((el) => el.type === "text" && /\{credits\}/.test(el.text)).length, 1, "once");
};

test("pages added from outside Layout (Best intercepts' own page and its continuation pages) each print the data credit, before and after the credit's code has loaded", async () => {
  const m = mount();
  try {
  act(() => m.s().setProjectDataCredit("Data: BC ARIS (SYNTHETIC TEST)."));
  const fmt = { size: "A4", orientation: "portrait" };
  const add = (k) => { let ids; act(() => { ids = addPagesOnPaper(m.s().addLayoutPages, m.s().setLayoutPageFormat, [{ name: `Best intercepts ${k}`, elements: [table(`t${k}1`)] }, { name: `Best intercepts ${k} (2)`, elements: [table(`t${k}2`)] }, { name: `Best intercepts ${k} (3)`, elements: [table(`t${k}3`)] }], fmt); }); return ids; };
  // exactly as BestIntercepts.jsx adds them: the store's addLayoutPages wrapped by addPagesOnPaper, on the open page's paper. Right after startup: the
  // credit goes on as soon as its code arrives
  const early = add("a");
  await settle();
  const pagesEarly = m.s().layoutPages.filter((pg) => early.includes(pg.id));
  assert.equal(pagesEarly.length, 3);
  pagesEarly.forEach((pg) => creditOnFoot(pg, 1123));
  // later: at once
  const later = add("b");
  const pagesLater = m.s().layoutPages.filter((pg) => later.includes(pg.id));
  assert.equal(pagesLater.length, 3);
  pagesLater.forEach((pg) => creditOnFoot(pg, 1123));
  } finally { m.unmount(); } // a failure must not leave the store's timers running
});

test("a page that already prints the credit is left as it is; a project with no credit gets none", async () => {
  const m = mount();
  try {
  await settle();
  let ids;
  act(() => { ids = m.s().addLayoutPages([{ name: "plain", elements: [table("a")] }]); });
  assert.equal(m.s().layoutPages.find((pg) => pg.id === ids[0]).elements.length, 1, "no credit in the project: no line");
  act(() => m.s().setProjectDataCredit("Data: synthetic owner."));
  const own = { id: "c", type: "text", x: 10, y: 10, w: 300, text: "Source: {credits}" };
  act(() => { ids = m.s().addLayoutPages([{ name: "own", elements: [table("b"), own] }]); });
  assert.deepEqual(m.s().layoutPages.find((pg) => pg.id === ids[0]).elements.map((el) => el.id), ["b", "c"]);
  } finally { m.unmount(); }
});

test("one place: Layout no longer wraps it, and nothing outside the store adds pages around addLayoutPages", () => {
  const src = (f) => readFileSync(path.join(here, "..", "src", f), "utf8");
  const store = src("lib/store.jsx");
  assert.match(store, /const credited = creditedNow\(rawPages\), pages = credited \|\| rawPages;/);
  assert.match(store, /if \(!credited\) creditLater\(withIds\.map\(\(p\) => p\.id\)\);/);
  assert.match(store, /const bare = \{ name: "", elements: addViewportToPage\(\[\], mkView[^\n]*pg = creditedNow\(\[bare\]\)\?\.\[0\]/, "the viewport's own new page (#3451) too");
  // the credit's code is not in the startup bundle: the store loads it, it does not import it
  assert.doesNotMatch(store, /^import [^\n]*from "\.\/(credits|creditLine|layoutCredits)\.js"/m);
  assert.match(store, /Promise\.all\(\[import\("\.\/credits\.js"\), import\("\.\/creditLine\.js"\)\]\)/);
  const lay = src("modules/LayoutModule.jsx");
  assert.doesNotMatch(lay, /addLayoutPagesRaw/);
  // every other module and component reaches pages through the store's methods only
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.jsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
  const offenders = walk(path.join(here, "..", "src")).filter((f) => !f.endsWith(path.join("lib", "store.jsx")) && /setLayoutPages\(/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});

test("Best intercepts plans its own and its continuation pages around the credit line, and the Layout table's rows are the height the plan uses", async () => {
  const { continuationRanges, interceptTablePlan } = await import("../src/lib/interceptTable.js");
  const { creditsElement } = await import("../src/lib/layoutCredits.js");
  const { pagePx } = await import("../src/lib/pageFormats.js");
  const { collarTableHeight } = await import("../src/lib/collarTable.js");
  for (const fmt of [null, { size: "A4", orientation: "portrait" }]) {
    const page = pagePx(fmt), credit = creditsElement(fmt, "Data: synthetic owner, not for redistribution.");
    const bare = continuationRanges(10, 400, page, { w: 560 }), withCredit = continuationRanges(10, 400, page, { w: 560, elements: [credit] });
    assert.ok(withCredit[0][1] - withCredit[0][0] < bare[0][1] - bare[0][0], "fewer rows a page when the credit is on it");
    assert.equal(withCredit.at(-1)[1], 400, "every intercept still printed");
    const n = withCredit[0][1] - withCredit[0][0], p = interceptTablePlan([credit], page, { total: 390, w: 560, noteRows: 0 });
    assert.ok(p.y + collarTableHeight(n + 1) <= credit.y, `the table (and its 'continued' row) ends above the credit: ${p.y + collarTableHeight(n + 1)} <= ${credit.y}`);
  }
  const bi = readFileSync(path.join(here, "..", "src", "components", "BestIntercepts.jsx"), "utf8");
  assert.match(bi, /if \(ownPage\) plan = interceptTablePlan\(newPage, pageSize/);
  assert.match(bi, /continuationRanges\(plan\.shown, results\.length, pageSize, \{ w: tableW, elements: newPage/);
  // 'normal' line height drew 17 px rows at 7 pt where lib/collarTable.js plans 16.2 px: a 40-row page ran 20 px into the credit
  assert.match(readFileSync(path.join(here, "..", "src", "modules", "LayoutModule.jsx"), "utf8"), /whiteSpace: "nowrap", lineHeight: 1\.2 \/\* #3854/);
});
