// TASKS.csv #3107 — the WA zinc-copper sample (WAMEX report A77713, CC BY 4.0): the 32 logged holes of a 2007 program on sulphide
// prospects in felsic volcanic rocks, with soils and stream sediments of the same year. Only ROUTINE samples, and no depth counted twice.
import test from "node:test";
import assert from "node:assert/strict";
import { waAssays, waSurface, loadWaSampleExtras } from "../src/lib/sampleWa.js";
import { read, table, folderBytes, fileOf, said, checkIntervals, fakeStore, checkOffered } from "./sampleChecks3107.mjs";

const dir = "wa_zinc_copper";

test("32 holes in MGA zone 50, every one surveyed on a grid azimuth, with intervals that neither overlap nor pass the hole's end", () => {
  assert.ok(folderBytes(dir) < 0.4e6, `${folderBytes(dir)} bytes`);
  const { collars, survey } = checkIntervals(dir, ["litho.csv", "weath.csv", "alt.csv", "assays.csv"]);
  assert.equal(collars.length, 32);
  assert.ok(collars.every((c) => c.epsg === "28350" && c.hole_type === "RC" && Number(c.x) > 727000 && Number(c.x) < 734000 && Number(c.y) > 7638000 && Number(c.y) < 7655000 && Number(c.z) > 190 && Number(c.z) < 330));
  assert.deepEqual(Object.fromEntries(["Kangaroo Caves", "Jamesons", "Breakers", "Nambucca"].map((p) => [p, collars.filter((c) => c.prospect === p).length])), { "Kangaroo Caves": 24, Jamesons: 5, Breakers: 2, Nambucca: 1 });
  assert.equal(survey.length, 103);
  // magnetic azimuth + the company's 2.5 degree correction: KCC018's first downhole station reads 48 magnetic in the source
  const s = survey.find((r) => r.hole_id === "KCC018" && r.depth === "60");
  assert.equal(Number(s.azimuth), 50.5);
  // the sulphide estimates: one row per mineral present, so several rows share an interval, all inside their hole
  const len = new Map(collars.map((c) => [c.hole_id, Number(c.length)])), m = table(dir, "mnlgy.csv");
  assert.equal(m.length, 1965);
  assert.deepEqual([...new Set(m.map((r) => r.mineral))].sort(), ["cp", "gn", "py", "sp"]);
  assert.ok(m.every((r) => len.has(r.hole_id) && Number(r.to) > Number(r.from) && Number(r.to) <= len.get(r.hole_id) + 0.011 && Number(r.percent) > 0 && Number(r.percent) <= 100));
});

test("assays: 1,550 routine samples in the source's units (ppm, gold in ppb), zinc to 29.2 %", () => {
  const a = waAssays(read(dir, "assays.csv").toString("utf8"));
  assert.equal(a.rows.length, 1550);
  assert.deepEqual(a.elements.map((e) => `${e.symbol} ${e.unit}`), ["Cu ppm", "Zn ppm", "Pb ppm", "Ag ppm", "Au ppb", "As ppm", "Ba ppm", "Fe ppm", "S ppm", "Mn ppm", "Ni ppm", "Sb ppm", "Hg ppm"]);
  const zn = a.rows.map((r) => r.values.Zn);
  assert.deepEqual([zn.filter((v) => v >= 10000).length, zn.filter((v) => v >= 50000).length, Math.max(...zn), Math.max(...a.rows.map((r) => r.values.Cu))], [212, 77, 292000, 104000]);
  assert.equal(new Set(a.rows.filter((r) => r.values.Zn >= 10000).map((r) => r.hole_id)).size, 22);
  assert.deepEqual([a.rows.filter((r) => r.qualifiers?.Au === "<").length, a.rows.filter((r) => r.qualifiers?.Ag === "<").length], [737, 710]);
  // where a composite and the 1 m samples taken later cover the same ground, the 1 m samples are the ones kept (BKC002, 110-120 m)
  const there = a.rows.filter((r) => r.hole_id === "BKC002" && r.from >= 110 && r.to <= 120);
  assert.ok(there.length >= 2 && there.every((r) => r.to - r.from === 1), JSON.stringify(there.map((r) => [r.from, r.to])));
});

test("surface samples: 157 soils and 46 stream sediments with 23 elements, the northing not taken for yttrium", () => {
  const soils = waSurface(read(dir, "soils.csv").toString("utf8"), "soil"), streams = waSurface(read(dir, "streams.csv").toString("utf8"), "stream sediment");
  assert.deepEqual([soils.samples.length, streams.samples.length, soils.elements.length, streams.elements.length], [157, 46, 23, 23]);
  assert.deepEqual(soils.elements.find((e) => e.symbol === "Y"), { symbol: "Y", header: "Y_ppm", unit: "ppm", checked: true });
  assert.deepEqual(soils.elements.find((e) => e.symbol === "Au").unit, "ppb");
  const all = [...soils.samples, ...streams.samples];
  assert.ok(all.every((s) => s.x > 723000 && s.x < 736000 && s.y > 7637000 && s.y < 7662000 && s.z === null && s.values.Y < 100 && s.values.Zn > 0));
  assert.equal(new Set(all.map((s) => s.sample_id)).size, 203);
  assert.deepEqual([Math.max(...soils.samples.map((s) => s.values.Zn)), Math.max(...streams.samples.map((s) => s.values.Zn))], [1660, 521]);
});

test("the loader puts the assays in Geochem and the soils and stream sediments in the surface samples", async () => {
  const store = fakeStore();
  const notes = await loadWaSampleExtras(dir, fileOf(dir), store, { project: { crsSet: true, epsg: 28350 } });
  assert.deepEqual([store.state.assays.length, store.state.elements.length, store.state.surface.length, store.state.surfaceElements.length], [1550, 13, 203, 23]);
  assert.deepEqual([store.state.surface.filter((s) => s.medium === "soil").length, store.state.surface.filter((s) => s.medium === "stream sediment").length], [157, 46]);
  assert.match(said(notes), /WA zinc-copper surface samples: 157 soil, 46 stream sediment/);
  await loadWaSampleExtras(dir, fileOf(dir), store, { existingElements: store.state.elements, existingSurfaceElements: store.state.surfaceElements, project: { crsSet: true, epsg: 28350 } });
  assert.deepEqual([store.state.assays.length, store.state.surface.length], [1550, 203]); // loading twice does not double them
});

test("the sample is offered, named, translated and licensed where a user reads it", () => {
  checkOffered(dir, { licence: "CC-BY-4.0", who: /WA zinc-copper sample .*surface geochemistry.*Western Australia/, name: "WA zinc-copper (sample)", inFootnote: "WA zinc-copper (WAMEX report A77713)" });
  assert.match(read(dir, "README.md").toString("utf8"), /Unless otherwise noted, \.\.\. all copyright content of the Data is licensed under a Creative Commons Attribution\s+4\.0 International licence/);
});
