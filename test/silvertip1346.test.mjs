// TASKS.csv #1346 — the Silvertip sample (ARIS 42807): every drill table is recognised as its layer with no question, the
// assays and surface samples read as the loader reads them
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTableText } from "../src/lib/tabular.js";
import { guessTargetFor, guessMapping, schemaSatisfied } from "../src/lib/layers.js";
import { silvertipAssays, silvertipSurface, SILVERTIP_SURFACE } from "../src/lib/sampleSilvertip.js";
import { sampleProjectName } from "../src/lib/sampleProjectName.js";

import { bcSkip, bcText } from "./helpers/bcSample.mjs";

// TASKS.csv #3134 — Silvertip is no longer in the repository (BC's terms): these run on its files where they are found (a checkout that has
// them, or GEOSTRIX_BC_SAMPLES pointing at the app's downloaded copy); the loader's assay layout is also read by the WA uranium sample's tests
const skip = bcSkip("silvertip");
const text = (f) => bcText("silvertip", f);
const table = (f) => parseTableText(text(f));

test("each drill table goes to its layer with every required column mapped", { skip }, () => {
  const expect = { "collars.csv": "collars", "survey.csv": "survey", "litho.csv": "litho", "alt.csv": "alt", "breccia.csv": "breccia", "vein.csv": "vein", "mnlgy.csv": "mnlgy",
    "struct_zones.csv": "structzone", "geotech.csv": "geotech", "recovery.csv": "recovery", "magsusc.csv": "magsusc", "structure.csv": "structure" };
  for (const [f, target] of Object.entries(expect)) {
    const t = table(f), got = guessTargetFor(t.headers, f);
    assert.equal(got, target, f);
    assert.ok(schemaSatisfied(got, guessMapping(got, t.headers)), `${f}: required columns`);
  }
});

test("9 holes in UTM zone 9N, surveys for every hole, structures with alpha", { skip }, () => {
  const c = table("collars.csv").rows;
  assert.equal(c.length, 9);
  c.forEach((r) => { assert.ok(r.x > 420000 && r.x < 430000, r.hole_id); assert.ok(r.y > 6630000 && r.y < 6650000, r.hole_id); assert.ok(r.length >= 348 && r.length <= 1323); });
  const sv = table("survey.csv").rows, holes = new Set(sv.map((r) => r.hole_id));
  c.forEach((r) => assert.ok(holes.has(r.hole_id), r.hole_id));
  assert.deepEqual(sv.filter((r) => r.hole_id === "CCF24-PAD42-002").map((r) => [r.depth, r.azimuth, r.dip]), [[0, 295, -45]], "the redrilled hole keeps its planned orientation");
  const s = table("structure.csv").rows;
  assert.equal(s.length, 549);
  assert.ok(s.every((r) => Number.isFinite(r.alpha)));
  assert.equal(s.filter((r) => Number.isFinite(r.beta)).length, 483);
  assert.ok(table("magsusc.csv").rows.every((r) => Number.isFinite(r.depth) && Number.isFinite(r.mag_reading)));
});

test("assays: 1,339 samples, Pb / Zn / Cu in %, a negative code read as below detection", { skip }, () => {
  const { rows, elements } = silvertipAssays(text("assays.csv"));
  assert.equal(rows.length, 1339);
  const unit = Object.fromEntries(elements.map((e) => [e.symbol, e.unit]));
  assert.equal(unit.Pb, "%"); assert.equal(unit.Zn, "%"); assert.equal(unit.Au, "ppm"); assert.equal(unit.Ag, "ppm");
  assert.ok(!elements.some((e) => e.symbol === "To" || /Eq$/.test(e.symbol)));
  assert.ok(rows.every((r) => Object.values(r.values).every((v) => v >= 0)), "no negative grade survives");
  assert.ok(rows.some((r) => r.values.Zn > 1), "real zinc grades over 1 %");
});

test("surface samples: 168 rock, 282 soil, 156 stream sediment, located, with their medium", { skip }, () => {
  const n = {};
  for (const [f, medium] of SILVERTIP_SURFACE) {
    const { samples } = silvertipSurface(text(f), medium);
    n[medium] = samples.length;
    assert.ok(samples.every((s) => s.medium === medium && s.x > 400000 && s.y > 6550000 && s.sample_id), f); // a few rocks lie ~45 km south
  }
  assert.deepEqual(n, { "rock chip": 168, soil: 282, "stream sediment": 156 });
});

test("a loaded Silvertip sample names its tab", () => {
  assert.equal(sampleProjectName("silvertip", "Untitled project"), "Silvertip (sample)");
  assert.equal(sampleProjectName("silvertip", "My project"), "My project");
});
