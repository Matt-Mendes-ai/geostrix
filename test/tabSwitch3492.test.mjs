// TASKS.csv #3492 (side 5, from #3423) — a tab switch to a tab with column tables expands them a slice at a time before switching, and the switch is
// dropped if another one (or a click back on the active tab) came first. Through the real store (esbuild bundle, react-test-renderer, a fake bridge).
import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { payloadFromFields, emptyFields, payloadHasTables } from "../src/lib/projectFields.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let fileContent = null;
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window.confirm = () => true;
globalThis.window.desktop = {
  saveFile: async () => ({ ok: true, filePath: "C:/tmp/x.geostrix.json" }),
  openFile: async () => ({ ok: true, content: fileContent.text, filePath: fileContent.path, name: path.basename(fileContent.path) }),
  autosaveWrite: async () => ({ ok: true }), autosaveRead: async () => ({ ok: false }), autosaveClear: async () => ({ ok: true }), autosaveQuarantine: async () => ({ ok: false }), setDirtyState: () => {},
};
const here = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-tab3492-"));
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
function project(tag, big = true) {
  const H = 97, n = big ? 2400 : 40;
  return { ...emptyFields(), project: { ...emptyFields().project, name: tag },
    collars: Array.from({ length: H }, (_, h) => ({ hole_id: `${tag}${h}`, x: 500000 + h * 50, y: 6200000, z: 1000, azimuth: 0, dip: -60, length: 120 })),
    survey: Array.from({ length: n }, (_, i) => ({ hole_id: `${tag}${i % H}`, depth: Math.floor(i / H) * 5, azimuth: (i * 7) % 360, dip: -60 })),
    assays: Array.from({ length: n }, (_, i) => ({ hole_id: `${tag}${i % H}`, from: i * 0.1, to: i * 0.1 + 0.1, values: { Au: (i % 31) / 10 }, sample_id: `S${i}` })) };
}
const fileOf = (live) => JSON.stringify(payloadFromFields(live));
const rows = (x) => JSON.parse(JSON.stringify(x));
async function openProject(m, live, name) {
  fileContent = { text: fileOf(live), path: `C:/tmp/${name}.geostrix.json` };
  await act(async () => { await m.s.openProject(); await wait(80); });
  return m.s.activeTabId;
}

test("payloadHasTables: a compact payload yes, plain rows no", () => {
  assert.equal(payloadHasTables(JSON.parse(fileOf(project("A_")))), true);
  assert.equal(payloadHasTables(JSON.parse(fileOf(project("A_", false)))), false);
  assert.equal(payloadHasTables(null), false);
});

test("a switch to a big tab gives its rows (after the slices), keeps each tab's own, and leaves the stashed payload compact", { timeout: 60000 }, async () => {
  const m = await mount();
  const A = project("A_"), B = project("B_");
  const tabA = await openProject(m, A, "a"), tabB = await openProject(m, B, "b");
  assert.deepEqual(rows(m.s.assays), rows(B.assays));
  const stashA = m.s.workspaceTabs.find((t) => t.id === tabA).payload;
  assert.ok(payloadHasTables(stashA), "tab A's payload is stashed compact");
  await act(async () => { m.s.switchToTab(tabA); await wait(400); });
  assert.equal(m.s.activeTabId, tabA);
  assert.deepEqual(rows(m.s.assays), rows(A.assays));
  assert.deepEqual(rows(m.s.survey), rows(A.survey));
  assert.equal(m.s.workspaceTabs.find((t) => t.id === tabB).payload && payloadHasTables(m.s.workspaceTabs.find((t) => t.id === tabB).payload), true, "B is stashed compact now");
  await act(async () => { m.s.switchToTab(tabB); await wait(400); });
  assert.deepEqual(rows(m.s.assays), rows(B.assays));
  await m.unmount();
});

test("a click on another tab and at once back on the active tab: the first switch is dropped", { timeout: 60000 }, async () => {
  const m = await mount();
  const A = project("A_"), B = project("B_");
  const tabA = await openProject(m, A, "a"); await openProject(m, B, "b");
  await act(async () => { m.s.switchToTab(tabA); await wait(400); });
  const tabB = m.s.workspaceTabs.find((t) => t.id !== tabA).id;
  await act(async () => { m.s.switchToTab(tabB); m.s.switchToTab(tabA); await wait(500); });
  assert.equal(m.s.activeTabId, tabA, "still on A");
  assert.deepEqual(rows(m.s.assays), rows(A.assays));
  await m.unmount();
});

test("two clicks in a row on different tabs: only the last one switches", { timeout: 60000 }, async () => {
  const m = await mount();
  const tabA = await openProject(m, project("A_"), "a"), tabB = await openProject(m, project("B_"), "b"), tabC = await openProject(m, project("C_"), "c");
  assert.equal(m.s.activeTabId, tabC);
  await act(async () => { m.s.switchToTab(tabA); m.s.switchToTab(tabB); await wait(600); });
  assert.equal(m.s.activeTabId, tabB, "the later click wins");
  assert.deepEqual(rows(m.s.assays), rows(project("B_").assays));
  await m.unmount();
});

test("a small project's tab switches at once, as before (no waiting)", { timeout: 30000 }, async () => {
  const m = await mount();
  const tabA = await openProject(m, project("S_", false), "s1"); await openProject(m, project("T_", false), "s2");
  await act(async () => { m.s.switchToTab(tabA); });
  assert.equal(m.s.activeTabId, tabA, "switched within the same act, before any timer");
  await m.unmount();
});

test("wiring: switchToTab bumps the sequence first, expands before switching, and switchNow checks the stashed payload is the one expanded", () => {
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /const seq = \+\+switchSeqRef\.current; \/\/ first: a click back on the active tab also cancels a switch still expanding\n    if \(tabId === activeTabId\) return;/);
  assert.match(s, /expandPayloadSliced\(stashed\)\.then\(\(expanded\) => \{ if \(seq === switchSeqRef\.current && activeTabIdRef\.current === from\) switchNow\(tabId, stashed, expanded\); \}\);/);
  assert.match(s, /loadProjectPayload\(expanded && target\.payload === stashed \? expanded : target\.payload, target\.name\);/);
});
