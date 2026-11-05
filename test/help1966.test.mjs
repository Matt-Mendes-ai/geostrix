// TASKS.csv #1966 — offline help: every tool pane has a page, every page is well formed and follows the text rules, search works,
// and the pages stay out of the startup bundle
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PANE_HELP, HELP_AREAS, helpIdForPane } from "../src/lib/help.js";
import { PAGES, pageById, searchPages } from "../src/help/content.js";

const SRC = new URL("../src/", import.meta.url);
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.jsx?$/.test(f) ? [p] : []; });
const srcFiles = walk(fileURLToPath(SRC));

test("#1966 every tool pane title in the source has a help page", () => {
  const titles = new Set();
  for (const f of srcFiles) {
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/TaskPaneHeader title="([^"]+)"/g)) titles.add(m[1]);
    for (const m of s.matchAll(/TaskPaneHeader title=\{tr\("([^"]+)"\)\}/g)) titles.add(m[1]);
    for (const m of s.matchAll(/paneHeader\("([^"]+)"/g)) titles.add(m[1]);
  }
  assert.ok(titles.size >= 40, `found ${titles.size} pane titles`);
  const missing = [...titles].filter((t) => !helpIdForPane(t));
  assert.deepEqual(missing, [], "a new pane needs an entry in src/lib/help.js PANE_HELP and a page in src/help/pages/");
  const noPage = Object.entries(PANE_HELP).filter(([, id]) => !pageById(id)).map(([t, id]) => `${t} -> ${id}`);
  assert.deepEqual(noPage, [], "every PANE_HELP id has a page");
});

test("#1966 pages are well formed: unique ids, a known area, the pane's own title, fields and steps", () => {
  const ids = PAGES.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "unique ids");
  const titleOf = Object.fromEntries(Object.entries(PANE_HELP).map(([t, id]) => [id, t]));
  for (const p of PAGES) {
    assert.ok(HELP_AREAS.includes(p.area), `${p.id}: area ${p.area}`);
    if (p.id !== "help-start") assert.equal(p.title, titleOf[p.id], `${p.id}: the title is the pane's own title`);
    assert.ok(typeof p.summary === "string" && p.summary.length > 60, `${p.id}: a summary`);
    for (const k of ["notFor", "fields", "warnings", "related"]) assert.ok(Array.isArray(p[k]), `${p.id}: ${k} is a list`);
    assert.ok(p.fields.length >= 1 || p.id === "help-start", `${p.id}: fields`);
    for (const f of p.fields) assert.ok(f.name && f.what, `${p.id}: a field needs a name and what it means`);
    for (const w of p.warnings) assert.ok(w.says && (w.means || w.do), `${p.id}: a message needs its text and what it means or what to do`);
    assert.ok(Array.isArray(p.howto?.steps) && p.howto.steps.length >= 2, `${p.id}: a how-to`);
    for (const r of p.related) assert.ok(pageById(r), `${p.id}: related page ${r} exists`);
  }
});

const prose = (p) => [p.title, p.summary, ...p.notFor, ...p.fields.flatMap((f) => [f.name, f.what, f.choose]), ...p.warnings.flatMap((w) => [w.says, w.means, w.do]), ...(p.howto?.steps || [])].filter(Boolean).join("\n");

test("#1966 text rules: no backlog numbers, Canadian spelling", () => {
  const US = /\b(color|colors|colored|coloring|center|centers|centered|meter|meters|gray|modeling|modeled|labeled|labeling|behavior|neighbor|neighbors|neighboring|catalog|canceled|favorite|sulfide|sulfides)\b/i;
  for (const p of PAGES) {
    const t = prose(p);
    assert.doesNotMatch(t, /TASKS|#\d{3,}/, `${p.id}: no backlog references`);
    const m = t.match(US);
    assert.equal(m, null, `${p.id}: Canadian spelling (found "${m?.[0]}")`);
  }
});

test("#1966 search finds pages by the words on screen, best first, and needs every word", () => {
  const r = searchPages("UBC model");
  assert.ok(r.length >= 1 && r[0].page.id === "block-models", JSON.stringify(r.map((x) => x.page.id)));
  assert.ok(r[0].snippet.length > 0);
  assert.deepEqual(searchPages("zzqx"), []);
  assert.deepEqual(searchPages(""), []);
  assert.equal(searchPages("ubc zzqx").length, 0, "every word must match");
});

test("#1966 the pages load with the Help panel, not at startup; F1, the menu and every pane's ? open it", () => {
  const help = readFileSync(new URL("../src/lib/help.js", import.meta.url), "utf8");
  assert.doesNotMatch(help, /from "\.\.\/help\//, "the startup index never imports the pages");
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.ok(app.includes('const HelpPane = React.lazy(() => import("./components/HelpPane.jsx"));'));
  assert.ok(app.includes('else if (action === "help") openHelp(null);') && app.includes('if (e.key !== "F1") return;'));
  const rib = readFileSync(new URL("../src/components/Ribbon.jsx", import.meta.url), "utf8");
  assert.ok(rib.includes("const help = helpId || helpIdForPane(title);") && rib.includes("onClick={() => openHelp(help)}"));
  const main = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  assert.ok(main.includes('{ label: L("GeoStrix Help"), accelerator: "F1", click: () => mainWindow?.webContents.send("menu", "help") }'));
  for (const f of srcFiles) { const s = readFileSync(f, "utf8"); if (/https?:\/\//.test(s) && /src[\\/]help[\\/]/.test(f)) assert.fail(`${f}: help pages fetch nothing and link nowhere`); }
});
