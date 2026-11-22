// TASKS.csv #3978 (batch B of #3967's plan; Matt approved the mock of N1-N4) — the Help cards' own pictures N1-N6 (src/help/diagrams/pictures.jsx):
// style A, colours from tokens only, no word inside the SVG (the legend is HTML at a text-size token, its labels translated), never mirrored; swapped
// into the card pages the plan names.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-help3978-"));
const bundle = (entry, name) => { const out = path.join(dir, name); writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", "src", ...entry)], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react"], logLevel: "silent" }).outputFiles[0].text); return out; };
const picsFile = bundle(["help", "diagrams", "pictures.jsx"], "pics.mjs"), cardFile = bundle(["help", "CardPage.jsx"], "card.mjs");
test.after(() => rmSync(dir, { recursive: true, force: true }));
const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");
const { HELP_PICTURES, SWATCH } = await import(pathToFileURL(picsFile).href);
const { pageById, PAGES } = await import("../src/help/content.js");

test("eight pictures (N1-N6, and N12 and N13 of #3979), each an SVG with no word in it and colours from tokens only", () => {
  assert.deepEqual(Object.keys(HELP_PICTURES), ["support", "depth", "lands", "norths", "cutoff", "composite", "save", "control"]);
  for (const [id, { Pic, legend }] of Object.entries(HELP_PICTURES)) {
    const svg = renderToStaticMarkup(React.createElement(Pic, { id: `t${id}` }));
    assert.match(svg, /^<svg viewBox="0 0 224 122"/, id);
    assert.doesNotMatch(svg, /<text|<tspan/, `${id}: the words are the HTML legend`);
    assert.doesNotMatch(svg, /(fill|stroke|stop-color|color)\s*[:=]\s*"?\s*(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/, `${id}: tokens only`);
    assert.match(svg, /var\(--color-/, id);
    assert.ok(legend.length >= 2 && legend.length <= 5, `${id}: a short legend`);
    for (const [kind] of legend) assert.ok(SWATCH[kind], `${id}: swatch ${kind}`);
    assert.ok(svg.length < 12000, `${id}: small (${svg.length} bytes)`);
  }
  for (const [k, s] of Object.entries(SWATCH)) assert.doesNotMatch(JSON.stringify(s), /#[0-9a-fA-F]{3,8}|rgba?\(/, `swatch ${k}: tokens only`);
});

test("the legend's labels are in every language", () => {
  const labels = [...new Set(Object.values(HELP_PICTURES).flatMap((p) => p.legend.map(([, l]) => l)))];
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(path.join(here, "..", "src", "locales", `${lang}.json`), "utf8"));
    for (const l of labels) assert.ok(d[l], `${lang}: "${l}"`);
  }
});

test("the pictures are in the pages the plan names (as far as those pages are cards)", () => {
  assert.equal(pageById("grade-shell").picture.help, "support");
  assert.equal(pageById("grade-shell").figure.help, "cutoff");
  assert.equal(pageById("best-intercepts").picture.help, "composite");
  assert.equal(pageById("point-survey").figure.help, "lands");
  assert.equal(pageById("undrilled-zones").picture.help, "support");
  assert.equal(pageById("planned-drillholes").figure.help, "norths");
  for (const p of PAGES) for (const f of [p.picture, p.figure]) if (f?.help) { assert.ok(HELP_PICTURES[f.help], `${p.id}: ${f.help}`); assert.ok(f.alt, `${p.id}: alt`); }
});

test("the card draws the picture, unmirrored, with its legend; a second picture under the key settings", async () => {
  const CardPage = (await import(pathToFileURL(cardFile).href)).default;
  const More = ({ text }) => (text ? React.createElement("details", null, text) : null);
  const html = (id) => renderToStaticMarkup(React.createElement(CardPage, { page: pageById(id), onOpen() {}, pageExists: (x) => !!pageById(x), More, backButton: null, related: null }));
  const gs = html("grade-shell");
  assert.match(gs, /<figure data-help-picture="support"[^>]*><div role="img" aria-label="A modelled body is firm between the drill holes[^"]*" dir="ltr"/);
  assert.match(gs, /<figcaption style="[^"]*font-size:var\(--font-size-sm\)/);
  assert.match(gs, /Between the holes: data<\/span>/);
  assert.match(gs, /data-help-picture="cutoff"/);
  assert.ok(gs.indexOf('data-help-keys=""') < gs.indexOf('data-help-picture="cutoff"'), "the second picture comes after the key settings");
  const ps = html("point-survey");
  assert.equal((ps.match(/data-drop-picture=/g) || []).length, 2, "its header pictures stay");
  assert.match(ps, /data-help-picture="lands"/);
  // the Use-instead chips are English "A → B": they read left to right in an Arabic interface too (their arrow pointed back)
  assert.equal((ps.match(/<button type="button" dir="ltr" data-help-chip=/g) || []).length, 3);
  assert.match(ps, /<span dir="ltr" style="[^"]*">.*Maps &gt; GeoTIFF/);
});

test("only the Help pane loads them: the kit exports its block; nothing at startup imports the pictures", () => {
  const dd = readFileSync(path.join(here, "..", "src", "components", "DropDiagram.jsx"), "utf8");
  assert.match(dd, /export function Block\(/);
  assert.doesNotMatch(dd, /import[^\n]*diagrams\/pictures/);
  const card = readFileSync(path.join(here, "..", "src", "help", "CardPage.jsx"), "utf8");
  assert.match(card, /import \{ HELP_PICTURES, SWATCH \} from "\.\/diagrams\/pictures\.jsx";/);
});
