// TASKS.csv #4094 — the sample list's icons, counts and sizes are DATA read from each sample folder, not labels: this test reads every bundled sample folder and fails if
// an icon claims a file the folder lacks, a count differs from the file's rows, a folder holds a kind of data no icon claims, or a size is far from the folder's. The BC samples
// (Harry, Silvertip, Perk-Rocky) are not in the repository (#3134): they are checked when a copy is found (GEOSTRIX_BC_SAMPLES) and skipped, saying why, when not.
// Every offered sample has a row (nothing is unreachable) and the BC download flow is unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLE_CONTENTS, SAMPLE_ICONS, sampleCardsFor, sampleListFor, sampleSource, sampleFact, sampleStyle } from "../src/lib/sampleCards.js";
import { bcSampleDir } from "./helpers/bcSample.mjs";

const REPO = fileURLToPath(new URL("../sample_data/", import.meta.url));
const BC = new Set(["harry_property", "silvertip", "perk_rocky", "woodjam"]);
const folderOf = (dir) => { if (BC.has(dir)) return dir === "perk_rocky" ? (fs.existsSync(path.join(REPO, dir)) ? path.join(REPO, dir) : null) : bcSampleDir(dir); const d = path.join(REPO, dir); return fs.existsSync(d) ? d : null; };
// the records of a CSV (quoted fields may hold line breaks), without the header
function rows(file) {
  const t = fs.readFileSync(file, "utf8").replace(/^﻿/, ""); let n = 0, q = false, any = false;
  for (let i = 0; i < t.length; i++) { const c = t[i]; if (c === '"') q = !q; else if (c === "\n" && !q) { if (any) n++; any = false; } else if (c !== "\r") any = true; }
  if (any) n++;
  return n - 1;
}
// what a folder holds, by its files: the kinds of data an icon can claim
function detect(dir) {
  const f = new Set(fs.readdirSync(dir));
  const has = (re) => [...f].some((x) => re.test(x));
  const found = new Set();
  if (f.has("collars.csv")) found.add("holes");
  if (f.has("assays.csv") || f.has("assay_wide.csv")) found.add("assays");
  const full = (d) => { const p = path.join(dir, d); return fs.existsSync(p) && fs.statSync(p).isDirectory() && fs.readdirSync(p).length > 0; };
  if (full("geophysics")) found.add("geophysics");
  if (full("mapping")) found.add("mapping");
  if (f.has("magsus.csv") || has(/^tmi.*\.tif$/) || has(/\.grd$/) || has(/\.omf$/) || f.has("osborne_magnetic.csv") || f.has("gamma.csv") || f.has("logs.csv") || f.has("magsusc.csv")) found.add("geophysics");
  if (has(/^map_units\.shp$/) || f.has("geology.zip") || f.has("bedrock_units.zip")) found.add("mapping");
  if (has(/^(soils|streams|rocks)\.csv$/)) found.add("surface");
  if (has(/^terrain_.*\.tif$/)) found.add("terrain");
  return found;
}
const OPTIONAL = { // a kind of data a sample holds that its list does not claim on purpose (nothing now)
};

for (const [id, d] of Object.entries(SAMPLE_CONTENTS)) {
  const dir = folderOf(d.dir);
  const skip = dir ? false : `${id}: its folder (${d.dir}) is not in this checkout (BC's terms, TASKS.csv #3134): set GEOSTRIX_BC_SAMPLES to a folder holding it to run this check`;
  test(`#4094 ${id}: every icon's proof files exist, the counts are the files' rows, and no kind of data in the folder goes unclaimed`, { skip }, () => {
    for (const [icon, c] of Object.entries(d.has)) {
      assert.ok(SAMPLE_ICONS.includes(icon), `${id}: ${icon} is not an icon`);
      if (BC.has(d.dir) && !fs.existsSync(path.join(dir, c.files[0] || "."))) continue; // a download's own layers (Perk-Rocky's mapping) are not in the repository
      for (const file of c.files) assert.ok(fs.existsSync(path.join(dir, file)), `${id}: ${icon} claims ${file}, which the folder lacks`);
      if (c.n != null && /\.csv$/.test(c.files[0])) assert.equal(rows(path.join(dir, c.files[0])), c.n, `${id}: ${icon} says ${c.n}, ${c.files[0]} has ${rows(path.join(dir, c.files[0]))} rows`);
    }
    const found = detect(dir);
    const claimed = new Set(Object.keys(d.has));
    if (d.dir === "perk_rocky") { found.add("mapping"); } // the layers are downloaded; the folder keeps its terrain
    for (const k of found) assert.ok(claimed.has(k) || OPTIONAL[id]?.includes(k), `${id}: the folder holds ${k} data that no icon claims`);
    for (const k of claimed) assert.ok(found.has(k) || (BC.has(d.dir) && k === "mapping"), `${id}: ${k} is claimed but the folder holds none`);
  });
  test(`#4094 ${id}: the facts line's numbers are the files' rows, and the size is the folder's`, { skip }, () => {
    const r = (f) => rows(path.join(dir, f));
    const n = (k) => (d.facts.find((x) => x[0] === k) || [])[1];
    const csv = (icon) => d.has[icon]?.files[0];
    if (n("holes") != null) assert.equal(n("holes"), r(csv("holes")));
    if (n("deepHoles") != null) assert.equal(n("deepHoles"), r(csv("holes")));
    if (n("traces") != null) assert.equal(n("traces"), r(csv("holes")));
    if (n("assays") != null) assert.equal(n("assays"), r(csv("assays")));
    if (n("soils") != null) assert.equal(n("soils"), r("soils.csv"));
    if (n("soilsStreams") != null) assert.equal(n("soilsStreams"), r("soils.csv") + r("streams.csv"));
    if (n("surfaceSamples") != null) assert.equal(n("surfaceSamples"), d.has.surface.files.reduce((t, f) => t + r(f), 0));
    if (n("rocks") != null) assert.equal(n("rocks"), r("rocks.csv"));
    if (n("stations") != null) assert.equal(n("stations"), r("stations.csv"));
    if (n("readings") != null) assert.equal(n("readings"), r("osborne_magnetic.csv"));
    if (n("structures") != null) assert.equal(n("structures"), id === "qc_rouyn_noranda" ? r("structures.csv") : r("bedding.csv"));
    const total = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((t, e) => t + (e.isDirectory() ? total(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
    const bytes = total(dir) / 1048576; // the whole folder, subfolders included (the GSQ samples keep nearly all their bytes there)
    if (!BC.has(d.dir)) assert.ok(Math.abs(d.mb - bytes) <= Math.max(0.3, 0.2 * bytes), `${id}: the list says ${d.mb} MB, the folder is ${bytes.toFixed(2)} MB`);
  });
}

test("#4094 every offered sample has a row, in each tab, and a source line; the first pick is the tab's own (#1120)", () => {
  for (const mode of ["view", "surface", "modelling", "targeting"]) {
    const cards = sampleCardsFor(mode).map((c) => c.id), { rows: list, first } = sampleListFor(mode);
    assert.deepEqual(list.map((r) => r.id), cards.filter((id) => SAMPLE_CONTENTS[id]), `${mode}: the rows are the offered samples`);
    for (const id of cards) assert.ok(SAMPLE_CONTENTS[id] || id === "woodjam", `${mode}: ${id} is offered but has no contents entry`);
    for (const r of list) { assert.ok(r.name && r.style && r.facts, `${r.id}: name, style and facts`); assert.ok(sampleSource(r.id), `${r.id}: a source line`); }
    assert.equal(first, mode === "surface" ? "qc_rouyn_noranda" : "yk_macpass", `${mode}: the first pick`);
  }
});

test("#4094 every claimed phrase is known (a missing one would show as an empty fact), and a fact's wording is translated whole", () => {
  for (const [id, d] of Object.entries(SAMPLE_CONTENTS)) {
    assert.ok(sampleStyle(d.style), `${id}: style ${d.style}`);
    for (const f of d.facts) assert.ok(sampleFact(f), `${id}: fact ${f[0]}`);
  }
});

test("#4094 the BC download flow is unchanged: the rows carry the download size only while a BC sample is missing, and loadSample still asks first", () => {
  const vm = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /if \(await askSampleDownload\(which\)\) return; \/\/ #3133/);
  assert.match(vm, /<SampleList key=\{mode\} rows=\{sampleList\.rows\} first=\{sampleList\.first\} onLoad=\{loadSample\}/);
  const cards = fs.readFileSync(new URL("../src/lib/sampleCards.js", import.meta.url), "utf8");
  assert.match(cards, /const download = info && missing\(c\.id\) \? Math\.round\(info\.bytes \/ 1048576\) : null;/);
});
