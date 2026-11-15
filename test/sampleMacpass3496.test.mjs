// TASKS.csv #3496 — Fireweed Metals Corp.'s Macpass drilling as a bundled sample (used with their permission): the files are what the README counts, the
// credit is word for word in every place it is owed, and the sample is wired in as the second card. Counts re-derived here from the shipped CSVs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Papa from "papaparse";
import { MACPASS_CREDIT } from "../src/lib/sampleCredits.js";
import { sampleCardsFor, SAMPLE_RANK, sampleFootnote } from "../src/lib/sampleCards.js";
import { projectCredits } from "../src/lib/credits.js";
import { sampleProjectName } from "../src/lib/sampleProjectName.js";
import { waAssays, WA_SAMPLES } from "../src/lib/sampleWa.js";

const dir = new URL("../sample_data/yk_macpass/", import.meta.url);
const text = (f) => fs.readFileSync(new URL(f, dir), "utf8").replace(/\r\n/g, "\n");
const table = (f) => Papa.parse(text(f).replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const CREDIT = "Drilling data courtesy of Fireweed Metals Corp., Macpass Project, Yukon (fireweedmetals.com). Used with permission; see Fireweed's data disclaimer.";

test("the credit is the words Matt chose, exactly", () => { assert.equal(MACPASS_CREDIT, CREDIT); });

test("the collars: 559 holes on UTM 9N, no duplicate, every hole has a survey and the epsg column says 26909", () => {
  const c = table("collars.csv"), sv = table("survey.csv");
  assert.equal(c.length, 559);
  assert.equal(new Set(c.map((r) => r.hole_id)).size, 559, "no duplicate hole id");
  assert.ok(c.every((r) => r.epsg === "26909" && Number.isFinite(+r.x) && Number.isFinite(+r.y) && Number.isFinite(+r.z) && +r.length > 0));
  assert.ok(c.every((r) => +r.x > 400000 && +r.x < 450000 && +r.y > 6990000 && +r.y < 7030000), "UTM 9N easting / northing of east Yukon (63.2 N)");
  assert.deepEqual(Object.fromEntries(["DDH", "UDDH", "RC"].map((t) => [t, c.filter((r) => r.hole_type === t).length])), { DDH: 453, UDDH: 80, RC: 26 });
  const holes = new Set(c.map((r) => r.hole_id)), svHoles = new Set(sv.map((r) => r.hole_id));
  assert.equal(sv.length, 26464);
  assert.equal(svHoles.size, 559);
  assert.ok([...svHoles].every((h) => holes.has(h)), "no survey without a collar");
});

test("the survey: stations in depth order in every hole, dips negative down (up-holes positive), azimuths on the grid", () => {
  const sv = table("survey.csv"), last = new Map();
  for (const r of sv) { const d = +r.depth; assert.ok(!(last.has(r.hole_id) && d < last.get(r.hole_id)), `${r.hole_id} sorted`); last.set(r.hole_id, d); }
  assert.ok(sv.every((r) => +r.dip >= -90 && +r.dip <= 90 && +r.azimuth >= 0 && +r.azimuth < 360));
  assert.equal(new Set(sv.filter((r) => +r.dip > 0).map((r) => r.hole_id)).size, 10, "the holes with an up-hole station");
  assert.ok(sv.filter((r) => +r.dip < 0).length > sv.length * 0.9);
});

test("the assays: 32,546 intervals in 432 holes, none overlapping, duplicated or past its hole, no orphan hole; Ag ppm, Pb and Zn %", () => {
  const a = table("assays.csv"), c = new Map(table("collars.csv").map((r) => [r.hole_id, +r.length]));
  assert.equal(a.length, 32546);
  const by = new Map();
  for (const r of a) { assert.ok(c.has(r.hole_id), `${r.hole_id} has a collar`); if (!by.has(r.hole_id)) by.set(r.hole_id, []); by.get(r.hole_id).push([+r.from, +r.to]); }
  assert.equal(by.size, 432);
  let overlaps = 0, dup = 0, past = 0, gaps = 0;
  for (const [h, iv] of by) {
    iv.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    for (let i = 0; i < iv.length; i++) {
      if (iv[i][1] > c.get(h) + 0.5) past++;
      if (i) { if (iv[i][0] < iv[i - 1][1] - 1e-9) overlaps++; else if (iv[i][0] > iv[i - 1][1] + 1e-9) gaps++; if (iv[i][0] === iv[i - 1][0] && iv[i][1] === iv[i - 1][1]) dup++; }
    }
  }
  assert.deepEqual({ overlaps, dup, past, gaps }, { overlaps: 0, dup: 0, past: 0, gaps: 960 });
  assert.deepEqual(Object.keys(a[0]), ["hole_id", "from", "to", "Ag_ppm", "Pb_pct", "Zn_pct"]);
  const col = (k) => a.filter((r) => r[k] !== "").map((r) => +r[k]);
  assert.ok(Math.max(...col("Zn_pct")) === 60 && Math.max(...col("Pb_pct")) === 65.4 && Math.max(...col("Ag_ppm")) === 1000, "% Zn, % Pb and ppm Ag as the source writes them");
  assert.equal(a.filter((r) => r.Ag_ppm === "").length, 1113);
});

test("the assay reader takes Ag as ppm and Pb, Zn as %", () => {
  const r = waAssays(text("assays.csv"));
  const unit = Object.fromEntries(r.elements.map((e) => [e.symbol, e.unit]));
  assert.deepEqual([unit.Ag, unit.Pb, unit.Zn], ["ppm", "%", "%"]);
  assert.equal(r.rows.length, 32546);
  assert.equal(WA_SAMPLES.yk_macpass.epsg, 26909);
});

test("the density layer: 32,498 intervals with the bulk density as sg, and Method, Comment and the low-recovery flag kept as fields", () => {
  const s = table("sg.csv");
  assert.equal(s.length, 32498);
  assert.deepEqual(Object.keys(s[0]), ["hole_id", "from", "to", "sg", "method", "low_recovery", "comment"]);
  assert.deepEqual(Object.fromEntries(["MEAS", "REG", "LAB-SPG04"].map((m) => [m, s.filter((r) => r.method === m).length])), { MEAS: 25464, REG: 6489, "LAB-SPG04": 545 });
  assert.equal(s.filter((r) => r.low_recovery === "Y").length, 2886 - 1);
  assert.ok(s.every((r) => +r.sg >= 1.6 && +r.sg <= 6.92));
});

test("the sample is the second card, with the credit on it, in the footnote and in the loading notices", () => {
  assert.equal(SAMPLE_RANK[0], "wa_gold"); assert.equal(SAMPLE_RANK[1], "yk_macpass");
  const cards = sampleCardsFor("viewer"), i = cards.findIndex((c) => c.id === "yk_macpass");
  assert.equal(i, 1, "second on the 3D View");
  assert.ok(cards[i].title.endsWith(CREDIT) && cards[i].label.includes("Macpass"));
  const foot = sampleFootnote();
  assert.ok(foot.includes(CREDIT));
  assert.ok(foot.indexOf("Macpass") > foot.indexOf("WA lode gold") && foot.indexOf("Macpass") < foot.indexOf("Century"), "footnote order = rank order");
  assert.ok(sampleCardsFor("surface").some((c) => c.id === "yk_macpass"), "also on Surface Geology");
  const imp = read("../src/modules/viewer/importPipelineImpl.js");
  assert.match(imp, /yk_macpass: \{\n\s+dir: "yk_macpass", epsg: 26909, crs: "NAD83 \/ UTM zone 9N",\n\s+files: \["collars\.csv", "survey\.csv", "sg\.csv"\]/);
  assert.match(imp, /\.\.\.\(S\.credit \? \[S\.credit\] : \[\]\)/);
});

test("the credit is kept with the project and printed by Layout; the project is named; the README and the licence page carry it", () => {
  assert.equal(projectCredits(null, [], CREDIT), CREDIT);
  assert.equal(projectCredits(null, []), "");
  assert.match(read("../src/modules/LayoutModule.jsx"), /projectCredits\(terrain, rasters, project\?\.dataCredit\)/);
  assert.match(read("../src/lib/sampleWa.js"), /store\.setProjectDataCredit\(S\.credit\)/);
  assert.equal(sampleProjectName("yk_macpass", "Untitled project"), "Macpass zinc-lead-silver (sample)");
  assert.ok(text("README.md").includes(`**${CREDIT}**`), "the README's credit line");
  assert.ok(text("README.md").includes("with Fireweed Metals Corp.'s written permission (2026-11-14)"));
  assert.match(read("../scripts/third-party-licenses.mjs"), /"sample_data", "yk_macpass", "README\.md"/);
});

test("wired: the id reaches the extras loader, the Sample menu and every language", () => {
  assert.match(read("../src/modules/ViewerModule.jsx"), /which\.startsWith\("qld_"\) \|\| which\.startsWith\("yk_" \/\* #3496 \*\/\)/);
  assert.match(read("../electron/main.js"), /"sample:yk_macpass"/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["Sample: Macpass zinc-lead-silver (Yukon; 559 holes, 32,546 assays)", "Macpass (Fireweed Metals Corp., Yukon): 559 holes drilled 1952-2023 on a zinc-lead-silver prospect, with down-hole surveys, 32,546 sampled intervals (Ag, Pb, Zn) and their bulk density — nothing synthesized."]) assert.ok(d[k], `${lang}: ${k.slice(0, 40)}`);
  }
});
