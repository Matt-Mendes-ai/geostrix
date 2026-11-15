// TASKS.csv #3424 ((A) step 1) — the store adapter: assays, survey and a custom layer's rows may be held as a Table (lib/rowTable.js). Through
// the real store (esbuild bundle with projectFields' TABLE_FIELDS in the same module graph, react-test-renderer, a fake desktop bridge), with
// the switches OFF (the default: as before) and ON:
//   - two useStore() reads in a row, and reads across an unrelated render, give the SAME objects (Main's condition: memos and #3483's data
//     generation key on them);
//   - ON: the open holds Tables and builds no rows until a reader asks; the rows then equal the file's;
//   - the saved file is byte-identical ON and OFF: right after the open, and after edits through each setter form;
//   - a custom layer edited through a descriptor copy keeps its Table; a spread copy keeps correct rows;
//   - undo, and a tab switch away and back.
import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { payloadFromFields, emptyFields, projectPartsSliced, projectJson, joinParts, fieldsFromPayload, expandPayloadSliced, TABLE_FIELDS as LIB_TABLE_FIELDS } from "../src/lib/projectFields.js";
import { tableFromCompact, tableFromCompactSliced, compactFromTable, compactFromTableSliced, isTable as isTableLib } from "../src/lib/rowTable.js";
import { compactTable } from "../src/lib/compactTable.js";
import { publishedLayers, internalLayers, layerTableOf, elementsWithValuesOf } from "../src/lib/tableFields.js";
import { elementsWithValues } from "../src/lib/presentElements.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let fileContent = null, saved = null;
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window.confirm = () => true;
globalThis.window.desktop = {
  saveFile: async ({ content }) => { saved = content; return { ok: true, filePath: "C:/tmp/saved.geostrix.json" }; },
  saveFileTo: async ({ content }) => { saved = content; return { ok: true }; },
  openFile: async () => ({ ok: true, content: fileContent.text, filePath: fileContent.path, name: path.basename(fileContent.path) }),
  autosaveWrite: async () => ({ ok: true }), autosaveRead: async () => ({ ok: false }), autosaveClear: async () => ({ ok: true }),
  autosaveQuarantine: async () => ({ ok: false }), setDirtyState: () => {},
};
const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => path.join(here, "..", "src", "lib", p).replace(/\\/g, "/");
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-tables3424-"));
const entry = path.join(dir, "entry.jsx");
writeFileSync(entry, [
  `export * from ${JSON.stringify(src("store.jsx"))};`,
  `export { TABLE_FIELDS } from ${JSON.stringify(src("projectFields.js"))};`,
  `export { isTable, rowsBuilt } from ${JSON.stringify(src("rowTable.js"))};`,
  `export { layerTableOf } from ${JSON.stringify(src("tableFields.js"))};`,
].join("\n"));
const out = path.join(dir, "store.bundle.mjs");
writeFileSync(out, buildSync({ entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "node", jsx: "transform",
  external: ["react", "react-dom"], loader: { ".js": "jsx" }, logLevel: "silent" }).outputFiles[0].text);
const B = await import(pathToFileURL(out).href);
const { StoreProvider, useStore, TABLE_FIELDS, isTable, rowsBuilt } = B;
test.after(() => rmSync(dir, { recursive: true, force: true }));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const UNDO_SETTLE = 900;
async function mount() {
  const ref = { s: null, renders: 0 };
  function Probe() { ref.s = useStore(); ref.renders++; return null; }
  let r;
  await act(async () => { r = TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Probe))); });
  await act(async () => { await wait(20); });
  return { ref, get s() { return ref.s; }, unmount: () => act(() => r.unmount()) };
}
const step = (fn, ms = 30) => act(async () => { fn(); await wait(ms); });
const setSwitches = (on) => { TABLE_FIELDS.clear(); if (on) for (const k of ["assays", "survey", "customLayers"]) TABLE_FIELDS.add(k); };

// big enough for every column encoder: 2,400 assays (two elements, one with blanks), 2,500 survey stations, a 3,000-row custom layer, a small one
function project(tag) {
  const H = 97;
  return { ...emptyFields(), project: { ...emptyFields().project, name: tag },
    collars: Array.from({ length: H }, (_, h) => ({ hole_id: `${tag}${h}`, x: 500000 + h * 50, y: 6200000, z: 1000, azimuth: 0, dip: -60, length: 120 })),
    survey: Array.from({ length: 2500 }, (_, i) => ({ hole_id: `${tag}${i % H}`, depth: Math.floor(i / H) * 5, azimuth: (i * 7) % 360, dip: -60 - (i % 20) })),
    assays: Array.from({ length: 2400 }, (_, i) => ({ hole_id: `${tag}${i % H}`, from: i * 0.1, to: i * 0.1 + 0.1, values: { Au: (i % 31) / 10, ...(i % 7 ? { Cu: (i % 13) / 100 } : {}) }, sample_id: `S${i}` })),
    assayElements: [{ symbol: "Au", unit: "ppm" }, { symbol: "Cu", unit: "%" }, { symbol: "Zn", unit: "ppm" }],
    customLayers: [
      { id: "g1", name: "gamma", unit: "cps", rows: Array.from({ length: 3000 }, (_, i) => ({ hole_id: `${tag}${i % H}`, depth: i * 0.1, value: i % 300 })) },
      { id: "s1", name: "small", rows: [{ hole_id: `${tag}0`, depth: 1, value: 2 }] },
    ] };
}
const fileOf = (live) => JSON.stringify(payloadFromFields(live));
const asRows = (o) => JSON.parse(JSON.stringify(o));
// equal texts, or the first difference with some context (the files are megabytes)
function sameText(a, b, msg) {
  if (a === b) return;
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  assert.fail(`${msg}: first difference at ${i} of ${a.length} / ${b.length}: ...${a.slice(Math.max(0, i - 120), i + 120)}... vs ...${b.slice(Math.max(0, i - 120), i + 120)}...`);
}
async function openWith(on, live) {
  setSwitches(on);
  const m = await mount();
  fileContent = { text: fileOf(live), path: "C:/tmp/p.geostrix.json" };
  let res;
  await act(async () => { res = await m.s.openProject(); await wait(80); });
  assert.equal(res.ok, true);
  return m;
}
async function saveText(m) {
  saved = null;
  await act(async () => { await m.s.saveProject({ saveAs: true }); await wait(50); });
  assert.equal(typeof saved, "string", "the save wrote text");
  return saved;
}

for (const on of [false, true]) {
  test(`identity (switches ${on ? "ON" : "OFF"}): two reads in a row and reads across an unrelated render are the same objects`, { timeout: 60000 }, async () => {
    const m = await openWith(on, project("I_"));
    try {
      const a = { assays: m.s.assays, survey: m.s.survey, layers: m.s.customLayers, assaysTable: m.s.assaysTable, surveyTable: m.s.surveyTable };
      const g = a.layers[0], gRows = g.rows;
      assert.equal(m.s.assays, a.assays); assert.equal(m.s.survey, a.survey); assert.equal(m.s.customLayers, a.layers);
      assert.equal(m.s.customLayers[0], g); assert.equal(m.s.customLayers[0].rows, gRows);
      assert.equal(m.s.assaysTable, a.assaysTable); assert.equal(m.s.surveyTable, a.surveyTable);
      const before = m.ref.renders;
      await step(() => m.s.setProjectName("renamed"));
      assert.ok(m.ref.renders > before, "an unrelated render happened");
      assert.equal(m.s.assays, a.assays, "assays, after a render"); assert.equal(m.s.survey, a.survey, "survey, after a render");
      assert.equal(m.s.customLayers, a.layers, "the layer list, after a render"); assert.equal(m.s.customLayers[0], g, "the layer view");
      assert.equal(m.s.customLayers[0].rows, gRows); assert.equal(m.s.assaysTable, a.assaysTable);
      assert.ok(Array.isArray(a.assays) && Array.isArray(a.survey) && Array.isArray(gRows), "readers get arrays");
      assert.equal(isTable(a.assaysTable), true); assert.equal(isTable(a.surveyTable), true);
    } finally { await m.unmount(); }
  });
}

test("ON: the open holds Tables and builds no rows until a reader asks; then the rows are the file's", { timeout: 60000 }, async () => {
  const live = project("T_");
  const m = await openWith(true, live);
  try {
    const at = m.s.assaysTable, st = m.s.surveyTable, gt = B.layerTableOf(m.s.customLayers[0]);
    assert.equal(isTable(at) && isTable(st) && isTable(gt), true);
    assert.equal(rowsBuilt(at), false, "assays: no rows yet"); assert.equal(rowsBuilt(st), false, "survey: no rows yet"); assert.equal(rowsBuilt(gt), false, "layer: no rows yet");
    assert.equal(m.s.customLayers[1].rows.length, 1, "a small layer stays rows");
    assert.deepEqual(m.s.assayElements.map((e) => e.symbol), ["Au", "Cu"], "present elements from the columns (Zn has no value)");
    assert.equal(rowsBuilt(at), false, "the present elements did not force rows");
    assert.deepEqual(asRows(m.s.assays), asRows(live.assays)); assert.equal(rowsBuilt(at), true);
    assert.deepEqual(asRows(m.s.survey), asRows(live.survey));
    assert.deepEqual(asRows(m.s.customLayers[0].rows), asRows(live.customLayers[0].rows));
    assert.equal(m.s.activeTabDirty, false, "clean after the open");
  } finally { await m.unmount(); }
});

test("the saved file is byte-identical ON and OFF: right after the open, and after edits through each setter form", { timeout: 120000 }, async () => {
  const edits = async (m) => {
    await act(async () => { await wait(UNDO_SETTLE); });
    await step(() => m.s.setAssays((p) => p.map((r, i) => (i === 5 ? { ...r, values: { ...r.values, Au: 9.5 } } : r))));
    await step(() => m.s.setSurvey((p) => p.slice(0, 2400)));
    // a descriptor copy of the view: the style edit keeps the layer's Table
    await step(() => m.s.setCustomLayers((p) => p.map((l) => (l.id === "g1" ? Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(l), unit: { value: "API", enumerable: true, writable: true, configurable: true } }) : l))));
    // a spread copy of the small one, and a new layer
    await step(() => m.s.setCustomLayers((p) => [...p.map((l) => (l.id === "s1" ? { ...l, name: "small2" } : l)), { id: "n1", name: "new", rows: [{ hole_id: "x", depth: 0, value: 1 }] }]));
  };
  const texts = {}, live = project("S_"); // one project for both runs (its layout page id is made per call)
  for (const on of [false, true]) {
    const m = await openWith(on, live);
    try {
      texts[`open${on}`] = await saveText(m);
      await edits(m);
      if (on) assert.equal(isTable(B.layerTableOf(m.s.customLayers.find((l) => l.id === "g1"))) && !rowsBuilt(B.layerTableOf(m.s.customLayers.find((l) => l.id === "g1"))), true, "the descriptor copy kept the Table, no rows built");
      assert.equal(m.s.customLayers.find((l) => l.id === "g1").unit, "API");
      assert.equal(m.s.assays[5].values.Au, 9.5); assert.equal(m.s.survey.length, 2400);
      texts[`edit${on}`] = await saveText(m);
    } finally { await m.unmount(); }
  }
  sameText(texts.opentrue, texts.openfalse, "right after the open");
  sameText(texts.edittrue, texts.editfalse, "after the edits");
  assert.notEqual(texts.editfalse, texts.openfalse);
});

test("ON: a spread copy of a big layer keeps correct rows (fail-safe: no Table, the same text saved)", { timeout: 60000 }, async () => {
  const live = project("P_");
  const m = await openWith(true, live);
  try {
    await saveText(m); // Save As renames the project after the file: the text to compare is the second save's
    const before = await saveText(m);
    await act(async () => { await wait(UNDO_SETTLE); });
    await step(() => m.s.setCustomLayers((p) => p.map((l) => (l.id === "g1" ? { ...l } : l))));
    const g = m.s.customLayers.find((l) => l.id === "g1");
    assert.ok(Array.isArray(Object.getOwnPropertyDescriptor(g, "rows").value), "plain rows now");
    assert.deepEqual(asRows(g.rows), asRows(live.customLayers[0].rows));
    sameText(await saveText(m), before, "after the spread");
  } finally { await m.unmount(); }
});

test("ON: undo of an assay edit gives back the held Table; a tab switch away and back keeps each tab's rows", { timeout: 90000 }, async () => {
  const A = project("UA_"), Bp = project("UB_");
  const m = await openWith(true, A);
  try {
    const t0 = m.s.assaysTable;
    await act(async () => { await wait(UNDO_SETTLE); });
    await step(() => m.s.setAssays((p) => p.slice(0, 100)));
    await act(async () => { await wait(UNDO_SETTLE); });
    assert.equal(m.s.assays.length, 100);
    await step(() => m.s.undo());
    assert.equal(m.s.assaysTable, t0, "the held Table is back");
    assert.deepEqual(asRows(m.s.assays), asRows(A.assays));
    const tabA = m.s.activeTabId;
    fileContent = { text: fileOf(Bp), path: "C:/tmp/b.geostrix.json" };
    await act(async () => { await m.s.openProject(); await wait(80); });
    const tabB = m.s.activeTabId;
    assert.notEqual(tabA, tabB);
    assert.deepEqual(asRows(m.s.assays), asRows(Bp.assays));
    m.s.switchToTab(tabA);
    for (let k = 0; k < 200 && m.s.activeTabId !== tabA; k++) await act(async () => { await wait(25); });
    assert.equal(m.s.activeTabId, tabA);
    assert.equal(isTable(m.s.assaysTable), true);
    assert.deepEqual(asRows(m.s.assays), asRows(A.assays));
    assert.deepEqual(asRows(m.s.customLayers[0].rows), asRows(A.customLayers[0].rows));
  } finally { await m.unmount(); }
});

test("lib: sliced decode / encode equal the plain ones; fields from a payload with Tables save the same text; the autosave's sliced parts too", async () => {
  // this case runs the source modules (not the store bundle): their own switches
  const setLib = (on) => { LIB_TABLE_FIELDS.clear(); if (on) for (const k of ["assays", "survey", "customLayers"]) LIB_TABLE_FIELDS.add(k); };
  setLib(true);
  try {
    const live = project("L_"), payload = JSON.parse(fileOf(live));
    const t = tableFromCompact(payload.assays);
    let pauses = 0;
    assert.deepEqual(await tableFromCompactSliced(payload.assays, () => { pauses++; return null; }), t);
    assert.ok(pauses > 3);
    assert.deepEqual(await compactFromTableSliced(tableFromCompact(payload.survey), () => Promise.resolve()), compactFromTable(tableFromCompact(payload.survey)));
    assert.deepEqual(compactFromTable(t), compactTable(live.assays));
    const expanded = await expandPayloadSliced(payload, () => null);
    assert.equal(isTableLib(expanded.assays) && isTableLib(expanded.survey) && isTableLib(expanded.customLayers[0].rows), true);
    const fields = fieldsFromPayload(expanded, "x");
    assert.equal(isTableLib(fields.assays), true, "fieldShapeOk keeps a Table");
    sameText(JSON.stringify(payloadFromFields(fields)), JSON.stringify(payloadFromFields(fieldsFromPayload(JSON.parse(fileOf(live)), "x"))), "fields with Tables");
    const fields2 = fieldsFromPayload(await expandPayloadSliced(JSON.parse(fileOf(live)), () => null), "x");
    sameText(joinParts(await projectPartsSliced(fields2, {}, () => Promise.resolve())), projectJson(fields), "sliced parts");
  } finally { setLib(false); }
  // switches off: rows, as before
  const rowsFields = fieldsFromPayload(await expandPayloadSliced(JSON.parse(fileOf(project("R_"))), () => null), "x");
  assert.ok(Array.isArray(rowsFields.assays) && Array.isArray(rowsFields.customLayers[0].rows));
});

test("tableFields: views, descriptor copies, spreads, layerTableOf, present elements", () => {
  const live = project("F_"), payload = JSON.parse(fileOf(live));
  const t = tableFromCompact(payload.customLayers[0].rows);
  const list = [{ id: "g1", name: "gamma", unit: "cps", rows: t }, { id: "s1", name: "small", rows: [{ a: 1 }] }];
  const pub = publishedLayers(list);
  assert.equal(publishedLayers(list), pub, "cached per list"); assert.equal(pub[1], list[1], "a rows layer as it is");
  const noTables = [{ id: "a", rows: [] }];
  assert.equal(publishedLayers(noTables), noTables);
  const v = pub[0];
  assert.deepEqual(Object.keys(v), Object.keys(list[0]), "the same keys, in order");
  assert.equal(layerTableOf(v), t);
  assert.equal(internalLayers(pub)[0], list[0], "a view goes back to its layer");
  const copy = Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(v), unit: { value: "API", enumerable: true, writable: true, configurable: true } });
  const back = internalLayers([copy])[0];
  assert.equal(back.rows, t); assert.equal(back.unit, "API"); assert.deepEqual(Object.keys(back), ["id", "name", "unit", "rows"]);
  const spread = { ...v };
  assert.ok(Array.isArray(spread.rows)); assert.equal(internalLayers([spread])[0], spread);
  const rowsList = [{ id: "x", rows: [] }];
  assert.equal(internalLayers(rowsList), rowsList, "nothing to change: the same list");
  const els = [{ symbol: "Au" }, { symbol: "Cu" }, { symbol: "Zn" }];
  const at = tableFromCompact(payload.assays);
  assert.deepEqual(elementsWithValuesOf(els, at), elementsWithValues(els, live.assays));
  assert.equal(elementsWithValuesOf(els.slice(0, 2), at).length, 2);
  const two = els.slice(0, 2);
  assert.equal(elementsWithValuesOf(two, at), two, "the same array when nothing is left out");
  assert.deepEqual(elementsWithValuesOf(els, live.assays), elementsWithValues(els, live.assays), "rows: as before");
});

test("wiring: the 9 store edits", () => {
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.match(s, /import \{ rowsOf, tableOf \} from "\.\/rowTable\.js"; import \{ publishedLayers, internalLayers, elementsWithValuesOf \} from "\.\/tableFields\.js"; \/\/ TASKS\.csv #3424/);
  assert.doesNotMatch(s, /import \{ elementsWithValues \}/);
  assert.match(s, /useMemo\(\(\) => elementsWithValuesOf\(assayElements, assays\), \[assayElements, assays\]\)/);
  assert.match(s, /const setAssaysRows = useCallback\(\(u\) => setAssays\(typeof u === "function" \? \(p\) => u\(rowsOf\(p\)\) : u\), \[\]\);/);
  assert.match(s, /const setSurveyRows = useCallback\(\(u\) => setSurvey\(typeof u === "function" \? \(p\) => u\(rowsOf\(p\)\) : u\), \[\]\);/);
  assert.match(s, /const setCustomLayersRows = useCallback\(\(u\) => setCustomLayers\(\(p\) => internalLayers\(typeof u === "function" \? u\(publishedLayers\(p\)\) : u\)\), \[\]\);/);
  assert.match(s, /surface \? l\.surfaceSamples : rowsOf\(l\.assays\) \/\* #3424 \*\//);
  assert.match(s, /survey: rowsOf\(live\.survey\) \/\* #3424 \*\//);
  assert.match(s, /applyCalcUndo\(snap\.assays, rowsOf\(live\.assays\) \/\* #3424 \*\/\)/);
  assert.match(s, /get survey\(\) \{ return rowsOf\(survey\); \}, get surveyTable\(\) \{ return tableOf\(survey\); \}, setSurvey: setSurveyRows, \/\/ TASKS\.csv #3424/);
  assert.match(s, /get assays\(\) \{ return rowsOf\(assays\); \}, get assaysTable\(\) \{ return tableOf\(assays\); \}, setAssays: setAssaysRows, \/\/ TASKS\.csv #3424/);
  assert.match(s, /get customLayers\(\) \{ return publishedLayers\(customLayers\); \}, setCustomLayers: setCustomLayersRows, \/\/ TASKS\.csv #3424/);
  assert.match(s, /survey: \[survey, setSurvey\]/, "fieldState keeps the raw pairs");
  assert.match(s, /assays: \[assays, setAssays\], assayElements: \[assayElements, setAssayElements\], customLayers: \[customLayers, setCustomLayers\]/);
  const pf = readFileSync(new URL("../src/lib/projectFields.js", import.meta.url), "utf8");
  assert.match(pf, /export const TABLE_FIELDS = new Set\(\);/, "every switch off by default");
});
