// TASKS.csv #4105 (Matt, v0.2.14: "I don't see any geophysics in carbo creek sample") — the sample list shows a Geophysics (and Mapping) icon from the files in each GSQ
// folder, so the open must load every kind those icons claim. This test opens each of the five samples against its real folder with a recording store and fails when an
// icon's kind is not loaded, when a file in geophysics/ or mapping/ is neither read nor named as reference, or when the open does not call the loader.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { loadGsqGeophysics, GSQ_GEOPHYSICS, gsqKnownFiles } from "../src/lib/sampleGsqGeophysics.js";
import { SAMPLE_CONTENTS } from "../src/lib/sampleCards.js";

const IDS = ["gsq_carbo_creek", "gsq_cloncurry", "gsq_altia_south", "gsq_black_mountain", "gsq_edinburgh_park"];
const EPSG = { gsq_carbo_creek: 28354, gsq_cloncurry: 28354, gsq_altia_south: 28354, gsq_black_mountain: 20255, gsq_edinburgh_park: 28355 };
const dirOf = (id) => path.join(fileURLToPath(new URL("../sample_data/", import.meta.url)), id);
const walk = (root, sub) => { const out = []; const rec = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) rec(p); else out.push(path.relative(root, p).split(path.sep).join("/")); } }; rec(path.join(root, sub)); return out; };

// the kinds each sample's folder holds (the README's tables), the counts the open must reach
const EXPECT = {
  gsq_carbo_creek: { ipLines: 7, ipPlaced: 7, groundEm: 1 },
  gsq_cloncurry: { ipLines: 1, pointSurveys: 2, dhem: 3, groundEm: 1, loops: 1, mapLayers: 1, structures: 143 },
  gsq_altia_south: { dhem: 6, groundEm: 1, plates: 2, stationLayers: 1 },
  gsq_black_mountain: { ipLines: 6, ipPlaced: 6, pointSurveys: 3 },
  gsq_edinburgh_park: { ipLines: 6, pointSurveys: 1 },
};

async function openSample(id) {
  const dir = dirOf(id);
  const holeIds = Papa.parse(fs.readFileSync(path.join(dir, "collars.csv"), "utf8"), { header: true, skipEmptyLines: true }).data.map((r) => r.hole_id);
  const readFile = async (rel) => ({ name: rel.split("/").pop(), text: async () => fs.readFileSync(path.join(dir, rel), "utf8"), arrayBuffer: async () => { const b = fs.readFileSync(path.join(dir, rel)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } });
  const got = { dcip: [], layers: {}, surveys: {}, custom: [], boundaries: [], maps: [], structs: [], plates: 0 };
  const store = {
    saveDcipLine: (e) => got.dcip.push(e), setLayers: (f) => { got.layers = f(got.layers); }, updateGeophysSurvey: (k, m) => { got.surveys[k] = m; },
    addCustomLayer: (l) => got.custom.push(l), addBoundary: (b) => got.boundaries.push(b), addMapLayer: (l) => got.maps.push(l), addSurfaceStructureSet: (x) => got.structs.push(x),
  };
  const r = await loadGsqGeophysics(id, readFile, store, { projectEpsg: EPSG[id], label: id, importSolid: async () => { got.plates++; } });
  return { ...r, got, holeIds };
}

test("every file of a GSQ sample's geophysics/ and mapping/ is read by the open or named as reference (and every one named exists)", () => {
  for (const id of IDS) {
    const root = dirOf(id), known = gsqKnownFiles(id);
    const present = new Set([...walk(root, "geophysics"), ...walk(root, "mapping")]);
    for (const f of present) assert.ok(known.has(f), `${id}: ${f} is in the folder (so the list shows its icon) but the open neither reads it nor names it as reference`);
    for (const f of known) if (!/\.IND$/.test(f)) assert.ok(present.has(f), `${id}: ${f} is named in GSQ_GEOPHYSICS but is not in the folder`);
  }
});

test("each sample's open loads every kind its icons claim, with the counts the folders hold", async () => {
  for (const id of IDS) {
    const { counts, notes } = await openSample(id);
    const icons = SAMPLE_CONTENTS[id].has;
    if (icons.geophysics) assert.ok(Object.values(counts).some((n) => n > 0), `${id}: the Geophysics icon is shown but nothing of the geophysics was loaded`);
    if (icons.mapping) assert.ok(counts.mapLayers > 0, `${id}: the Mapping icon is shown but no map layer was loaded`);
    for (const [k, n] of Object.entries(EXPECT[id])) assert.ok(k === "groundEm" ? counts[k] > 0 : counts[k] === n, `${id}: ${k} ${counts[k]} (expected ${k === "groundEm" ? "some" : n})`);
    assert.ok(!notes.some((x) => x.level === "error"), `${id}: no error notice: ${JSON.stringify(notes.filter((x) => x.level === "error"))}`);
    assert.equal(notes.filter((x) => x.level !== "error").length, 1, `${id}: one short notice of what loaded`);
  }
});

test("what loads is where the Geophysics tab looks: IP lines placed with stations, surveys with a method, EM layers on the project's holes, the loop a boundary", async () => {
  for (const id of IDS) {
    const { got, holeIds } = await openSample(id);
    for (const e of got.dcip) { assert.ok(e.line.stations?.list?.length > 1 || (e.line.x0 !== "" && e.line.x1 !== ""), `${id}: IP line ${e.name} is placed from its stations / electrodes`); assert.ok(e.readings.length > 20 && e.rho.length === e.readings.length, `${id}: ${e.name} has readings`); assert.equal(e.sample, id); }
    for (const [name, meta] of Object.entries(got.surveys)) { assert.ok(meta?.method, `${id}: survey ${name} has a method`); assert.ok((got.layers.geophys_pts || []).some((p) => p._src === name), `${id}: survey ${name} has points`); }
    for (const l of got.custom) assert.ok(l.rows.length && l.rows.every((r) => holeIds.includes(r.hole_id)), `${id}: ${l.name} sits on the project's holes`);
    if (GSQ_GEOPHYSICS[id].groundEm) assert.ok(Object.keys(got.surveys).some((k) => /ground EM decay constant/.test(k)), `${id}: ground EM is one survey`);
  }
});

test("the counts side 2 verified in the app: Edinburgh's IP arrays read once (1,707), Cloncurry's .esf 422 readings, Black Mountain's corr_nlf magnetics, 38,038 readings (side 2's 85 without a value are in another column)", async () => {
  const e = await openSample("gsq_edinburgh_park");
  assert.equal(e.got.dcip.reduce((n, l) => n + l.readings.length, 0), 1707);
  assert.equal((await openSample("gsq_cloncurry")).got.dcip[0].readings.length, 422);
  const b = await openSample("gsq_black_mountain");
  assert.equal((b.got.layers.geophys_pts || []).filter((p) => p._src === "ground_mag_lines.xyz").length, 38038);
});

test("the sample's open calls the loader for a GSQ sample, after the holes' extras, with the solid import for the plates", () => {
  const src = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(src, /if \(which\.startsWith\("gsq_"\)\) \{ \/\/ TASKS\.csv #4105/);
  assert.match(src, /loadGsqGeophysics\(which, async \(rel\) => \(await loadSampleFiles\(WA_SAMPLES\[which\]\.dir, \[rel\]\)\)\[0\]/);
  assert.match(src, /importSolid: importSolidFile \}\)/);
});
