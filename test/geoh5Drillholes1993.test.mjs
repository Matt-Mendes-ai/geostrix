// TASKS.csv #1993 (export, drillhole step) — the project's holes as geoh5 Drillhole objects, round-tripped through lib/geoh5.js's own reader: collars, survey stations (dip
// negative down as geoh5 has it), the desurveyed path, interval layers / custom layers / assays as FROM / TO cell sets, point logs as vertices with their DEPTH.
// Written from the geoh5 format description (objects.rst: Drillhole {7CAEBF0E-D16E-11E3-BC69-E4632694AA37}, attribute Collar; datasets Surveys [Depth, Dip, Azimuth] and Trace;
// groups.rst: Drillholes {825424FB-C2C6-4FEA-9F2B-6CD00023D393}). SYNTHETIC holes, plus a subset of the bundled Macpass sample (used with its owner's permission).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import h5wasm from "h5wasm";
import Papa from "papaparse";
import { writeGeoh5, GEOH5_WRITE_TYPES, DRILLHOLES_GROUP_TYPE } from "../src/lib/geoh5Write.js";
import { parseGeoh5 } from "../src/lib/geoh5.js";
import { projectGeoh5Elements, drillholeElements } from "../src/lib/geoh5Export.js";
import { drillholeTables } from "../src/lib/geoh5Import.js";
import { desurveyHole } from "../src/lib/desurvey.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const back = async (bytes) => parseGeoh5(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const arr = (v) => Array.from(v, (x) => (Number.isNaN(x) ? null : x));

const STORE = {
  project: { desurveyMethod: "minimumCurvature" },
  collars: [{ hole_id: "H1", x: 1000, y: 2000, z: 500, length: 100, azimuth: 90, dip: 60 }, { hole_id: "H2", x: 1100, y: 2000, z: 510, length: 50 }, { hole_id: "NOZ", x: 1, y: 2 }],
  survey: [{ hole_id: "H1", depth: 0, azimuth: 90, dip: 60 }, { hole_id: "H1", depth: 50, azimuth: 95, dip: 58 }, { hole_id: "H1", depth: 100, azimuth: 100, dip: 55 }],
  layers: {
    litho: [{ hole_id: "H1", from: 0, to: 40, value: "AND" }, { hole_id: "H1", from: 40, to: 100, value: "RHY" }, { hole_id: "H2", from: 0, to: 50, value: "AND" }],
    sg: [{ hole_id: "H1", from: 10, to: 12.5, value: 2.71, method: "MEAS" }, { hole_id: "H1", from: 50, to: 52, value: 3.1, method: "REG" }],
    magsusc: [{ hole_id: "H1", depth: 20, value: 12.5 }, { hole_id: "H1", depth: 30.25, value: 0.4 }],
  },
  customLayers: [{ name: "Oxidation", rows: [{ hole_id: "H1", from: 0, to: 15, value: "OX" }] }],
  assays: [{ hole_id: "H1", from: 0, to: 2, sample_id: "S1", values: { Cu: 0.12, Au: 1.5 } }, { hole_id: "H1", from: 2, to: 4, sample_id: "S2", values: { Cu: 0.3 } }],
  assayElements: [{ symbol: "Cu", unit: "%" }, { symbol: "Au", unit: "g/t" }],
};

test("the elements: one Drillhole per collar with x / y / z; the others counted; dips negative down; a path of the project's method", () => {
  const { elements, left } = drillholeElements(STORE);
  assert.deepEqual(elements.map((e) => e.name), ["H1", "H2"]);
  assert.deepEqual(left, ["1 collar(s) without x, y and z."]);
  const h1 = elements[0];
  assert.deepEqual(h1.collar, [1000, 2000, 500]);
  assert.deepEqual(h1.surveys, [[0, 90, -60], [50, 95, -58], [100, 100, -55]], "GeoStrix keeps dip positive down; geoh5 has it negative");
  const path = desurveyHole(STORE.collars[0], STORE.survey, "minimumCurvature");
  assert.deepEqual(h1.trace[h1.trace.length - 1], [path[path.length - 1].x, path[path.length - 1].y, path[path.length - 1].z], "the trace ends where the desurveyed hole ends");
  assert.deepEqual(elements[1].surveys, [], "H2 has no survey and no collar attitude: none written (its trace is straight down)");
  assert.equal(elements[1].trace[elements[1].trace.length - 1][2], 510 - 50);
});

test("round trip through the reader: collars, surveys, interval sets with their own FROM / TO, point logs by DEPTH, assays with units", async () => {
  const { elements } = projectGeoh5Elements(STORE);
  const { bytes, written, skipped } = await writeGeoh5(elements);
  assert.deepEqual(skipped, []);
  assert.deepEqual(written.map((w) => [w.kind, w.name]), [["drillhole", "H1"], ["drillhole", "H2"]]);
  const ws = await back(bytes);
  const by = Object.fromEntries(ws.elements.map((e) => [e.name, e]));
  const h1 = by.H1;
  assert.equal(h1.kind, "drillhole");
  assert.deepEqual(h1.collar, [1000, 2000, 500]); assert.equal(h1.endOfHole, 100);
  assert.deepEqual(h1.surveys, [[0, 90, -60], [50, 95, -58], [100, 100, -55]]);
  const sets = h1.intervalSets.map((s) => ({ from: s.from, to: s.to, cols: Object.fromEntries(Object.entries(s.columns).map(([k, v]) => [k, arr(v)])) }));
  const sg = sets.find((s) => "Specific gravity" in s.cols), lith = sets.find((s) => "Lithology" in s.cols), ox = sets.find((s) => "Oxidation" in s.cols), as = sets.find((s) => "Cu_%" in s.cols);
  assert.deepEqual([sg.from, sg.to, sg.cols["Specific gravity"], sg.cols.method], [[10, 50], [12.5, 52], [2.71, 3.1], ["MEAS", "REG"]]);
  assert.deepEqual([lith.from, lith.to, lith.cols.Lithology], [[0, 40], [40, 100], ["AND", "RHY"]]);
  assert.deepEqual([ox.from, ox.to, ox.cols.Oxidation], [[0], [15], ["OX"]]);
  assert.deepEqual([as.from, as.to, as.cols["Cu_%"], as.cols["Au_g/t"], as.cols.sample_id], [[0, 2], [2, 4], [0.12, 0.3], [1.5, null], ["S1", "S2"]], "a missing assay is no-data, not 0");
  assert.deepEqual([h1.points.depth, arr(h1.points.columns["Mag. susc."])], [[20, 30.25], [12.5, 0.4]]);
  const h2 = by.H2;
  assert.deepEqual(h2.collar, [1100, 2000, 510]);
  assert.deepEqual(h2.intervalSets[0].to, [50]);
  // and the reader's own tables (what File > Import reads back into the project) give the same rows
  const tables = Object.fromEntries(drillholeTables(ws.elements.filter((e) => e.kind === "drillhole"), "rt").map((t) => [t.name, t.text.replace(/\r\n/g, "\n")]));
  const lines = (t) => { const l = t.trim().split("\n"); return [l[0], l.slice(1).sort().join("|")]; }; // the file's objects come back in the order of their ids: compare the rows as a set
  assert.deepEqual(lines(tables["rt_collars.csv"]), ["hole_id,x,y,z,azimuth,dip,depth", "H1,1000,2000,500,90,-60,100|H2,1100,2000,510,,,50"]);
  assert.deepEqual(lines(tables["rt_surveys.csv"]), ["hole_id,depth,azimuth,dip", "H1,0,90,-60|H1,100,100,-55|H1,50,95,-58"]);
});

test("the file follows the format description: Collar, Surveys [Depth, Dip, Azimuth], Trace, Vertices with DEPTH, Cells pairs, the Drillholes group, one data type per name", async () => {
  const { bytes } = await writeGeoh5(projectGeoh5Elements(STORE).elements);
  const mod = await h5wasm.ready, path = `/dh_${Date.now()}.geoh5`;
  mod.FS.writeFile(path, bytes);
  const f = new h5wasm.File(path, "r");
  try {
    assert.equal(GEOH5_WRITE_TYPES.drillhole.id, "{7CAEBF0E-D16E-11E3-BC69-E4632694AA37}"); assert.equal(DRILLHOLES_GROUP_TYPE, "{61FBB4E8-A480-11E3-8D5A-2776BDF4F982}", "a plain container: geoh5py reads the {825424FB-...} Drillholes group as a concatenator (#3429)");
    const top = f.get("GEOSCIENCE/Root");
    assert.equal(top.get("Objects").keys().length, 0, "drillholes are in their own group, not the root's objects");
    const groups = top.get("Groups").keys();
    assert.equal(groups.length, 1);
    const g = top.get(`Groups/${groups[0]}`);
    assert.equal(g.attrs.Name.value, "Drillholes"); assert.equal(g.get("Type").attrs.ID.value, DRILLHOLES_GROUP_TYPE);
    assert.equal(g.get("Objects").keys().length, 2);
    const oid = g.get("Objects").keys().find((k) => f.get(`GEOSCIENCE/Objects/${k}`).attrs.Name.value === "H1"), o = f.get(`GEOSCIENCE/Objects/${oid}`);
    assert.equal(o.get("Type").attrs.ID.value, "{7CAEBF0E-D16E-11E3-BC69-E4632694AA37}");
    { const cv = o.attrs.Collar.value; assert.deepEqual(Array.from(Array.isArray(cv[0]) || ArrayBuffer.isView(cv[0]) ? cv[0] : cv), [1000, 2000, 500], "a scalar compound (#3429)"); assert.deepEqual(o.attrs.Collar.shape, []); }
    const sv = o.get("Surveys");
    assert.deepEqual(Object.keys(sv.metadata.compound_type.members ? Object.fromEntries(sv.metadata.compound_type.members.map((m) => [m.name, 1])) : {}), ["Depth", "Azimuth", "Dip"], "the order geoh5py requires (#3429)");
    assert.equal(sv.metadata.compound_type.members[0].type, 1, "float32 (#3429)"); assert.equal(o.get("Cells").dtype, "<I", "uint32 cells, as geoh5py checks (#3429)");
    assert.equal(o.get("Trace").shape[0] >= 2, true);
    const vertices = o.get("Vertices"), cells = o.get("Cells"), nV = vertices.shape[0];
    assert.deepEqual(cells.shape[1], 2); assert.ok(Array.from(cells.value).every((c) => c >= 0 && c < nV), "cells point at vertices");
    const names = o.get("Data").keys().map((k) => o.get(`Data/${k}`).attrs.Name.value);
    assert.ok(names.includes("DEPTH") && names.includes("FROM") && names.includes("TO") && names.includes("FROM (1)"), names.join(", "));
    const depth = o.get("Data").keys().map((k) => o.get(`Data/${k}`)).find((d) => d.attrs.Name.value === "DEPTH");
    assert.equal(depth.attrs.Association.value, "Vertex"); assert.equal(depth.get("Data").value.length, nV, "every vertex has a DEPTH (objects.rst)");
    // every Data type is shared by name: H1 and H2 both carry Lithology: one type
    const typeNames = f.get("GEOSCIENCE/Types/Data types").keys().map((k) => f.get(`GEOSCIENCE/Types/Data types/${k}`).attrs.Name.value);
    assert.equal(typeNames.filter((n) => n === "Lithology").length, 1);
  } finally { f.close(); try { mod.FS.unlink(path); } catch { /* gone */ } }
});

test("a subset of the Macpass sample: 12 holes, every survey station, density and assay interval comes back", async () => {
  const rd = (n) => Papa.parse(read(`../sample_data/yk_macpass/${n}`), { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
  const ids = new Set(rd("collars.csv").slice(0, 400).filter((c) => /^(JS80|JS81|TS23)/.test(c.hole_id)).map((c) => c.hole_id).slice(0, 12));
  assert.equal(ids.size, 12);
  const keep = (rows) => rows.filter((r) => ids.has(String(r.hole_id)));
  const sg = keep(rd("sg.csv")), assays = keep(rd("assays.csv")), survey = keep(rd("survey.csv")), collars = keep(rd("collars.csv"));
  const store = { project: {}, collars, survey: survey.map((s) => ({ ...s, dip: -s.dip })), layers: { sg: sg.map((r) => ({ hole_id: r.hole_id, from: r.from, to: r.to, value: r.sg, method: r.method, low_recovery: r.low_recovery })) },
    assays: assays.map((r) => ({ hole_id: r.hole_id, from: r.from, to: r.to, values: { Ag: r.Ag_ppm, Pb: r.Pb_pct, Zn: r.Zn_pct } })), assayElements: [{ symbol: "Ag", unit: "ppm" }, { symbol: "Pb", unit: "%" }, { symbol: "Zn", unit: "%" }] };
  const { bytes, written, skipped } = await writeGeoh5(projectGeoh5Elements(store).elements);
  assert.equal(written.length, 12); assert.deepEqual(skipped, []);
  const holes = (await back(bytes)).elements;
  const count = (key) => holes.reduce((n, h) => n + h.intervalSets.filter((s) => key in s.columns).reduce((m, s) => m + s.from.length, 0), 0);
  assert.equal(count("Specific gravity"), sg.length);
  assert.equal(holes.reduce((n, h) => n + h.surveys.length, 0), survey.length);
  assert.ok(count("Ag_ppm") >= assays.filter((r) => Number.isFinite(r.Ag_ppm)).length && count("Ag_ppm") <= assays.length);
  const first = holes.find((h) => h.name === collars[0].hole_id), c0 = collars[0], s0 = survey.find((s) => s.hole_id === c0.hole_id);
  assert.deepEqual(first.collar, [c0.x, c0.y, c0.z]); assert.deepEqual(first.surveys[0], [s0.depth, s0.azimuth, s0.dip].map(Math.fround), "the file has dip negative down: the same numbers come back, as float32 (geoh5py reads Depth / Azimuth / Dip as f4)");
});

test("wired: the export builds drillholes first, the sentence counts them, the no-data case says them too, and the writer opens each flat group once", () => {
  const e = read("../src/lib/geoh5Export.js");
  assert.match(e, /\{ const dh = drillholeElements\(store\); elements\.push\(\.\.\.dh\.elements\); left\.push\(\.\.\.dh\.left\); \}/);
  assert.match(e, /Saved \{file\}: \{d\} drillhole\(s\), \{p\} point object\(s\)/);
  assert.match(e, /Nothing in this project can go to a \.geoh5 yet: drillholes, point surveys/);
  assert.doesNotMatch(e, /Drillholes are not written yet|drillholes come later/);
  const w = read("../src/lib/geoh5Write.js");
  assert.match(w, /const G = \{ data: f\.get\("GEOSCIENCE\/Data"\)/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["Saved {file}: {d} drillhole(s), {p} point object(s), {c} curve(s), {s} surface(s), {b} block model(s).", "{n} collar(s) without x, y and z.", "Nothing in this project can go to a .geoh5 yet: drillholes, point surveys, surface samples, lines, surfaces and block models do."]) assert.ok(d[k], `${lang}: ${k.slice(0, 40)}`);
  }
});

test("the export writes through a worker (a project of 559 holes froze the window for ~45 s), falling back to the same writer here", () => {
  const c = read("../src/lib/geoh5WriteClient.js"), w = read("../src/lib/geoh5Write.worker.js");
  assert.match(c, /new Worker\(new URL\("\.\/geoh5Write\.worker\.js", import\.meta\.url\), \{ type: "module" \}\)/);
  assert.match(c, /if \(typeof Worker === "undefined"\) return writeGeoh5\(elements, opts\);/);
  assert.match(c, /w\.onerror = \(e\) => \{ e\.preventDefault\?\.\(\); done\(\); writeGeoh5\(elements, opts\)\.then\(resolve, reject\); \}/);
  assert.match(w, /self\.postMessage\(\{ id, res \}, \[res\.bytes\.buffer\]\);/);
  assert.match(read("../src/lib/geoh5Export.js"), /await writeGeoh5Async\(elements\)/);
  assert.doesNotMatch(c, /^import .*h5wasm/m, "h5wasm stays on demand");
});
