// TASKS.csv #4094 / #4056 — the five Geoscience Queensland samples are rows of the sample list that open: each has its card on both tabs, its project name, its
// sample definition (CRS, the drillhole tables it reads), its assay / surface loader, its File > Open Sample Project entry in four languages and its licence
// lines. Black Mountain writes below detection as 0 (its README): the loader reads a 0 as "<" at half the column's smallest reading. Synthetic rows plus the folders.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Papa from "papaparse";
import { sampleCardsFor, sampleListFor, sampleSource, SAMPLE_RANK } from "../src/lib/sampleCards.js";
import { sampleProjectName } from "../src/lib/sampleProjectName.js";
import { WA_SAMPLES, waAssaysSliced, waSurface } from "../src/lib/sampleWa.js";
import { guessTargetFor } from "../src/lib/layersImport.js";

const IDS = ["gsq_carbo_creek", "gsq_cloncurry", "gsq_altia_south", "gsq_black_mountain", "gsq_edinburgh_park"];
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const imp = read("../src/modules/viewer/importPipelineImpl.js"), main = read("../electron/main.js"), notice = read("../build/installer-notice.txt");
const defOf = (id) => new RegExp(`${id}: \\{ dir: "${id}", (?:azStated: \\[[^\\]]*\\], )?epsg: (\\d+), crs: "([^"]+)", files: \\[([^\\]]+)\\]`).exec(imp);

test("each GSQ sample is a row on both tabs, ranked, named, with a source line", () => {
  for (const id of IDS) {
    assert.ok(SAMPLE_RANK.includes(id), `${id}: ranked`);
    for (const mode of ["viewer", "surface"]) assert.ok(sampleListFor(mode).rows.some((r) => r.id === id), `${id}: a row on ${mode}`);
    assert.ok(sampleCardsFor("viewer").find((c) => c.id === id).title.startsWith("Open "), `${id}: its tooltip is its name`);
    assert.match(sampleSource(id), /CC BY 4\.0/);
    assert.match(sampleProjectName(id, ""), /\(sample\)$/);
  }
});

test("each sample's definition reads the drillhole tables its folder holds, in the CRS its README gives", () => {
  const epsg = { gsq_carbo_creek: 28354, gsq_cloncurry: 28354, gsq_altia_south: 28354, gsq_black_mountain: 20255, gsq_edinburgh_park: 28355 };
  const target = { "collars.csv": "collars", "survey.csv": "survey", "litho.csv": "litho", "alt.csv": "alt", "veins.csv": "vein", "sulphides.csv": "mnlgy", "mineralisation.csv": "mnlgy", "magsus.csv": "magsusc", "sg.csv": "sg", "structure.csv": "structure", "struct_zones.csv": "structzone", "weath.csv": "weath" };
  for (const id of IDS) {
    const m = defOf(id);
    assert.ok(m, `${id}: a sample definition`);
    assert.equal(Number(m[1]), epsg[id]);
    assert.equal(WA_SAMPLES[id].epsg, epsg[id]);
    const files = m[3].split(",").map((s) => s.trim().replace(/"/g, ""));
    assert.ok(files.includes("collars.csv") && files.includes("survey.csv") && files.includes("litho.csv"));
    for (const f of files) {
      const t = Papa.parse(read(`../sample_data/${id}/${f}`).replace(/^﻿/, ""), { header: true, skipEmptyLines: true });
      assert.equal(guessTargetFor(t.meta.fields, f, t.data), target[f], `${id}/${f}: the import reads it as ${target[f]}`);
    }
    assert.ok(fs.existsSync(new URL(`../sample_data/${id}/${WA_SAMPLES[id].assays}`, import.meta.url)));
    for (const [f] of WA_SAMPLES[id].surface || []) assert.ok(fs.existsSync(new URL(`../sample_data/${id}/${f}`, import.meta.url)), `${id}/${f}`);
  }
});

test("each sample has its File > Open Sample Project entry, translated, and its licence lines", () => {
  for (const id of IDS) {
    const item = new RegExp(`L\\("([^"]+)"\\), click: \\(\\) => mainWindow\\?\\.webContents\\.send\\("menu", "sample:${id}"\\)`).exec(main);
    assert.ok(item, `${id}: a menu entry`);
    assert.equal(main.split(`${JSON.stringify(item[1])}: `).length - 1, 4, `${id}: the menu label is translated in four languages`);
    assert.ok(notice.includes(`gsq_${id.slice(4)}`) || notice.includes(id), `${id}: in the installer notice`);
    for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[sampleSource(id)], `${id}: source line translated in ${lang}`);
  }
});

test("zeroBdl: a 0 is below detection at half the column's smallest reading; without it the 0 is a measured zero; blanks stay not assayed", async () => {
  const csv = "hole_id,from,to,sample_id,Mo_ppm\nA,0,1,s1,0\nA,1,2,s2,10\nA,2,3,s3,4\nA,3,4,s4,\n";
  const yieldTask = () => Promise.resolve();
  const on = (await waAssaysSliced(csv, "assays.csv", yieldTask, { zeroBdl: true })).rows;
  assert.equal(on[0].values.Mo, 2); assert.equal(on[0].qualifiers.Mo, "<");
  assert.equal(on[1].values.Mo, 10); assert.equal(on[3]?.values.Mo, undefined);
  const off = (await waAssaysSliced(csv, "assays.csv", yieldTask)).rows;
  assert.equal(off[0].values.Mo, 0); assert.equal(off[0].qualifiers, undefined);
  assert.equal(WA_SAMPLES.gsq_black_mountain.zeroBdl, true);
  for (const id of IDS.filter((i) => i !== "gsq_black_mountain")) assert.ok(!WA_SAMPLES[id].zeroBdl);
});

test("Black Mountain: its real assays read no zero as a measured value", async () => {
  const p = "../sample_data/gsq_black_mountain/assays.csv";
  const { rows } = await waAssaysSliced(read(p).replace(/^﻿/, ""), "assays.csv", () => Promise.resolve(), { zeroBdl: true });
  assert.ok(rows.length > 600);
  let zeros = 0, bdl = 0;
  for (const r of rows) for (const [k, v] of Object.entries(r.values)) { if (v === 0) zeros++; if (r.qualifiers?.[k] === "<") bdl++; }
  assert.equal(zeros, 0, "no measured zero is left");
  assert.ok(bdl > 2000, "the README's 2,172 zero cells and 827 '<' cells read below detection");
});

test("a surface row with a blank coordinate is left out, not placed at 0, 0", () => {
  const csv = "sample_id,x,y,z,medium,Cu_ppm\ns1,554000,7783000,,SOIL,10\ns2,,,,STD,95\ns3,554100,,,SOIL,12\ns4,554200,7783100,,SOIL,11\n";
  const { samples } = waSurface(csv, "soil");
  assert.deepEqual(samples.map((s) => s.sample_id), ["s1", "s4"]);
});
