// TASKS.csv #3889 (Matt, 2026-11-17: "surface geology module make it sounds like surficial geology ... Geological Mapping") — the user-facing name
// only: the tab id `surface`, file names, saved keys and code comments keep the old words. The four translations are Matt's choice.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "..");
const rd = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(js|jsx)$/.test(f) ? [p] : []; });
// a file's text with its comments taken out (strings kept), to look only at what a user can read
const noComments = (s) => s.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str || "");

test("the tab is 'Geological Mapping'; its id is still 'surface'", () => {
  const app = rd("src/App.jsx");
  assert.match(app, /\{ id: "surface", label: "Geological Mapping", icon: Compass \}/);
  const main = rd("electron/main.js");
  assert.match(main, /\["Geological Mapping", "surface"\]/);
  for (const [lang, name] of [["es", "Mapeo geológico"], ["pt", "Mapeamento geológico"], ["fr", "Cartographie géologique"], ["ar", "رسم الخرائط الجيولوجية"]]) {
    assert.ok(main.includes(`"Geological Mapping": "${name}"`), `${lang} menu`);
    assert.equal(JSON.parse(rd(`src/locales/${lang}.json`))["Geological Mapping"], name, `${lang} tab label`);
  }
});

test("no text a user reads says 'Surface Geology' any more (code comments may)", () => {
  const hits = [];
  for (const f of [...walk(path.join(root, "src")), path.join(root, "electron", "main.js")]) {
    if (f.includes(`${path.sep}locales${path.sep}`)) continue;
    const s = noComments(readFileSync(f, "utf8"));
    if (s.includes("Surface Geology")) hits.push(path.relative(root, f));
  }
  assert.deepEqual(hits, []);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(rd(`src/locales/${lang}.json`));
    assert.deepEqual(Object.keys(d).filter((k) => k.includes("Surface Geology")), [], `${lang} keys`);
    const old = { es: "Geología de superficie", pt: "Geologia de superfície", fr: "Géologie de surface", ar: "الجيولوجيا السطحية" }[lang];
    // 'Project surface geology' is a tool that carries the mapped geology underground: a data word, kept (Arabic writes both with one phrase)
    assert.deepEqual(Object.entries(d).filter(([k, v]) => k !== "Project surface geology" && v.includes(old)).map(([k]) => k.slice(0, 50)), [], `${lang} values`);
  }
});

test("data words stay: surface samples and surface structures are not the module's name", () => {
  const d = JSON.parse(rd("src/locales/es.json"));
  assert.ok(Object.keys(d).some((k) => k.includes("Surface samples") || k.includes("surface samples")));
  assert.match(rd("src/modules/CartographyModule.jsx"), /fontWeight: "var\(--font-weight-title\)" \/\* TASKS\.csv #3892: a side-panel title \*\/, textTransform: "uppercase"/);
});
