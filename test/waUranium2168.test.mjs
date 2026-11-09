// TASKS.csv #2168 — the WA calcrete-uranium sample (WAMEX report A87304): every drill table is recognized as its layer with no
// question, the assays and the gamma log read as the loader reads them, and the sample is offered everywhere the others are
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTableText } from "../src/lib/tabular.js";
import { guessTargetFor, guessMapping, schemaSatisfied, EPSG_COL_ALIASES } from "../src/lib/layers.js";
import { silvertipAssays } from "../src/lib/sampleSilvertip.js";
import { waUraniumGamma, WA_URANIUM_EPSG, WA_URANIUM_GAMMA_LAYER } from "../src/lib/sampleWaUranium.js";
import { sampleProjectName } from "../src/lib/sampleProjectName.js";
import { sampleCardsFor } from "../src/lib/sampleCards.js";

const dir = new URL("../sample_data/wa_uranium/", import.meta.url);
const text = (f) => readFileSync(new URL(f, dir), "utf8");
const table = (f) => parseTableText(text(f));

test("each drill table goes to its layer with every required column mapped", () => {
  const expect = { "collars.csv": "collars", "survey.csv": "survey", "litho.csv": "litho", "alt.csv": "alt" };
  for (const [f, target] of Object.entries(expect)) {
    const t = table(f), got = guessTargetFor(t.headers, f);
    assert.equal(got, target, f);
    assert.ok(schemaSatisfied(got, guessMapping(got, t.headers)), `${f}: required columns`);
  }
  assert.ok(table("collars.csv").headers.some((h) => EPSG_COL_ALIASES.includes(h.toLowerCase())), "the collars carry an epsg column");
});

test("430 vertical holes in MGA zone 51, a survey station for each, 22,407 lithology intervals", () => {
  const c = table("collars.csv").rows;
  assert.equal(c.length, 430);
  assert.equal(WA_URANIUM_EPSG, 28351);
  c.forEach((r) => { assert.ok(r.x > 569000 && r.x < 581000, r.hole_id); assert.ok(r.y > 6678000 && r.y < 6689000, r.hole_id); assert.ok(r.length >= 33 && r.length <= 93, r.hole_id); assert.equal(Number(r.epsg), 28351); });
  assert.deepEqual([...new Set(c.map((r) => r.hole_type))].sort(), ["AC", "DDH"]);
  const sv = table("survey.csv").rows, holes = new Set(sv.map((r) => r.hole_id));
  assert.equal(sv.length, 430);
  c.forEach((r) => assert.ok(holes.has(r.hole_id), r.hole_id));
  assert.ok(sv.every((r) => r.depth === 0 && r.dip === -90), "every hole is vertical");
  const li = table("litho.csv").rows;
  assert.equal(li.length, 22407);
  assert.ok(li.every((r) => r.to > r.from && r.lithology));
  assert.equal(table("alt.csv").rows.length, 2003);
});

test("assays: 9,862 samples, 20 elements, S in ppm and the majors in %, below-detection codes read as such", () => {
  const { rows, elements } = silvertipAssays(text("assays.csv"));
  assert.equal(rows.length, 9862);
  assert.equal(elements.length, 20);
  const unit = Object.fromEntries(elements.map((e) => [e.symbol, e.unit]));
  assert.equal(unit.U, "ppm"); assert.equal(unit.S, "ppm"); assert.equal(unit.Fe, "%"); assert.equal(unit.Al, "%");
  assert.equal(rows.filter((r) => r.values.U != null).length, 9733, "U joined from every method column");
  assert.ok(rows.every((r) => Object.values(r.values).every((v) => v >= 0)), "no negative grade survives");
  assert.ok(rows.filter((r) => r.values.U > 1000).length > 200, "real uranium grades over 1,000 ppm");
});

test("gamma log: 43,923 eU3O8 readings over 423 holes, none negative, as a custom point layer", () => {
  const rows = waUraniumGamma(text("gamma.csv"));
  assert.equal(rows.length, 43923);
  assert.equal(new Set(rows.map((r) => r.hole_id)).size, 423);
  assert.ok(rows.every((r) => Number.isFinite(r.depth) && r.value >= 0 && r.from === undefined && r.to === undefined));
  assert.ok(rows.some((r) => r.value > 1000), "readings over 1,000 ppm eU3O8");
  assert.ok(rows.every((r) => r.raw_cps == null || (r.raw_cps >= 0 && r.raw_cps < 1e6)), "the 10,700,000 cps sentinel is gone");
  assert.equal(WA_URANIUM_GAMMA_LAYER, "Gamma eU3O8 (ppm)");
});

test("the sample is offered on the empty 3D View and names its tab", () => {
  assert.ok(sampleCardsFor("viewer").some((c) => c.id === "wa_uranium"));
  assert.ok(sampleCardsFor("surface").some((c) => c.id === "wa_uranium"));
  assert.equal(sampleProjectName("wa_uranium", "Untitled project"), "WA calcrete uranium (sample)");
  assert.equal(sampleProjectName("wa_uranium", "My project"), "My project");
});
