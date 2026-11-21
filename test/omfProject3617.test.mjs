// TASKS.csv #3617 (Fireweed rehearsal) — File > Export Project as OMF: the drillholes (a path line set and an interval line set carrying the assay elements, the density and the other numbers), the collars,
// the block models and surfaces in one Open Mining Format file, read back through GeoStrix's own OMF reader. SYNTHETIC holes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { omfElementsFromProject, omfColumnName, omfProjectDescription } from "../src/lib/omfProjectExport.js";
import { writeOMF } from "../src/lib/omfWriter.js";
import { parseOMF } from "../src/lib/omf.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const loc = (lang) => JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));

const cells = [];
for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 3; k++) cells.push({ x: 1005 + 10 * i, y: 2005 + 10 * j, z: 105 + 10 * k, dx: 10, dy: 10, dz: 10, value: i * 100 + j * 10 + k });
const STORE = {
  project: { name: "t" },
  collars: [{ hole_id: "H1", x: 1000, y: 2000, z: 500, length: 100, azimuth: 90, dip: 60, attrs: { year: 2023, "hole type": "DD", prospect: "Tom" } }, { hole_id: "H2", x: 1100, y: 2000, z: 510, length: 50, attrs: { year: 2019, "hole type": "RC" } }],
  survey: [{ hole_id: "H1", depth: 0, azimuth: 90, dip: 60 }, { hole_id: "H1", depth: 100, azimuth: 100, dip: 55 }],
  layers: { litho: [{ hole_id: "H1", from: 0, to: 40, value: "AND" }], sg: [{ hole_id: "H1", from: 10, to: 12.5, value: 2.71, method: "MEAS" }] },
  assays: [{ hole_id: "H1", from: 0, to: 2, values: { Cu: 0.12, Au: 1.5 } }, { hole_id: "H2", from: 0, to: 2, values: { Cu: 0.3 } }],
  assayElements: [{ symbol: "Cu", unit: "%" }, { symbol: "Au", unit: "g/t" }],
  voxelModels: [{ name: "bm", cells, property: "chi" }],
};

test("the elements: the hole paths, the interval segments with the numbers and the text, the collars with their fields, the block model", () => {
  const { elements } = omfElementsFromProject(STORE);
  assert.deepEqual(elements.map((e) => [e.type, e.name]), [["lines", "Drillholes (paths)"], ["lines", "Drillholes (intervals)"], ["points", "Collars"], ["volume", "bm"]]);
  const paths = elements[0];
  assert.equal(paths.segments.length % 2, 0); assert.ok(paths.segments.length >= 4);
  const depth = paths.data.find((d) => d.name === "depth_m").values;
  assert.equal(depth[0], 0); assert.ok(depth[depth.length - 1] > 0);
  // #3712 — the hole is its id, as mapped text, on the paths, the intervals and the collars (no number, no key in a description)
  assert.deepEqual([...new Set(paths.data.find((d) => d.name === "hole").strings)], ["H1", "H2"]);
  assert.doesNotMatch(paths.description, /\d+ H\d/);
  const iv = elements[1], names = iv.data.map((d) => d.name);
  assert.deepEqual(names.filter((n) => /\(m\)$/.test(n)), ["Lithology: from (m)", "Lithology: to (m)", "Specific gravity: from (m)", "Specific gravity: to (m)", "Assays: from (m)", "Assays: to (m)"]);
  for (const n of ["Cu (%)", "Au (g/t)", "Specific gravity", "Lithology", "method"]) assert.ok(names.includes(n), `${n}: ${names.join(", ")}`);
  assert.ok(!names.some((n) => /_|\(1\)/.test(n)), `no 'Cu_% (%)' or 'FROM (1)': ${names.join(", ")}`);
  assert.deepEqual(iv.data.find((d) => d.name === "Lithology").strings.filter(Boolean), ["AND"]);
  assert.deepEqual(iv.data.find((d) => d.name === "method").strings.filter(Boolean), ["MEAS"]);
  const nSeg = iv.segments.length / 2; for (const d of iv.data) assert.equal((d.values || d.strings).length, nSeg, d.name);
  // an interval with no value of an element is NaN: Cu has two intervals, Au one (H2's has none)
  const au = iv.data.find((d) => d.name === "Au (g/t)").values; assert.equal(au.filter((v) => Number.isFinite(v)).length, 1);
  // H2 has assays and no density: its depths are in the assays' pair, as H1's are (they were in the density's FROM / TO)
  const aF = iv.data.find((d) => d.name === "Assays: from (m)").values, sF = iv.data.find((d) => d.name === "Specific gravity: from (m)").values;
  assert.equal(aF.filter(Number.isFinite).length, 2); assert.equal(sF.filter(Number.isFinite).length, 1);
  const col = elements[2];
  assert.equal(col.vertices.length, 6);
  assert.deepEqual(col.data.find((d) => d.name === "hole").strings, ["H1", "H2"]);
  assert.deepEqual(Array.from(col.data.find((d) => d.name === "year").values), [2023, 2019]); // a number field
  assert.deepEqual(col.data.find((d) => d.name === "prospect").strings, ["Tom", ""]); // a text field, blank where there is none
  assert.ok(col.data.some((d) => d.name === "hole_type") || col.data.some((d) => d.name === "hole type"), "the hole type is there: " + col.data.map((d) => d.name).join(", "));
});

test("written and read back through GeoStrix's OMF reader: the hole ids and the text are the file's, the line sets, the points and the block model are in it", async () => {
  const { elements } = omfElementsFromProject(STORE);
  const bytes = await writeOMF({ name: "t", elements });
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x84, 0x83, 0x82, 0x81]);
  const back = await parseOMF(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.deepEqual(back.elements.map((e) => e.kind), ["lines", "lines", "points", "volume"]);
  const ivBack = back.elements[1], attr = (el, n) => el.attributes.find((a) => a.name === n);
  assert.ok(ivBack.attributes.some((a) => /^Cu/.test(a.name)), "the assay element is an attribute of the interval segments");
  assert.equal(attr(ivBack, "hole").kind, "category");
  assert.deepEqual([...new Set(attr(ivBack, "hole").values)], ["H1", "H2"]);
  assert.deepEqual(attr(ivBack, "Lithology").values.filter(Boolean), ["AND"]); // blank where an interval has none
  assert.deepEqual(attr(back.elements[2], "hole").values, ["H1", "H2"]);
  assert.deepEqual(attr(back.elements[2], "prospect").values, ["Tom", ""]);
  assert.equal(back.elements[3].tensor_u.length, 2);
});

test("#3712 every hole can be named from the file: 559 holes are 559 ids (the key in a description stopped after 46)", async () => {
  const collars = [], layers = { sg: [] };
  for (let i = 0; i < 559; i++) { const id = `${["BX23", "JS76", "NB22", "TS19"][i % 4]}-${String(i + 1).padStart(3, "0")}`; collars.push({ hole_id: id, x: 1000 + i, y: 2000, z: 500, length: 20 }); layers.sg.push({ hole_id: id, from: 0, to: 2, value: 2.7 }); }
  const { elements } = omfElementsFromProject({ project: { name: "big" }, collars, survey: [], layers, assays: [], assayElements: [] });
  const bytes = await writeOMF({ name: "big", elements });
  const back = await parseOMF(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  for (const el of back.elements) assert.equal(new Set(el.attributes.find((a) => a.name === "hole").values).size, 559, el.name);
  assert.ok(back.elements.find((e) => e.name === "Collars").attributes.find((a) => a.name === "hole").values.includes("NB22-559"));
});

test("#3712 / #3717 the columns are named for what they hold, and the project says its CRS and carries the data credit", () => {
  assert.equal(omfColumnName("Ag_ppm", "ppm"), "Ag (g/t)"); // silver in ppm is g/t, as everywhere (#3698)
  assert.equal(omfColumnName("Pb_%", "%"), "Pb (%)"); assert.equal(omfColumnName("Zn_ppm", "ppm"), "Zn (ppm)");
  assert.equal(omfColumnName("FROM", "m", [null, "Specific gravity"]), "Assays: from (m)"); // source 0 here is the assays
  assert.equal(omfColumnName("TO (1)", "m", ["Lithology", "Specific gravity"]), "Specific gravity: to (m)");
  assert.equal(omfColumnName("Specific gravity", undefined), "Specific gravity");
  const d = omfProjectDescription({ epsg: 26909, dataCredit: "Drilling data courtesy of Fireweed Metals Corp., Macpass Project, Yukon" }, "2026-11-16");
  assert.match(d, /^Exported from GeoStrix 2026-11-16; coordinates are the project's \(CRS: EPSG:26909; an OMF file holds none\)\. Data credit: Drilling data courtesy of Fireweed Metals Corp\./);
  assert.match(omfProjectDescription({ crsSet: false, epsg: 26909 }, "2026-11-16"), /CRS: not set/); assert.doesNotMatch(omfProjectDescription({}, "x"), /Data credit/);
});

test("a project with nothing to export; and the pieces are wired: menu, App, tooltip", () => {
  assert.deepEqual(omfElementsFromProject({ project: {} }).elements, []);
  assert.match(read("../electron/main.js"), /\{ label: L\("Export Project as OMF \(\.omf\)…"\), click: \(\) => sendMenuWithGesture\("export-omf"\) \}/);
  const a = read("../src/App.jsx");
  assert.match(a, /else if \(action === "export-omf"\) runOmfExport\(\);/); assert.match(a, /await import\("\.\/lib\/omfProjectExport\.js"\)\)\.exportProjectOmf\(storeRef\.current\)/);
  assert.match(read("../src/modules/GeophysicsModule.jsx"), /UBC mesh \+ model, \.omf \(Leapfrog, Micromine, Datamine\)/);
  const e = read("../src/lib/omfProjectExport.js"); assert.doesNotMatch(e, /^import .*omfWriter\.js.*h5wasm/m);
  for (const lang of ["es", "pt", "fr", "ar"]) { const d = loc(lang); for (const k of ["Saved {file}: {h} drillhole(s), {l} line set(s), {p} point set(s), {s} surface(s), {b} block model(s).", "{n} text column(s) of the drillhole logs are not in the OMF (it holds numbers): {list}."]) assert.ok(d[k], `${lang}: ${k.slice(0, 30)}`); }
});
