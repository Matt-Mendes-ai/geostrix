// TASKS.csv #470 — tests for the store (src/lib/store.jsx): save / load, New, undo across layout pages, and
// the unsaved ("dirty") flag. Every data-loss bug in the 2026-09-25 review lived in this file with no test:
// #462 (dirty missed models / rasters...), #463 (undo on the wrong layout page), #478 (a new project marked
// unsaved), #479 (switching tabs cleared a tab's unsaved state). The store is JSX, so it is bundled on the fly
// with esbuild (React kept external) and rendered with react-test-renderer: no browser, no Electron.
// window.desktop is a fake bridge, so Save and Open run through the real store code into memory.
import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let savedContent = null;
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window.confirm = () => true;
globalThis.window.desktop = {
  saveFile: async ({ content }) => { savedContent = content; return { ok: true, filePath: "C:/tmp/test.geostrix.json" }; },
  openFile: async () => ({ ok: true, content: savedContent, filePath: "C:/tmp/test.geostrix.json", name: "test.geostrix.json" }),
  autosaveWrite: async () => ({ ok: true }), autosaveRead: async () => ({ ok: false }), autosaveClear: async () => ({ ok: true }),
  autosaveQuarantine: async () => ({ ok: false }), setDirtyState: () => {},
};

const here = path.dirname(fileURLToPath(import.meta.url));
// inside node_modules/.cache so the bundle's bare "react" import resolves to the project's copy (never committed)
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-store-"));
const out = path.join(dir, "store.bundle.mjs");
writeFileSync(out, buildSync({
  entryPoints: [path.join(here, "..", "src", "lib", "store.jsx")],
  bundle: true, write: false, format: "esm", platform: "node", jsx: "transform",
  external: ["react", "react-dom"], loader: { ".js": "jsx" }, logLevel: "silent",
}).outputFiles[0].text);
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
const step = (fn) => act(async () => { fn(); await wait(20); });
const UNDO_SETTLE = 900; // > UNDO_DEBOUNCE_MS (#31)

test("#478 a freshly mounted / new project is clean; a real edit marks it unsaved", { timeout: 15000 }, async () => {
  const m = await mount();
  assert.equal(m.s.activeTabDirty, false, "at startup");
  await step(() => m.s.newProject());
  assert.equal(m.s.activeTabDirty, false, "after New");
  await step(() => m.s.setCollars([{ hole_id: "A", x: 1, y: 2, z: 3 }]));
  assert.equal(m.s.activeTabDirty, true, "after an edit");
  await m.unmount();
});

test("#462 fields outside undo (a block model) still mark the project unsaved", { timeout: 15000 }, async () => {
  const m = await mount();
  await step(() => m.s.newProject());
  assert.equal(m.s.activeTabDirty, false);
  await step(() => m.s.addVoxelModel({ name: "bm", cells: [{ x: 0, y: 0, z: 0, dx: 1, dy: 1, dz: 1, value: 1 }] }));
  assert.equal(m.s.activeTabDirty, true);
  await m.unmount();
});

test("#463 undo on layout page 2 restores page 2 and leaves page 1 alone", { timeout: 15000 }, async () => {
  const m = await mount();
  await step(() => m.s.newProject());
  const n0 = m.s.layoutElements.length;
  await step(() => m.s.setLayoutElements((els) => [...els, { id: "p1_text", type: "text" }]));
  await act(async () => { await wait(UNDO_SETTLE); });
  await step(() => m.s.addLayoutPage("Page 2"));
  await step(() => m.s.setLayoutElements((els) => [...els, { id: "p2_text", type: "text" }]));
  await act(async () => { await wait(UNDO_SETTLE); });
  assert.ok(m.s.layoutElements.some((e) => e.id === "p2_text"));
  await step(() => m.s.undo());
  const p1 = m.s.layoutPages[0].elements, p2 = m.s.layoutPages.find((p) => p.id === m.s.activeLayoutPageId).elements;
  assert.ok(!p2.some((e) => e.id === "p2_text"), "page 2's edit undone");
  assert.ok(p1.some((e) => e.id === "p1_text"), "page 1 untouched");
  assert.equal(p1.length, n0 + 1);
  await m.unmount();
});

test("#479 switching tabs keeps each tab's unsaved state", { timeout: 15000 }, async () => {
  const m = await mount();
  await step(() => m.s.setCollars([{ hole_id: "A", x: 1, y: 2, z: 3 }]));
  assert.equal(m.s.activeTabDirty, true);
  const first = m.s.activeTabId;
  await step(() => m.s.newWorkspaceTab());
  assert.equal(m.s.activeTabDirty, false, "the new tab is clean");
  await step(() => m.s.switchToTab(first));
  assert.equal(m.s.activeTabDirty, true, "back on the edited tab: still unsaved");
  assert.equal(m.s.collars.length, 1);
  await m.unmount();
});

test("save -> open round-trips the project and leaves it clean", { timeout: 15000 }, async () => {
  const m = await mount();
  await step(() => m.s.newProject());
  await step(() => {
    m.s.setCollars([{ hole_id: "DD-1", x: 463000.5, y: 6178000.25, z: 1100, azimuth: 190, dip: 70, length: 300 }]);
    m.s.setLayers((l) => ({ ...l, litho: [{ hole_id: "DD-1", from: 0, to: 10, value: "AND" }] }));
    m.s.addVoxelModel({ name: "bm", cells: [{ x: 1, y: 2, z: 3, dx: 5, dy: 5, dz: 5, value: 0.7 }] });
    m.s.setEpsg(32609);
  });
  let res;
  await act(async () => { res = await m.s.saveProject(); await wait(20); });
  assert.equal(res.ok, true);
  assert.equal(m.s.activeTabDirty, false, "clean after save");
  await step(() => m.s.newProject());
  assert.equal(m.s.collars.length, 0);
  await act(async () => { res = await m.s.openProject(); await wait(20); });
  assert.equal(res.ok, true);
  assert.equal(m.s.collars[0].x, 463000.5);
  assert.equal(m.s.layers.litho[0].value, "AND");
  assert.equal(m.s.voxelModels.length, 1);
  assert.equal(m.s.voxelModels[0].cells[0].value, 0.7);
  assert.equal(m.s.project.epsg, 32609);
  assert.equal(m.s.activeTabDirty, false, "an opened project is clean");
  await m.unmount();
});

test("#467 a failed save returns the reason instead of throwing", { timeout: 15000 }, async () => {
  const m = await mount();
  const orig = window.desktop.saveFile;
  window.desktop.saveFile = async () => { throw new Error("Error invoking remote method 'save-file': Error: EBUSY: resource busy or locked"); };
  let res;
  await act(async () => { res = await m.s.saveProject(); await wait(20); });
  window.desktop.saveFile = orig;
  assert.equal(res.ok, false);
  assert.equal(res.error, "EBUSY: resource busy or locked");
  await m.unmount();
});
