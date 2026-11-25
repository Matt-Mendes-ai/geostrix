// TASKS.csv #3982 (batch C4 of #3967's plan) — the Maps, Geological Mapping, Layout and 3D View pages as cards, in the shape of the pilots (#3973):
// one line, a reused picture, the cautions in view, Use-instead chips, two to four key settings with a gist, a step strip only where the walk-through
// was in view. Nothing is deleted: every sentence is still on the page (in a fold) and found by the search; the protective cautions are in view.
// SYNTHETIC: the pages' own text only.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { wordsOf, countHelpPage } from "../scripts/word-count.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { pageById, searchPages } = await import("../src/help/content.js");
const FILES = { maps: ["boundaries", "map-layers", "claims", "web-layers"], surface: ["geology-map", "outcrop-structures"], layout: ["layout", "layout-title-block", "maps-plan-view"], view: ["slice-3d", "section-by-coordinates", "slice-series", "section-window", "unit-polygons", "interpretation-lines"] }; // #4003: the section window's own card, between the section pages and the polygons
const IDS = Object.values(FILES).flat();

// the cautions each page keeps in view, by their key words (all in one caution); a page not listed has none
const CAUTIONS = {
  "interpretation-lines": [["your interpretation", "nothing is picked"]],
  "maps-plan-view": [["where a hole goes", "not what it hit"], ["degrees", "not to scale", "crs"]],
  "section-by-coordinates": [["dashed", "projected", "no data"]], // #4003: the buffer's projected holes (the long form is the message on the page)
  "slice-series": [["dashed", "projected", "no data"]],
  "section-window": [["dashed", "projected", "no data"]],
  claims: [["checks no registry", "status current"]],
  "web-layers": [["wms", "a picture", "no values"]],
  layout: [["scale bar", "only for the view it is assigned to"]],
  "layout-title-block": [["several scales", "a scale bar on each view"]],
};
const STRIPS = ["map-layers", "geology-map", "outcrop-structures", "layout"]; // the walk-throughs that were in view (not folded)
const diagrams = [...readFileSync(path.join(here, "..", "src", "help", "diagrams", "index.jsx"), "utf8").match(/export const DIAGRAMS = \{([^}]*)\}/)[1].matchAll(/(\w+):/g)].map((m) => m[1]);
const drops = [...readFileSync(path.join(here, "..", "src", "components", "DropDiagram.jsx"), "utf8").matchAll(/^ {2}(\w+): \(id\) =>/gm)].map((m) => m[1]);
// batch B's Help pictures (#3978): their names in pictures.jsx
const helpPics = [...readFileSync(path.join(here, "..", "src", "help", "diagrams", "pictures.jsx"), "utf8").matchAll(/^ {2}(\w+): \{ Pic:/gm)].map((m) => m[1]);

test("#3982 the five pages that read a coordinate system show N3, 'check where it lands', as their picture (in view)", () => {
  assert.ok(helpPics.includes("lands"));
  for (const id of ["boundaries", "map-layers", "claims", "web-layers", "geology-map"]) {
    const p = pageById(id);
    assert.equal(p.picture?.help, "lands", id);
    assert.match(p.picture.alt, /lands? on the holes/, id);
  }
});

test("#3982 the 14 pages give the card fields, within the plan's limits", async () => {
  for (const [file, ids] of Object.entries(FILES)) {
    const pages = (await import(`../src/help/pages/${file}.js`)).default;
    assert.deepEqual(pages.map((p) => p.id).slice(0, ids.length), ids, `${file}: its pages`); // the later Maps pages (#4070) follow these
  }
  for (const id of IDS) {
    const p = pageById(id);
    assert.ok(p.line && wordsOf(p.line) <= 15, `${id}: one line of at most 15 words`);
    assert.ok(p.picture?.alt, `${id}: a picture with its alt`);
    if (p.picture.diagram) assert.ok(diagrams.includes(p.picture.diagram), `${id}: the diagram ${p.picture.diagram} exists`);
    else if (p.picture.help) assert.ok(helpPics.includes(p.picture.help), `${id}: the picture ${p.picture.help} exists`);
    else { assert.ok(p.picture.drop?.length >= 1 && p.picture.drop.length <= 2, id); for (const d of p.picture.drop) assert.ok(drops.includes(d), `${id}: the picture ${d} exists`); }
    assert.equal(p.diagram, undefined, `${id}: a diagram is the card's picture, not a second one`);
    assert.ok(p.keys.length >= 2 && p.keys.length <= 4, `${id}: two to four key settings`);
    for (const k of p.keys) {
      const f = p.fields.find((x) => x.name === k);
      assert.ok(f, `${id}: the key "${k}" is one of its settings`);
      assert.ok(f.gist && wordsOf(f.gist) <= 8, `${id}: "${k}" has a gist of at most 8 words`);
    }
    for (const x of p.instead || []) { assert.ok(x.text && x.to, id); if (x.page) assert.ok(pageById(x.page), `${id}: the chip's page ${x.page} exists`); }
    for (const c of p.cautions || []) assert.ok(wordsOf(c) <= 15, `${id}: a caution is one line`);
    assert.equal(!!p.strip, STRIPS.includes(id), `${id}: a strip only where the walk-through was in view`);
    if (p.strip) assert.ok(p.strip.length >= 2 && p.strip.length <= 6 && p.strip.every((s) => wordsOf(s) <= 5), id);
    assert.ok(p.summary && p.fields.length && p.warnings.length && p.howto.steps.length, `${id}: the original text is still there`);
  }
});

test("#3982 each page's protective cautions are in view (K2), and still said in full in its folds", () => {
  for (const id of IDS) {
    const p = pageById(id), want = CAUTIONS[id] || [];
    assert.equal((p.cautions || []).length, want.length, `${id}: ${want.length} caution(s)`);
    want.forEach((words, i) => { const c = p.cautions[i].toLowerCase(); for (const w of words) assert.ok(c.includes(w), `${id}: "${w}" in its caution`); });
    // counted as seen first, by word-count's own rule
    const first = []; countHelpPage(p, (k, s, more) => { if (k === "caution" && !more) first.push(s); });
    assert.deepEqual(first, p.cautions || [], `${id}: its cautions are seen first`);
  }
  // the long form of each caution is still on its page (Not for, a setting, or More)
  assert.ok(pageById("interpretation-lines").notFor.some((s) => /every line is your interpretation/.test(s)));
  assert.ok(pageById("maps-plan-view").notFor.some((s) => /not what it hit/.test(s)) && pageById("maps-plan-view").notFor.some((s) => /not to scale in metres/.test(s)));
  assert.ok(pageById("claims").notFor.some((s) => /does not check a registry/.test(s)) && pageById("claims").fields.find((f) => f.name === "Status").choose.includes("does not check it"));
  assert.ok(pageById("web-layers").notFor.some((s) => /picture, with no values/.test(s)));
  assert.ok(pageById("layout").notFor.some((s) => /only for the view it is assigned to/.test(s)));
  assert.ok(pageById("layout-title-block").notFor.some((s) => /scale bar on each view/.test(s)));
});

test("#3982 the search still finds every sentence of the 14 pages (fields, messages, Not for, walk-through, More, the card)", () => {
  for (const id of IDS) {
    const p = pageById(id);
    const sentences = [p.summary, p.more, p.picture.alt, ...(p.notFor || []), ...p.fields.flatMap((f) => [f.what, f.choose, f.more, f.gist]), ...p.warnings.flatMap((w) => [w.says, w.means, w.do, w.more]), ...(p.howto?.steps || []), p.line, ...(p.cautions || []), ...(p.strip || [])].filter(Boolean);
    for (const s of sentences) {
      const q = s.replace(/\{[^}]*\}/g, " ").split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")).filter((w) => /^[\p{L}\p{N}]{4,}$/u.test(w)).slice(0, 6).join(" ");
      if (!q) continue;
      assert.ok(searchPages(q).some((r) => r.page.id === id), `${id}: "${q}" finds it`);
    }
  }
});

test("#3982 the card text keeps the text rules: Canadian spelling, no backlog numbers, no placeholders but the Layout tokens", () => {
  const US = /\b(color|colors|colored|center|centered|meter|meters|gray|modeling|labeled|behavior|neighbor|catalog|canceled|favorite|sulfide)\b/i;
  for (const id of IDS) {
    const p = pageById(id);
    const card = [p.line, p.picture.alt, ...(p.cautions || []), ...(p.instead || []).flatMap((x) => [x.text, x.to]), ...(p.strip || []), ...p.fields.map((f) => f.gist)].filter(Boolean);
    for (const s of card) {
      assert.doesNotMatch(s, /TASKS|#\d{3,}/, `${id}: ${s}`);
      assert.doesNotMatch(s, US, `${id}: ${s}`);
      for (const m of s.matchAll(/\{([A-Za-z0-9_]+)\}/g)) assert.ok(id === "layout-title-block" && ["scale", "project", "date", "page", "pages", "credits"].includes(m[1]), `${id}: {${m[1]}}`);
    }
  }
});

// CardPage rendered statically (bundled with esbuild, react left out), as helpCards3973 does
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-help3982-"));
const out = path.join(dir, "card.bundle.mjs");
writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", "src", "help", "CardPage.jsx")], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react"], logLevel: "silent" }).outputFiles[0].text);
test.after(() => rmSync(dir, { recursive: true, force: true }));

test("#3982 each card renders its cautions in view, before every fold, and every sentence of the page in its markup", async () => {
  const CardPage = (await import(pathToFileURL(out).href)).default;
  const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");
  const More = ({ text }) => (text ? React.createElement("details", null, text) : null);
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  for (const id of IDS) {
    const p = pageById(id);
    const html = renderToStaticMarkup(React.createElement(CardPage, { page: p, onOpen() {}, pageExists: (x) => !!pageById(x), More, backButton: null, related: null }));
    const firstFold = html.indexOf("<details");
    assert.ok(firstFold > 0, id);
    assert.doesNotMatch(html, /<details[^>]* open/, `${id}: every fold closed`);
    assert.match(html, new RegExp(`data-help-line=""[^>]*>${esc(p.line).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<`), `${id}: the line`);
    if (p.cautions?.length) {
      const at = html.indexOf("data-help-cautions");
      assert.ok(at > 0 && at < firstFold, `${id}: the cautions sit above the folds`);
      for (const c of p.cautions) { const i = html.indexOf(esc(c)); assert.ok(i > at && i < firstFold, `${id}: "${c}" in view`); }
    } else assert.doesNotMatch(html, /data-help-cautions/, id);
    const keysAt = html.indexOf("data-help-keys");
    assert.ok(keysAt > 0 && keysAt < firstFold, `${id}: the key settings in view`);
    for (const k of p.keys) assert.ok(html.slice(keysAt, firstFold).includes(esc(p.fields.find((f) => f.name === k).gist)), `${id}: ${k}'s gist`);
    assert.equal((html.match(/data-help-chip="/g) || []).length, (p.instead || []).filter((x) => x.page).length, `${id}: a chip with a page is a link`);
    assert.equal(html.includes("data-help-strip"), !!p.strip, id);
    for (const s of [p.summary, p.more, ...p.notFor, ...p.fields.flatMap((f) => [f.what, f.choose, f.more]), ...p.warnings.flatMap((w) => [w.says, w.means, w.do, w.more]), ...p.howto.steps].filter(Boolean)) {
      const i = html.lastIndexOf(esc(s)); // a caution can repeat its Not for line word for word: the long form is the one in the fold
      assert.ok(i > firstFold, `${id}: "${s.slice(0, 50)}" is in a fold`);
    }
  }
});
