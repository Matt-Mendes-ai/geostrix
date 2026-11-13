// TASKS.csv #3107 — shared checks for the openly licensed samples added when the BC ones could no longer be bundled (#3100): a sample folder
// is small, passes the data checks of #2323 / #2324 (no overlapping intervals, nothing past its hole), and is offered, named and licensed
// where a user reads it. Not a test file itself: the sample*3107.test.mjs files use it.
import assert from "node:assert/strict";
import fs from "node:fs";
import Papa from "papaparse";
import { fromArrayBuffer } from "geotiff";
import { sampleCardsFor, sampleFootnote } from "../src/lib/sampleCards.js";
import { sampleProjectName } from "../src/lib/sampleProjectName.js";
import { bundledData } from "../scripts/third-party-licenses.mjs";

const root = new URL("../sample_data/", import.meta.url);
export const read = (dir, n) => fs.readFileSync(new URL(`${dir}/${n}`, root));
export const exists = (dir, n) => fs.existsSync(new URL(`${dir}/${n}`, root));
export const table = (dir, n) => Papa.parse(read(dir, n).toString("utf8"), { header: true, skipEmptyLines: true }).data;
export const folderBytes = (dir) => fs.readdirSync(new URL(`${dir}/`, root)).reduce((a, f) => a + fs.statSync(new URL(`${dir}/${f}`, root)).size, 0);
export const tiff = async (dir, n) => { const b = read(dir, n); const img = await (await fromArrayBuffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))).getImage(); return { img, data: (await img.readRasters())[0] }; };
export const fileOf = (dir) => async (n) => new File([read(dir, n)], n);
export const said = (notes) => notes.map((n) => n.text ?? n).join(" | ");

// every interval table of a drillhole sample: its holes are collars, from < to, nothing runs past the hole's end, no two intervals of a hole
// overlap; every survey station is a collar's, within the hole, dipping down, and every hole has one. -> { collars, survey }
export function checkIntervals(dir, files, { tolerance = 0.011 } = {}) {
  const collars = table(dir, "collars.csv"), len = new Map(collars.map((c) => [c.hole_id, Number(c.length)]));
  assert.equal(len.size, collars.length, `${dir}: a hole id is repeated in collars.csv`);
  for (const c of collars) assert.ok(Number.isFinite(Number(c.x)) && Number.isFinite(Number(c.y)) && Number.isFinite(Number(c.z)) && Number(c.z) !== 0 && Number(c.length) > 0, `${dir}: collar ${c.hole_id}`);
  for (const f of files) {
    const by = new Map();
    for (const r of table(dir, f)) {
      assert.ok(len.has(r.hole_id), `${dir}/${f}: ${r.hole_id} is not a collar`);
      const a = Number(r.from), b = Number(r.to);
      assert.ok(b > a && a >= 0, `${dir}/${f}: ${r.hole_id} ${r.from}-${r.to}`);
      assert.ok(b <= len.get(r.hole_id) + tolerance, `${dir}/${f}: ${r.hole_id} ${r.from}-${r.to} runs past the hole's ${len.get(r.hole_id)} m`);
      if (!by.has(r.hole_id)) by.set(r.hole_id, []);
      by.get(r.hole_id).push([a, b]);
    }
    for (const [h, iv] of by) { iv.sort((p, q) => p[0] - q[0]); for (let i = 1; i < iv.length; i++) assert.ok(iv[i][0] >= iv[i - 1][1] - 1e-6, `${dir}/${f}: ${h} ${iv[i - 1]} overlaps ${iv[i]}`); }
  }
  const survey = table(dir, "survey.csv"), seen = new Set();
  for (const s of survey) {
    assert.ok(len.has(s.hole_id) && Number(s.depth) >= 0 && Number(s.depth) <= len.get(s.hole_id) + tolerance && Number(s.dip) <= 0 && Number(s.dip) >= -90 && Number(s.azimuth) >= 0 && Number(s.azimuth) < 360, `${dir}/survey.csv: ${JSON.stringify(s)}`);
    assert.ok(!seen.has(`${s.hole_id}|${s.depth}`), `${dir}/survey.csv: two stations at ${s.hole_id} ${s.depth} m`);
    seen.add(`${s.hole_id}|${s.depth}`);
  }
  assert.equal(new Set(survey.map((s) => s.hole_id)).size, collars.length, `${dir}: every hole has a survey`);
  return { collars, survey };
}

// a store that keeps what a sample loader hands it
export const fakeStore = () => {
  const s = { assays: [], elements: [], surface: [], surfaceElements: [], layers: [], rasters: [] };
  return { state: s, setAssays: (fn) => { s.assays = fn(s.assays); }, setAssayElements: (fn) => { s.elements = fn(s.elements); }, setSurfaceSamples: (fn) => { s.surface = fn(s.surface); },
    setSurfaceElements: (fn) => { s.surfaceElements = fn(s.surfaceElements); }, addCustomLayer: (l) => s.layers.push(l), addRaster: (r) => s.rasters.push(r) };
};

// the sample is offered on both empty views and in the File menu, named on its tab, translated, and its licence is where a user reads it
export function checkOffered(id, { licence, who, name, inFootnote }) {
  for (const mode of ["viewer", "surface"]) assert.ok(sampleCardsFor(mode).some((c) => c.id === id), `${id}: no sample card on ${mode}`);
  assert.equal(sampleCardsFor("viewer").length, sampleCardsFor("surface").length); // no card is dropped from either list
  assert.equal(sampleProjectName(id, "Untitled project"), name);
  assert.ok(sampleFootnote().includes(inFootnote), `${id}: not in the samples' footnote`);
  const readme = read(id, "README.md").toString("utf8");
  assert.match(readme, /nothing is synthesized/i);
  assert.match(readme, /## Licence and attribution/);
  assert.match(readme, /does not endorse GeoStrix/);
  assert.ok(!/\b(Pty|Ltd|Limited|Inc\.|Corp|NL)\b/.test(readme), `${id}: a company name in the README`);
  assert.ok(bundledData().some((d) => d.license === licence && who.test(d.name) && d.text === readme.trim()), `${id}: not in Help > Third-party licences`);
  assert.ok(fs.readFileSync(new URL("../build/installer-notice.txt", import.meta.url), "utf8").includes(`(sample_data/${id})`), `${id}: not in the installer notice`);
  const menu = fs.readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  const item = new RegExp(`L\\("([^"]+)"\\), click: \\(\\) => mainWindow\\?\\.webContents\\.send\\("menu", "sample:${id}"\\)`).exec(menu);
  assert.ok(item, `${id}: no File > Open Sample Project entry`);
  assert.equal(menu.split(`${JSON.stringify(item[1])}: `).length - 1, 4, `${id}: the menu label is translated in four languages`);
  const card = sampleCardsFor("viewer").find((c) => c.id === id);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(d[card.label] && d[card.title], `${id}: card not translated in ${lang}`);
  }
}
