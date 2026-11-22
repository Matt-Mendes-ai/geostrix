// TASKS.csv #3980 (batch C2 of #3967's plan) — the 3D Modelling and Tonnage pages as cards, on the pilots' pattern (src/help/CardPage.jsx), with existing pictures.
// The generic limits (one line, a picture, 2-4 key settings with gists, every sentence still found) are helpCards3973's, which loops over every card page.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { wordsOf, countHelpPage } from "../scripts/word-count.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { PAGES, pageById } = await import("../src/help/content.js");
const MODELLING = ["model-settings", "lithology-groups", "modelling-codes", "implicit-surface", "stratigraphic-stack", "explicit-surface", "structural-modelling", "vein-dyke", "alteration-modelling", "grade-shell", "grade-estimation", "grade-thickness", "geoml", "section-correlation", "model-from-map"];
const TONNAGE = ["grade-tonnage", "block-calculator", "unsampled-metres"];
const cautions = (id) => pageById(id).cautions.join(" | ").toLowerCase();

test("every page of the Modelling and Tonnage groups is a card, with a picture from the existing kit", () => {
  const inGroup = PAGES.filter((p) => p.area === "3D Modelling").map((p) => p.id).sort();
  assert.deepEqual(inGroup, [...MODELLING, ...TONNAGE].sort(), "the group has exactly these pages: a new one needs its card too");
  const drops = [...readFileSync(path.join(here, "..", "src", "components", "DropDiagram.jsx"), "utf8").matchAll(/^  ([a-z]+): \(id\) =>/gm)].map((m) => m[1]);
  assert.ok(drops.includes("holes") && drops.includes("grid"));
  const DIAGRAMS = Object.fromEntries([...readFileSync(path.join(here, "..", "src", "help", "diagrams", "index.jsx"), "utf8").match(/export const DIAGRAMS = \{([^}]*)\}/)[1].matchAll(/(\w+):/g)].map((m) => [m[1], 1]));
  for (const id of [...MODELLING, ...TONNAGE]) {
    const p = pageById(id);
    assert.ok(p.line, `${id} is a card page`);
    for (const d of p.picture.drop || []) assert.ok(drops.includes(d), `${id}: "${d}" is a DropDiagram picture`);
    if (p.picture.diagram) assert.ok(DIAGRAMS[p.picture.diagram], `${id}: the Help diagram ${p.picture.diagram}`);
    assert.equal(p.strip, undefined, `${id}: its walk-through is folded, so no step strip (the plan's section 7, decision 3)`);
    assert.equal(p.diagram, undefined, `${id}: the old page diagram became the card's picture`);
  }
  assert.equal(pageById("model-settings").picture.diagram, "surfaceShellBlock");
});

test("the protective cautions are in view (not a resource, one hole / extrapolated, no density, barren by default)", () => {
  for (const id of ["grade-estimation", "grade-thickness", "geoml", "block-calculator", "grade-tonnage"]) assert.match(cautions(id), /not a (mineral )?resource/, id);
  assert.match(cautions("grade-estimation"), /nor a mineral resource under ni 43-101 or jorc/);
  assert.match(cautions("grade-estimation"), /single-hole blocks assert continuity/);
  assert.match(cautions("grade-estimation"), /kriging variance is not an error bar/);
  assert.match(cautions("grade-estimation"), /a plane the shape of the drilling/); // PROTECTIVE: the plane is the shape of the drilling
  assert.match(cautions("grade-tonnage"), /no density, no tonnes/);
  assert.match(cautions("grade-tonnage"), /report nothing from it as one/);
  assert.match(cautions("unsampled-metres"), /barren, at half the lowest grade/);
  assert.match(cautions("explicit-surface"), /extrapolated, not data/);
  assert.match(cautions("implicit-surface"), /not a probability or a confidence/);
  assert.match(cautions("grade-thickness"), /no intercept counts as zero, not missing/);
  assert.match(cautions("geoml"), /held-back holes is the guide/);
  assert.match(cautions("model-from-map"), /nothing below ground is observed/);
  assert.match(cautions("structural-modelling"), /unnamed picks of one type become one surface/);
  assert.match(cautions("modelling-codes"), /does not test it/);
  assert.match(cautions("grade-shell"), /not a resource estimate/, "the pilot is untouched");
});

test("'Use instead' chips: pages that exist, the plan's routes, and the cover for a rock at the top of most holes (#3997)", () => {
  const to = (id) => (pageById(id).instead || []).map((x) => x.page || x.to);
  for (const id of [...MODELLING, ...TONNAGE]) for (const x of pageById(id).instead || []) if (x.page) assert.ok(pageById(x.page), `${id}: ${x.page}`);
  assert.deepEqual(to("lithology-groups"), ["modelling-codes"]);
  assert.deepEqual(to("structural-modelling"), ["vein-dyke", "implicit-surface"]);
  assert.deepEqual(to("alteration-modelling"), ["grade-shell"]);
  // the Cover and weathering tool is a menu item, not a page: its chip is plain text where the rock is the question
  for (const id of ["modelling-codes", "implicit-surface", "stratigraphic-stack"]) {
    const c = pageById(id).instead.find((x) => x.to === "Model > Cover and weathering");
    assert.ok(c && !c.page && /top of most holes|cover/i.test(c.text), `${id}: the Cover chip`);
  }
  assert.equal(pageById("explicit-surface").instead[0].page, "implicit-surface");
});

test("words seen first: each page short, the whole group about 85 % less", () => {
  const first = (p) => { let n = 0; countHelpPage(p, (_k, text, more) => { if (!more) n += wordsOf(text); }); return n; };
  const before = { "model-settings": 408, "lithology-groups": 244, "modelling-codes": 372, "implicit-surface": 483, "stratigraphic-stack": 393, "explicit-surface": 523, "structural-modelling": 268, "vein-dyke": 436, "alteration-modelling": 342, "grade-estimation": 649, "grade-thickness": 592, geoml: 358, "section-correlation": 329, "model-from-map": 381, "grade-tonnage": 422, "block-calculator": 249, "unsampled-metres": 278 }; // #3967's plan, the counts before
  let was = 0, now = 0;
  for (const id of Object.keys(before)) { const n = first(pageById(id)); assert.ok(n < 125, `${id}: ${n} words seen first`); was += before[id]; now += n; }
  assert.ok(now < was * 0.2, `${now} of ${was}`);
});

// CardPage rendered statically (bundled with esbuild, react left out), as helpCards3973 does
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-help3980-"));
const out = path.join(dir, "card.bundle.mjs");
writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", "src", "help", "CardPage.jsx")], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react"], logLevel: "silent" }).outputFiles[0].text);
test.after(() => rmSync(dir, { recursive: true, force: true }));

test("the card draws: the picture, the cautions, the Cover chip as plain text, a chip to a page that exists, the folds closed", async () => {
  const CardPage = (await import(pathToFileURL(out).href)).default;
  const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");
  const More = ({ text }) => (text ? React.createElement("details", null, text) : null);
  const html = (id) => renderToStaticMarkup(React.createElement(CardPage, { page: pageById(id), onOpen() {}, pageExists: (x) => !!pageById(x), More, backButton: null, related: null }));
  const is = html("implicit-surface");
  assert.match(is, /data-help-picture="support"/);
  assert.match(is, /data-help-chip="stratigraphic-stack"/);
  assert.match(is, /Model &gt; Cover and weathering/);
  assert.equal((is.match(/data-help-chip="/g) || []).length, 1, "the Cover route is not a link: no page of its own");
  assert.doesNotMatch(is, /<details[^>]* open/);
  assert.equal((is.match(/<li [^>]*><svg/g) || []).length, 2, "two cautions, each with its icon");
  const ge = html("grade-estimation");
  assert.equal((ge.match(/<li [^>]*><svg/g) || []).length, 4, "four protective cautions in view");
  const ms = html("model-settings");
  assert.match(ms, /role="img" aria-label="Side by side in section/);
  const bc = html("block-calculator");
  assert.match(bc, /data-drop-picture=/);
});
