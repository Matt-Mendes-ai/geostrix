// TASKS.csv #3107 — the WA lode-gold sample (WAMEX report A122506, CC BY 4.0): the 66 surveyed holes of one prospect, inclined, with
// lithology, alteration, veining and oriented-structure logs and gold assays. Superseded assays left out, one survey run per hole.
import test from "node:test";
import assert from "node:assert/strict";
import { waAssays, loadWaSampleExtras } from "../src/lib/sampleWa.js";
import { read, table, folderBytes, fileOf, said, checkIntervals, fakeStore, checkOffered } from "./sampleChecks3107.mjs";

const dir = "wa_gold";

test("66 inclined holes in MGA zone 51, one survey run each, with intervals that neither overlap nor pass the hole's end", () => {
  // #3308 (Matt: the lithology description field in the samples) — the geologist's descriptions carried whole (4,076 of 4,207 intervals, about
  // 0.45 MB): 1.68 MB with them, still light; the limit was 1.5 MB before
  assert.ok(folderBytes(dir) < 1.75e6, `${folderBytes(dir)} bytes`);
  const { collars, survey } = checkIntervals(dir, ["litho.csv", "weath.csv", "alt.csv", "vein.csv", "assays.csv"]);
  assert.equal(collars.length, 66);
  assert.deepEqual([collars.filter((c) => c.hole_type === "RC").length, collars.filter((c) => c.hole_type === "DD").length], [35, 31]);
  assert.ok(collars.every((c) => c.epsg === "28351" && Number(c.x) > 457700 && Number(c.x) < 458300 && Number(c.y) > 6562000 && Number(c.y) < 6563900 && Number(c.z) > 305 && Number(c.z) < 314));
  assert.equal(survey.length, 1601);
  assert.ok(survey.every((s) => Number(s.dip) <= -48 && Number(s.dip) >= -73)); // every hole is inclined
  // a hole surveyed twice keeps one run: 18STRC017D's stations are 5 m apart (the run the source marks Priority 1), none repeated
  const run = survey.filter((s) => s.hole_id === "18STRC017D").map((s) => Number(s.depth));
  assert.deepEqual(run.slice(0, 4), [0, 5, 10, 15]);
});

test("the logs: 32 rock codes, an alteration log, veins, and oriented structures with alpha and beta inside their holes", () => {
  const len = new Map(table(dir, "collars.csv").map((c) => [c.hole_id, Number(c.length)]));
  assert.deepEqual([table(dir, "litho.csv").length, new Set(table(dir, "litho.csv").map((r) => r.lithology)).size, table(dir, "weath.csv").length, table(dir, "alt.csv").length, table(dir, "vein.csv").length], [4207, 32, 4116, 4150, 1412]);
  const st = table(dir, "structure.csv");
  assert.equal(st.length, 3354);
  assert.equal(new Set(st.map((r) => r.hole_id)).size, 31);
  assert.ok(st.every((r) => len.has(r.hole_id) && Number(r.depth_m) >= 0 && Number(r.depth_m) <= len.get(r.hole_id) + 0.011 && Number(r.alpha) >= 0 && Number(r.alpha) <= 90 && Number(r.beta) >= 0 && Number(r.beta) <= 360 && r.structure_type));
});

test("assays: 14,664 gold results, a multi-element suite on 814 samples, '<' read as below detection and each sample once", () => {
  const a = waAssays(read(dir, "assays.csv").toString("utf8"));
  assert.equal(a.rows.length, 14664);
  assert.deepEqual(a.elements.map((e) => `${e.symbol} ${e.unit}`), ["Au ppm", "Ag ppm", "As ppm", "Bi ppm", "Cu ppm", "Mo ppm", "Pb ppm", "Sb ppm", "Te ppm", "W ppm", "Zn ppm", "S %"]);
  const au = a.rows.map((r) => r.values.Au);
  assert.ok(au.every((v) => v > 0)); // every row has a gold result
  assert.deepEqual([au.filter((v) => v >= 1).length, au.filter((v) => v >= 5).length, Math.max(...au)], [668, 154, 262.58]);
  assert.equal(new Set(a.rows.filter((r) => r.values.Au >= 1).map((r) => r.hole_id)).size, 52);
  assert.equal(a.rows.filter((r) => r.qualifiers?.Au === "<").length, 6738);
  assert.equal(a.rows.filter((r) => r.values.As != null).length, 814);
  assert.equal(new Set(a.rows.map((r) => `${r.hole_id}|${r.from}|${r.to}`)).size, 14664); // no interval twice: the gold row and the multi-element row of a sample are joined
});

test("the loader puts the assays in Geochem and says so; loading twice does not double them", async () => {
  const store = fakeStore();
  const notes = await loadWaSampleExtras(dir, fileOf(dir), store, { project: { crsSet: true, epsg: 28351 } });
  assert.deepEqual([store.state.assays.length, store.state.elements.length, store.state.surface.length, store.state.layers.length], [14664, 12, 0, 0]);
  assert.match(said(notes), /WA lode gold assays: 14,664 samples, 12 columns \(Au ppm/);
  await loadWaSampleExtras(dir, fileOf(dir), store, { existingElements: store.state.elements, project: { crsSet: true, epsg: 28351 } });
  assert.equal(store.state.assays.length, 14664);
});

test("the sample is offered, named, translated and licensed where a user reads it", () => {
  checkOffered(dir, { licence: "CC-BY-4.0", who: /WA lode gold sample .*Western Australia/, name: "WA lode gold (sample)", inFootnote: "WA lode gold (WAMEX report A122506)" });
});
