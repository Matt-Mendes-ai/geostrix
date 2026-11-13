// TASKS.csv #3107 — the WA lead-silver-zinc sample (WAMEX report A91581, CC BY 4.0): 99 shallow holes on a carbonate-hosted deposit, with
// lithology, weathering, assays and specific gravity. The plain drillhole sample: collars, surveys, logs and assays, nothing else.
import test from "node:test";
import assert from "node:assert/strict";
import { waAssays, loadWaSampleExtras } from "../src/lib/sampleWa.js";
import { read, table, folderBytes, fileOf, said, checkIntervals, fakeStore, checkOffered } from "./sampleChecks3107.mjs";

const dir = "wa_lead_zinc";

test("99 holes in MGA zone 52, every one surveyed, with intervals that neither overlap nor pass the hole's end", () => {
  assert.ok(folderBytes(dir) < 0.9e6, `${folderBytes(dir)} bytes`);
  const { collars, survey } = checkIntervals(dir, ["litho.csv", "weath.csv", "assays.csv", "sg.csv"]);
  assert.equal(collars.length, 99);
  assert.deepEqual([collars.filter((c) => c.hole_type === "RC").length, collars.filter((c) => c.hole_type === "DD").length], [89, 10]);
  assert.ok(collars.every((c) => c.epsg === "28352" && Number(c.x) > 496000 && Number(c.x) < 499000 && Number(c.y) > 8290000 && Number(c.y) < 8294000 && Number(c.z) > 19 && Number(c.z) < 22 && Number(c.length) <= 160));
  assert.equal(survey.length, 437); // five stations logged deeper than their hole are left out
  const litho = table(dir, "litho.csv");
  assert.equal(litho.length, 7905);
  assert.equal(new Set(litho.map((r) => r.lithology)).size, 12);
  // the stratigraphic unit's stray spaces and its two spellings of one unit are joined
  assert.deepEqual([...new Set(litho.map((r) => r.strat))].sort(), ["", "CI", "Cl", "Clbk", "Cz", "DI", "DII", "DIII", "UF"]);
  assert.equal(table(dir, "sg.csv").length, 424);
});

test("assays: 5,970 samples, Pb / Zn / Fe / S in per cent and Ag / Cd / Sb in ppm, the laboratory's negative codes read as below detection", () => {
  const a = waAssays(read(dir, "assays.csv").toString("utf8"));
  assert.equal(a.rows.length, 5970);
  assert.deepEqual(a.elements.map((e) => `${e.symbol} ${e.unit}`), ["Pb %", "Zn %", "Ag ppm", "Cd ppm", "Sb ppm", "Fe %", "S %"]);
  const pb = a.rows.map((r) => r.values.Pb);
  assert.deepEqual([pb.filter((v) => v >= 1).length, pb.filter((v) => v >= 5).length, Math.max(...pb)], [554, 132, 59.724]);
  assert.equal(new Set(a.rows.filter((r) => r.values.Pb >= 1).map((r) => r.hole_id)).size, 86);
  // -0.005 % Pb is "below 0.005": stored at half the limit with the qualifier, never as a negative grade; the no-data code is gone
  assert.deepEqual([a.rows.filter((r) => r.qualifiers?.Pb === "<").length, a.rows.filter((r) => r.qualifiers?.Ag === "<").length], [688, 4486]);
  assert.ok(a.rows.every((r) => Object.values(r.values).every((v) => v >= 0 && v < 5000)));
  assert.deepEqual([a.rows[0].hole_id, a.rows[0].from, a.rows[0].values.Pb, a.rows[0].qualifiers.Pb, a.rows[0].values.Zn], ["CSHDD030", 24, 0.0025, "<", 0.0056]);
  // the 100 samples of one hole are all typed "not sampled" in the source but carry results: they are in
  assert.equal(a.rows.filter((r) => r.hole_id === "ISHRC019").length, 100);
});

test("the loader puts the assays in Geochem and says so; loading twice does not double them", async () => {
  const store = fakeStore();
  const notes = await loadWaSampleExtras(dir, fileOf(dir), store, { project: { crsSet: true, epsg: 28352 } });
  assert.deepEqual([store.state.assays.length, store.state.elements.length, store.state.layers.length, store.state.rasters.length, store.state.surface.length], [5970, 7, 0, 0, 0]);
  assert.match(said(notes), /WA lead-silver-zinc assays: 5,970 samples, 7 columns \(Pb %, Zn %, Ag ppm/);
  await loadWaSampleExtras(dir, fileOf(dir), store, { existingElements: store.state.elements, project: { crsSet: true, epsg: 28352 } });
  assert.equal(store.state.assays.length, 5970);
});

test("the sample is offered, named, translated and licensed where a user reads it", () => {
  checkOffered(dir, { licence: "CC-BY-4.0", who: /WA lead-silver-zinc sample .*Western Australia/, name: "WA lead-silver-zinc (sample)", inFootnote: "WA lead-silver-zinc (WAMEX report A91581)" });
});
