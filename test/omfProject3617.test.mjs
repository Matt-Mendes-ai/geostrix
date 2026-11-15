// TASKS.csv #3617 (Fireweed rehearsal) — File > Export Project as OMF: the drillholes (a path line set and an interval line set carrying the assay elements, the density and the other numbers), the collars,
// the block models and surfaces in one Open Mining Format file, read back through GeoStrix's own OMF reader. SYNTHETIC holes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { omfElementsFromProject } from "../src/lib/omfProjectExport.js";
import { writeOMF } from "../src/lib/omfWriter.js";
import { parseOMF } from "../src/lib/omf.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const loc = (lang) => JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));

const cells = [];
for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 3; k++) cells.push({ x: 1005 + 10 * i, y: 2005 + 10 * j, z: 105 + 10 * k, dx: 10, dy: 10, dz: 10, value: i * 100 + j * 10 + k });
const STORE = {
  project: { name: "t" },
  collars: [{ hole_id: "H1", x: 1000, y: 2000, z: 500, length: 100, azimuth: 90, dip: 60 }, { hole_id: "H2", x: 1100, y: 2000, z: 510, length: 50 }],
  survey: [{ hole_id: "H1", depth: 0, azimuth: 90, dip: 60 }, { hole_id: "H1", depth: 100, azimuth: 100, dip: 55 }],
  layers: { litho: [{ hole_id: "H1", from: 0, to: 40, value: "AND" }], sg: [{ hole_id: "H1", from: 10, to: 12.5, value: 2.71, method: "MEAS" }] },
  assays: [{ hole_id: "H1", from: 0, to: 2, values: { Cu: 0.12, Au: 1.5 } }, { hole_id: "H2", from: 0, to: 2, values: { Cu: 0.3 } }],
  assayElements: [{ symbol: "Cu", unit: "%" }, { symbol: "Au", unit: "g/t" }],
  voxelModels: [{ name: "bm", cells, property: "chi" }],
};

test("the elements: the hole paths, the interval segments with the numbers, the collars, the block model; text left out and said", () => {
  const { elements, left } = omfElementsFromProject(STORE);
  assert.deepEqual(elements.map((e) => [e.type, e.name]), [["lines", "Drillholes (paths)"], ["lines", "Drillholes (intervals)"], ["points", "Collars"], ["volume", "bm"]]);
  const paths = elements[0];
  assert.equal(paths.segments.length % 2, 0); assert.ok(paths.segments.length >= 4);
  const depth = paths.data.find((d) => d.name === "depth_m").values;
  assert.equal(depth[0], 0); assert.ok(depth[depth.length - 1] > 0);
  const iv = elements[1], names = iv.data.map((d) => d.name);
  for (const n of ["hole", "FROM (m)", "TO (m)", "Specific gravity", "Cu_% (%)", "Au_g/t (g/t)"]) assert.ok(names.some((x) => x.startsWith(n.split(" ")[0])), `${n}: ${names.join(", ")}`);
  assert.ok(names.some((n) => /^Cu/.test(n)) && names.some((n) => /^Au/.test(n)) && names.some((n) => /^Specific gravity/.test(n)));
  assert.ok(!names.includes("method") && !names.includes("Lithology"), "text columns are not carried");
  assert.ok(left.some((l) => /text column\(s\) of the drillhole logs are not in the OMF/.test(l) && /Lithology/.test(l) && /method/.test(l)), left.join(" | "));
  const nSeg = iv.segments.length / 2; for (const d of iv.data) assert.equal(d.values.length, nSeg, d.name);
  // an interval with no value of an element is NaN: Cu has two intervals, Au one (H2's has none)
  const au = iv.data.find((d) => /^Au/.test(d.name)).values; assert.equal(au.filter((v) => Number.isFinite(v)).length, 1);
  assert.equal(elements[2].vertices.length, 6);
});

test("written and read back through GeoStrix's OMF reader: the line sets, the points and the block model are in the file", async () => {
  const { elements } = omfElementsFromProject(STORE);
  const bytes = await writeOMF({ name: "t", elements });
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x84, 0x83, 0x82, 0x81]);
  const back = await parseOMF(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.deepEqual(back.elements.map((e) => e.kind), ["lines", "lines", "points", "volume"]);
  const ivBack = back.elements[1];
  assert.ok(ivBack.attributes.some((a) => /^Cu/.test(a.name)), "the assay element is an attribute of the interval segments");
  assert.equal(back.elements[3].tensor_u.length, 2);
});

test("a project with nothing to export; and the pieces are wired: menu, App, tooltip", () => {
  assert.deepEqual(omfElementsFromProject({ project: {} }).elements, []);
  assert.match(read("../electron/main.js"), /\{ label: L\("Export Project as OMF \(\.omf\)…"\), click: \(\) => sendMenuWithGesture\("export-omf"\) \}/);
  const a = read("../src/App.jsx");
  assert.match(a, /else if \(action === "export-omf"\) runOmfExport\(\);/); assert.match(a, /await import\("\.\/lib\/omfProjectExport\.js"\)\)\.exportProjectOmf\(storeRef\.current\)/);
  assert.match(read("../src/modules/GeophysicsModule.jsx"), /UBC mesh \+ model, an \.omf of the block model \(for Leapfrog, Micromine and Datamine\)/);
  const e = read("../src/lib/omfProjectExport.js"); assert.doesNotMatch(e, /^import .*omfWriter\.js.*h5wasm/m);
  for (const lang of ["es", "pt", "fr", "ar"]) { const d = loc(lang); for (const k of ["Saved {file}: {h} drillhole(s), {l} line set(s), {p} point set(s), {s} surface(s), {b} block model(s).", "{n} text column(s) of the drillhole logs are not in the OMF (it holds numbers): {list}."]) assert.ok(d[k], `${lang}: ${k.slice(0, 30)}`); }
});
