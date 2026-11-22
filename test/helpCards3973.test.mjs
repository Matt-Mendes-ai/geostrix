// TASKS.csv #3973 (batch A of #3967's plan) — the Help page as a card: K1 the header card (a picture, one line), K2 the cautions in view, K3 Use-instead
// chips, K4 the key settings with a gist, K5 a step strip, K6 closed folds (All settings, Messages, More) holding every sentence; a page without the
// card fields renders as before. Three pilots: Best intercepts, Grade shell, Point survey.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { wordsOf, countHelpPage } from "../scripts/word-count.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PILOTS = ["best-intercepts", "grade-shell", "point-survey"];
const { PAGES, pageById, searchPages } = await import("../src/help/content.js");
const CARD_IDS = PAGES.filter((p) => p.line).map((p) => p.id); // TASKS.csv #3983 — every page converted so far, the batches after the pilots too

test("every card page gives the card fields, within the plan's limits", () => {
  for (const id of CARD_IDS) {
    const p = pageById(id);
    assert.ok(p.line && wordsOf(p.line) <= 15, `${id}: one line of at most 15 words`);
    assert.ok(p.picture && (p.picture.help || p.picture.diagram || p.picture.drop?.length) && p.picture.alt, `${id}: a picture with its alt`); // help: #3978
    assert.ok(p.cautions?.length >= 1, id);
    assert.ok(p.keys.length >= 2 && p.keys.length <= 4, `${id}: two to four key settings`);
    for (const k of p.keys) {
      const f = p.fields.find((x) => x.name === k);
      assert.ok(f, `${id}: the key "${k}" is one of its settings`);
      assert.ok(f.gist && wordsOf(f.gist) <= 8, `${id}: "${k}" has a gist of at most 8 words`);
    }
    for (const x of p.instead || []) if (x.page) assert.ok(pageById(x.page), `${id}: the chip's page ${x.page} exists`);
    assert.ok(p.summary && p.fields.length && p.warnings.length, `${id}: the original text is still there`);
  }
  assert.deepEqual(pageById("best-intercepts").strip, ["Pick Zn and a cut-off", "Read the table", "Fill Including at ≥"], "a strip where the walk-through was in view");
  assert.equal(pageById("grade-shell").strip, undefined, "none where it was folded");
  // the protective cautions in view
  const gs = pageById("grade-shell").cautions.join(" | ").toLowerCase();
  for (const w of ["not a resource estimate", "43-101", "one hole", "search radius", "cap at or below the cutoff"]) assert.ok(gs.includes(w), `grade shell: "${w}"`);
  const bi = pageById("best-intercepts").cautions.join(" | ").toLowerCase();
  for (const w of ["certificates", "not true widths", "not zero"]) assert.ok(bi.includes(w), `best intercepts: "${w}"`);
  assert.match(pageById("point-survey").cautions[0], /not for resource estimation/);
  for (const id of PILOTS) assert.ok(CARD_IDS.includes(id), `${id} is a card page`);
});

test("the search still finds every sentence of a card page (fields, messages, Not for, walk-through, More)", () => {
  for (const id of CARD_IDS) {
    const p = pageById(id);
    const sentences = [p.summary, p.more, ...(p.notFor || []), ...p.fields.flatMap((f) => [f.what, f.choose, f.more]), ...p.warnings.flatMap((w) => [w.says, w.means, w.do]), ...(p.howto?.steps || []), p.line, ...p.cautions].filter(Boolean);
    for (const s of sentences) {
      const q = s.replace(/\{[^}]*\}/g, " ").split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")).filter((w) => /^[\p{L}\p{N}]{4,}$/u.test(w)).slice(0, 6).join(" ");
      if (!q) continue;
      assert.ok(searchPages(q).some((r) => r.page.id === id), `${id}: "${q}" finds it`);
    }
  }
});

test("a search hit opens the folds that hold its words, and brings the first into view", async () => {
  const { openFoldsFor } = await import("../src/help/openFolds.js");
  let scrolled = null;
  const fold = (text) => ({ textContent: text, open: false, scrollIntoView() { scrolled = this; } });
  const settings = fold("All settings (19) Cell (m) Grid cell size"), messages = fold("Messages (7) The shell was closed ARTIFICIALLY at the search-radius boundary"), more = fold("More Builds a wireframe");
  const root = { querySelectorAll: () => [settings, messages, more] };
  const opened = openFoldsFor(root, "artificially closed");
  assert.deepEqual(opened, [messages]);
  assert.equal(messages.open, true); assert.equal(settings.open, false); assert.equal(more.open, false);
  assert.equal(scrolled, messages);
  assert.deepEqual(openFoldsFor(root, " "), []);
  // a word every fold holds does not open them all: the fold with the most of the words wins
  const a = fold("settings: closed search radius"), b = fold("messages: closed ARTIFICIALLY at the search radius"), c = fold("more: closed");
  assert.deepEqual(openFoldsFor({ querySelectorAll: () => [a, b, c] }, "artificially closed search radius"), [b]);
  assert.equal(a.open || c.open, false);
  assert.deepEqual(openFoldsFor({ querySelectorAll: () => [fold("x")] }, "nowhere"), []);
});

test("word-count: a card page's seen first is K1-K5 only; the rest is behind its folds; other pages as before", () => {
  const page = { title: "Tool", line: "One line here.", cautions: ["Not a resource."], instead: [{ text: "Grids", to: "Maps" }], strip: ["Pick it"], keys: ["A"],
    summary: "A long summary of ten words that is now folded away.", notFor: ["Not this."], more: "More detail.",
    fields: [{ name: "A", gist: "the key", what: "What A is.", choose: "How." }, { name: "B", what: "What B is." }], warnings: [{ says: "Said.", do: "Do." }], howto: { steps: ["Step one."] } };
  const tally = (p) => { const t = { first: 0, more: 0 }; countHelpPage(p, (k, s, more) => { t[more ? "more" : "first"] += wordsOf(s); }); return t; };
  const t = tally(page);
  assert.equal(t.first, wordsOf("Tool One line here. Not a resource. Grids Maps Pick it A the key"));
  assert.equal(t.first + t.more, ["Tool", page.line, ...page.cautions, "Grids Maps", ...page.strip, page.summary, ...page.notFor, page.more, "A the key What A is. How.", "B What B is.", "Said. Do.", "Step one."].reduce((n, s) => n + wordsOf(s), 0), "nothing dropped");
  const { line: _l, ...plain } = page;
  assert.ok(tally(plain).first > t.first, "without `line`, the old rule");
});

// CardPage rendered statically (bundled with esbuild, react left out)
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-help3973-"));
const out = path.join(dir, "card.bundle.mjs");
writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", "src", "help", "CardPage.jsx")], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react"], logLevel: "silent" }).outputFiles[0].text);
test.after(() => rmSync(dir, { recursive: true, force: true }));

test("the card renders K1-K6: picture and line, cautions, chips (a link when the page exists), key settings, strip, folds closed", async () => {
  const CardPage = (await import(pathToFileURL(out).href)).default;
  const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");
  const More = ({ text }) => (text ? React.createElement("details", null, text) : null);
  const html = (id) => renderToStaticMarkup(React.createElement(CardPage, { page: pageById(id), onOpen() {}, pageExists: (p) => !!pageById(p), More, backButton: null, related: null }));
  const ps = html("point-survey");
  assert.match(ps, /class="ge-card"/);
  assert.match(ps, /data-help-line=""[^>]*>Imports values measured at points/);
  assert.equal((ps.match(/data-drop-picture=/g) || []).length, 2, "points, then grid");
  assert.match(ps, /data-help-cautions=""/);
  assert.equal((ps.match(/data-help-chip="/g) || []).length, 3, "three chips open a page");
  assert.match(ps, /Maps &gt; GeoTIFF \/ GXF<\/span><\/span>/, "the fourth has no page: plain");
  assert.equal((ps.match(/<dt /g) || []).length, 3 + pageById("point-survey").fields.length, "three key settings, and every setting in its fold");
  assert.doesNotMatch(ps, /<details[^>]* open/, "every fold closed");
  for (const f of ["settings", "messages", "more"]) assert.match(ps, new RegExp(`<details data-help-fold="${f}"`));
  assert.doesNotMatch(ps, /data-help-strip/);
  const bi = html("best-intercepts");
  assert.match(bi, /data-help-strip=""/);
  assert.match(bi, /How to: on the Macpass sample/);
  assert.equal((bi.match(/<li [^>]*><svg/g) || []).length, 3, "three cautions, each with its icon");
  const gs = html("grade-shell");
  assert.match(gs, /data-help-chip="grade-estimation"/);
  assert.match(gs, /role="img" aria-label="A modelled body is firm between the drill holes, extrapolated beyond them/); // #3978: N1 replaced the placeholder diagram
  // every sentence of the page is in the markup (in view or in a fold)
  const p = pageById("grade-shell"), esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  for (const s of [p.summary, p.more, ...p.notFor, ...p.fields.map((f) => f.what), ...p.warnings.map((w) => w.says), ...p.howto.steps]) assert.ok(gs.includes(esc(s)), s.slice(0, 50));
});

test("the Help pane: a card page goes to CardPage, others as before; a search opens its folds; the labels in every language", async () => {
  const { readFileSync } = await import("node:fs");
  const h = readFileSync(path.join(here, "..", "src", "components", "HelpPane.jsx"), "utf8").replace(/\r\n/g, "\n");
  assert.match(h, /if \(page\.line\) \{ \/\/ TASKS\.csv #3973/);
  assert.match(h, /onOpen=\{\(pid\) => go\(pid, query\)\}/);
  assert.match(h, /useEffect\(\(\) => \{ if \(focus && !query && bodyRef\.current\) openFoldsFor\(bodyRef\.current, focus\); \}, \[id, focus, query\]\);/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(path.join(here, "..", "src", "locales", `${lang}.json`), "utf8"));
    for (const k of ["Use instead", "All settings ({n})", "Messages ({n})"]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
