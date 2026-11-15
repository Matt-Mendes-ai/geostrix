// TASKS.csv #3638 (Fireweed rehearsal #3619) — through the real store (esbuild bundle, react-test-renderer, a fake desktop bridge): work restored from the crash-recovery copy is tied to the file it was
// working on; its first Save asks (Save over it / Save as a new file / Cancel); Cancel leaves it recovered and writes nothing; Save over writes the original path and clears `recovered`; a new file goes to the
// Save As dialog. A crash-recovery copy written by the autosave carries the active tab's file.
import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { payloadFromFields, emptyFields } from "../src/lib/projectFields.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let autosaveContent = null; const writes = [];
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window.confirm = () => true;
globalThis.window.desktop = {
  saveFile: async () => { writes.push({ via: "saveFile" }); return { ok: true, filePath: "C:/proj/new_copy.geostrix.json" }; },
  saveFileTo: async ({ filePath }) => { writes.push({ via: "saveFileTo", filePath }); return { ok: true, filePath }; },
  autosaveWrite: async () => ({ ok: true }), autosaveRead: async () => (autosaveContent ? { ok: true, content: autosaveContent } : { ok: false }), autosaveClear: async () => ({ ok: true }),
  autosaveQuarantine: async () => ({ ok: false }), setDirtyState: () => {},
};
const here = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-rec3638-"));
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
const recoveredFile = () => JSON.stringify({ ...JSON.parse(JSON.stringify(payloadFromFields({ ...emptyFields(), project: { ...emptyFields().project, name: "Fireweed" }, collars: [{ hole_id: "H1", x: 1, y: 2, z: 3, azimuth: 0, dip: 60, length: 50 }] }))), activeFilePath: "C:/proj/fireweed.geostrix.json", autosavedAt: Date.now() });
const activeTab = (s) => s.workspaceTabs.find((t) => t.id === s.activeTabId);

test("recover -> Save asks; Cancel leaves it recovered and writes nothing; Save over writes the original and clears recovered; a new file goes to Save As", { timeout: 30000 }, async () => {
  const m = await mount();
  try {
    autosaveContent = recoveredFile();
    let rec; await act(async () => { rec = await m.s.checkAutosave(); await wait(50); });
    assert.equal(rec.data.activeFilePath, "C:/proj/fireweed.geostrix.json");
    await act(async () => { m.s.restoreAutosave(rec.data); await wait(50); });
    assert.equal(activeTab(m.s).filePath, "C:/proj/fireweed.geostrix.json"); assert.equal(activeTab(m.s).recovered, true);
    assert.equal(m.s.saveChoice, null);

    // Cancel
    let p; await act(async () => { p = m.s.saveProject(); await wait(30); });
    assert.deepEqual(m.s.saveChoice, { file: "fireweed.geostrix.json" });
    let r; await act(async () => { m.s.answerSaveChoice("cancel"); r = await p; });
    assert.deepEqual([r.ok, r.cancelled], [false, true]); assert.equal(writes.length, 0); assert.equal(activeTab(m.s).recovered, true); assert.equal(m.s.saveChoice, null);

    // a new file: the Save As dialog, the tab is no longer 'recovered' once it is saved
    await act(async () => { p = m.s.saveProject(); await wait(30); });
    await act(async () => { m.s.answerSaveChoice("new"); r = await p; await wait(30); });
    assert.deepEqual(writes.map((w) => w.via), ["saveFile"]); assert.equal(r.ok, true); assert.equal(activeTab(m.s).recovered, false); assert.equal(activeTab(m.s).filePath, "C:/proj/new_copy.geostrix.json");
    writes.length = 0;

    // Save over it (a second recovered project)
    autosaveContent = recoveredFile();
    const m2 = await mount();
    try {
      let rec2; await act(async () => { rec2 = await m2.s.checkAutosave(); await wait(50); });
      await act(async () => { m2.s.restoreAutosave(rec2.data); await wait(50); });
      let p2, r2; await act(async () => { p2 = m2.s.saveProject(); await wait(30); });
      await act(async () => { m2.s.answerSaveChoice("over"); r2 = await p2; await wait(30); });
      assert.deepEqual(writes, [{ via: "saveFileTo", filePath: "C:/proj/fireweed.geostrix.json" }]); assert.equal(r2.ok, true);
      assert.equal(activeTab(m2.s).recovered, false);
      // the next Save no longer asks
      await act(async () => { r2 = await m2.s.saveProject(); await wait(10); });
      assert.equal(m2.s.saveChoice, null); assert.equal(r2.ok, true);
    } finally { await m2.unmount(); }
  } finally { autosaveContent = null; await m.unmount(); }
});

test("the autosave writes the active tab's file, and the app draws the question", () => {
  const s = readFileSync(path.join(here, "..", "src", "lib", "store.jsx"), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /\["activeFilePath", JSON\.stringify\(activeFile\)\]/);
  assert.match(s, /"filePath":\$\{JSON\.stringify\(t\.filePath \|\| null\)\}/);
  const a = readFileSync(path.join(here, "..", "src", "App.jsx"), "utf8").replace(/\r\n/g, "\n");
  assert.match(a, /\{saveChoice && <SaveRecoveredModal file=\{saveChoice\.file\} onAnswer=\{answerSaveChoice\} \/>\}/);
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(readFileSync(path.join(here, "..", "src", "locales", `${l}.json`), "utf8")); for (const k of ["Save recovered work", "Save as a new file…", "Save over it"]) assert.ok(d[k], `${l}: ${k}`); }
});
