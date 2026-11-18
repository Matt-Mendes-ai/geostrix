// TASKS.csv #3894 — the 3D View tab is called "StrixViewer": one word, never translated. The rule: the TAB is StrixViewer, the PICTURE
// stays "the 3D view" (small v). Only what a user reads changes: the tab id `viewer`, the mode `view`, file names, Help page ids,
// saved keys and code comments keep the old words, so an old project opens as before.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "..");
const rd = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(js|jsx)$/.test(f) ? [p] : []; });
const noComments = (s) => s.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str || "");
const LANGS = ["es", "pt", "fr", "ar"];

test("the tab is 'StrixViewer' in every language, with its tooltip; its id is still 'viewer'", () => {
  const app = rd("src/App.jsx");
  assert.match(app, /\{ id: "viewer", label: "StrixViewer", icon: Box, tip: "StrixViewer: your project in 3D" \}/);
  assert.match(app, /title=\{m\.disabled \? tr\("Coming soon"\) : m\.tip \? tr\(m\.tip\) : undefined\}/);
  assert.match(app, /const VIEWER_MODES = \{ viewer: "view",/); // the mode and the id an old project / link names
  const main = rd("electron/main.js");
  assert.match(main, /\["StrixViewer", "viewer"\]/);
  for (const lang of LANGS) {
    assert.ok(main.includes(`${lang}: { "GeoStrix Help"`) && new RegExp(`${lang}: \\{[^\\n]*"StrixViewer": "StrixViewer"`).test(main), `${lang} menu`);
    const d = JSON.parse(rd(`src/locales/${lang}.json`));
    assert.equal(d["StrixViewer"], "StrixViewer", `${lang} tab label`);
    assert.match(d["StrixViewer: your project in 3D"], /^StrixViewer/, `${lang} tooltip`);
  }
});

test("no text a user reads says '3D View' (capital V) or 'Strix Viewer'; the picture keeps 'the 3D view'", () => {
  const hits = [];
  for (const f of [...walk(path.join(root, "src")), path.join(root, "electron", "main.js")]) {
    if (f.includes(`${path.sep}locales${path.sep}`)) continue;
    const s = noComments(readFileSync(f, "utf8"));
    if (/3D View\b|Strix Viewer/.test(s)) hits.push(path.relative(root, f));
  }
  assert.deepEqual(hits, []);
  for (const lang of LANGS) {
    const d = JSON.parse(rd(`src/locales/${lang}.json`));
    assert.deepEqual(Object.entries(d).filter(([k, v]) => /3D View\b|Strix Viewer/.test(k) || v.includes("Strix Viewer")).map(([k]) => k.slice(0, 50)), [], `${lang}`);
    assert.ok(d["3D view"], `${lang}: the picture's key`);
    // every key that names the tab names it in the translation too, untranslated
    assert.deepEqual(Object.entries(d).filter(([k, v]) => k.split("StrixViewer").length !== v.split("StrixViewer").length).map(([k]) => k.slice(0, 50)), [], `${lang} name kept`);
  }
  const old = { es: /Vista 3D/, pt: /Visualização 3D|Vista 3D|Visão 3D/, fr: /Vue 3D/ }; // the old tab names, in a sentence that names the tab ("Vista 3D" alone is still the picture at the start of a label)
  for (const [lang, re] of Object.entries(old)) {
    const d = JSON.parse(rd(`src/locales/${lang}.json`));
    assert.deepEqual(Object.entries(d).filter(([k, v]) => k.includes("StrixViewer") && re.test(v)).map(([k]) => k.slice(0, 50)), [], `${lang} old name`);
  }
});

test("the sample READMEs name the tab", () => {
  for (const f of ["blake_river", "osborne"]) assert.match(rd(`sample_data/${f}/README.md`), /the empty StrixViewer/);
});
