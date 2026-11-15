// TASKS.csv #3423 (#2206 Phase 1) — through the real store (bundled with esbuild, rendered with react-test-renderer, a fake desktop bridge):
// Open and the autosave recovery expand the column tables a slice at a time. Files of version 30 (the survey as columns), version 29
// (survey rows) and before #555 (every table as rows) open with the same rows, clean, with undo working; tabs keep their rows.
import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { payloadFromFields, emptyFields } from "../src/lib/projectFields.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let fileContent = null, autosaveContent = null;
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window.confirm = () => true;
globalThis.window.desktop = {
  saveFile: async ({ content }) => { fileContent = content; return { ok: true, filePath: "C:/tmp/x.geostrix.json" }; },
  openFile: async () => ({ ok: true, content: fileContent.text, filePath: fileContent.path, name: path.basename(fileContent.path) }),
  autosaveWrite: async () => ({ ok: true }), autosaveRead: async () => (autosaveContent ? { ok: true, content: autosaveContent } : { ok: false }), autosaveClear: async () => ({ ok: true }),
  autosaveQuarantine: async () => ({ ok: false }), setDirtyState: () => {},
};
const here = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-open3423-"));
const out = path.join(dir, "store.bundle.mjs");
writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", "src", "lib", "store.jsx")], bundle: true, write: false, format: "esm", platform: "node", jsx: "transform",
  external: ["react", "react-dom"], loader: { ".js": "jsx" }, logLevel: "silent" }).outputFiles[0].text);
const { StoreProvider, useStore } = await import(pathToFileURL(out).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function mount() {
  const ref = { s: null };
  function Probe() { ref.s = useStore(); return null; }
  let r;
  await act(async () => { r = TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Probe))); });
  await act(async () => { await wait(20); });
  return { get s() { return ref.s; }, unmount: () => act(() => r.unmount()) };
}
const step = (fn, ms = 20) => act(async () => { fn(); await wait(ms); });
const UNDO_SETTLE = 900;

// a project big enough for every column encoder: 2,400 assays, 2,500 survey stations, a 2,600-row litho layer, a 3,000-row custom layer
function project(tag) {
  const H = 97;
  return { ...emptyFields(),
    project: { ...emptyFields().project, name: tag },
    collars: Array.from({ length: H }, (_, h) => ({ hole_id: `${tag}${h}`, x: 500000 + h * 50, y: 6200000, z: 1000, azimuth: 0, dip: -60, length: 120 })),
    survey: Array.from({ length: 2500 }, (_, i) => ({ hole_id: `${tag}${i % H}`, depth: Math.floor(i / H) * 5, azimuth: (i * 7) % 360, dip: -60 - (i % 20) })),
    assays: Array.from({ length: 2400 }, (_, i) => ({ hole_id: `${tag}${i % H}`, from: i * 0.1, to: i * 0.1 + 0.1, values: { Au: (i % 31) / 10, Cu: i % 7 ? (i % 13) / 100 : null }, sample_id: `S${i}` })),
    layers: { ...emptyFields().layers, litho: Array.from({ length: 2600 }, (_, i) => ({ hole_id: `${tag}${i % H}`, from: i, to: i + 1, value: ["AND", "BAS", "TUF"][i % 3] })) },
    customLayers: [{ id: "g1", name: "gamma", rows: Array.from({ length: 3000 }, (_, i) => ({ hole_id: `${tag}${i % H}`, depth: i * 0.1, value: i % 300 })) }],
  };
}
const asRows = (o) => JSON.parse(JSON.stringify(o)); // what the store holds: plain rows
const fileOf = (live, version) => {
  const p = JSON.parse(JSON.stringify(payloadFromFields(live)));
  if (version === 29) { p.version = 29; p.survey = asRows(live.survey); }
  if (version === 9) { p.version = 9; p.survey = asRows(live.survey); p.assays = asRows(live.assays); p.layers = asRows(live.layers); p.customLayers = asRows(live.customLayers); delete p.surfaceSamples; }
  return JSON.stringify(p);
};
function sameTables(s, live) {
  assert.deepEqual(asRows(s.survey), asRows(live.survey), "survey");
  assert.deepEqual(asRows(s.assays).map((r) => ({ ...r })), asRows(live.assays).map((r) => ({ ...r })), "assays");
  assert.deepEqual(asRows(s.layers.litho), asRows(live.layers.litho), "litho");
  assert.deepEqual(asRows(s.customLayers[0].rows), asRows(live.customLayers[0].rows), "custom layer rows");
  assert.equal(s.collars.length, live.collars.length);
}

for (const version of [30, 29, 9]) {
  test(`a version-${version} file opens with the same rows, clean, and undo works on it`, { timeout: 30000 }, async () => {
    const m = await mount();
    const live = project(`V${version}_`);
    const text = fileOf(live, version);
    if (version === 30) assert.ok(JSON.parse(text).survey.__compactTable && JSON.parse(text).assays.__compactTable);
    if (version === 9) assert.ok(Array.isArray(JSON.parse(text).assays) && Array.isArray(JSON.parse(text).survey));
    fileContent = { text, path: `C:/tmp/v${version}.geostrix.json` };
    let res;
    await act(async () => { res = await m.s.openProject(); await wait(50); });
    assert.equal(res.ok, true);
    sameTables(m.s, live);
    assert.equal(m.s.activeTabDirty, false, "clean after the open");
    assert.equal(m.s.canUndo, false, "no undo step from the open itself");
    await act(async () => { await wait(UNDO_SETTLE); });
    await step(() => m.s.setCollars((c) => c.slice(0, 10)));
    await act(async () => { await wait(UNDO_SETTLE); });
    assert.equal(m.s.collars.length, 10);
    await step(() => m.s.undo());
    assert.equal(m.s.collars.length, live.collars.length, "undo restores the opened collars");
    sameTables(m.s, live);
    await m.unmount();
  });
}

test("tabs: a big project opened beside another, and a switch back (synchronous, #3492 is its slicing) gives each tab's rows", { timeout: 40000 }, async () => {
  const m = await mount();
  const A = project("A_"), B = project("B_");
  fileContent = { text: fileOf(A, 30), path: "C:/tmp/a.geostrix.json" };
  await act(async () => { await m.s.openProject(); await wait(50); });
  const tabA = m.s.activeTabId;
  fileContent = { text: fileOf(B, 30), path: "C:/tmp/b.geostrix.json" };
  await act(async () => { await m.s.openProject(); await wait(50); });
  const tabB = m.s.activeTabId;
  assert.notEqual(tabA, tabB);
  sameTables(m.s, B);
  await step(() => m.s.switchToTab(tabA), 50);
  assert.equal(m.s.activeTabId, tabA);
  sameTables(m.s, A);
  await step(() => m.s.switchToTab(tabB), 50);
  sameTables(m.s, B);
  await m.unmount();
});

test("the crash-recovery file is expanded at the check, so the synchronous restore finds rows", { timeout: 30000 }, async () => {
  const m = await mount();
  const R = project("R_");
  autosaveContent = fileOf(R, 30);
  let rec;
  await act(async () => { rec = await m.s.checkAutosave(); await wait(50); });
  assert.ok(rec?.data, "a recovery offered");
  assert.ok(Array.isArray(rec.data.assays) && Array.isArray(rec.data.survey) && Array.isArray(rec.data.layers.litho), "rows already");
  await act(async () => { m.s.restoreAutosave(rec.data); await wait(50); });
  sameTables(m.s, R);
  autosaveContent = null;
  await m.unmount();
});
