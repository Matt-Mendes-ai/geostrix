// TASKS.csv #3493 (side 5's #3423 follow-up) — a whole-project reprojection set its result through loadProjectPayload(payloadFromFields(...)):
// every table written to columns and read back (1.5 M log readings encoded and decoded per move). It now gives the moved fields to the load
// directly (applyLoadedFields). Through the real store: the same values as the round trip gave, unsaved, no undo step, untouched tables kept.
import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { payloadFromFields, fieldsFromPayload } from "../src/lib/projectFields.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window.confirm = () => true;
globalThis.window.desktop = { autosaveWrite: async () => ({ ok: true }), autosaveRead: async () => ({ ok: false }), autosaveClear: async () => ({ ok: true }), autosaveQuarantine: async () => ({ ok: false }), setDirtyState: () => {} };
const here = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-rep3493-"));
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
const step = (fn, ms = 30) => act(async () => { fn(); await wait(ms); });

test("a whole-project reprojection: the same values as the column round trip, unsaved, no undo step, untouched tables kept as they are", { timeout: 60000 }, async () => {
  const m = await mount();
  const H = 60;
  const collars = Array.from({ length: H }, (_, h) => ({ hole_id: `H${h}`, x: 500000 + h * 25, y: 7500000 + (h % 7) * 30, z: 600, azimuth: 45, dip: -60, length: 120 }));
  const survey = Array.from({ length: 2400 }, (_, i) => ({ hole_id: `H${i % H}`, depth: Math.floor(i / H) * 3, azimuth: (i * 7) % 360, dip: -60 }));
  const assays = Array.from({ length: 2400 }, (_, i) => ({ hole_id: `H${i % H}`, from: i * 0.05, to: i * 0.05 + 0.05, values: { Au: (i % 31) / 10 } }));
  const magsusc = Array.from({ length: 3000 }, (_, i) => ({ hole_id: `H${i % H}`, depth: i * 0.1, value: (i % 50) / 1000 }));
  await step(() => { m.s.setEpsg(28350); m.s.setCollars(collars); m.s.setSurvey(survey); m.s.setAssays(assays); m.s.setLayers((l) => ({ ...l, magsusc })); }, 200);
  const before = { assays: m.s.assays, magsusc: m.s.layers.magsusc };
  let report;
  await act(async () => { report = await m.s.reprojectProjectTo(28351, { rotateAzimuths: true }); await wait(200); });
  assert.ok(report?.counts, "a report");
  assert.equal(m.s.project.epsg, 28351);
  assert.notEqual(m.s.collars[0].x, collars[0].x, "the collars moved");
  assert.equal(m.s.activeTabDirty, true, "unsaved after the move");
  assert.equal(m.s.canUndo, false, "no undo step (it would put old-CRS coordinates under the new label)");
  assert.equal(m.s.assays, before.assays, "a table with no coordinates is kept, not copied");
  assert.equal(m.s.layers.magsusc, before.magsusc, "the same for a log layer");
  // what the round trip gave from the same values
  const live = { ...m.s }, roundTrip = fieldsFromPayload(JSON.parse(JSON.stringify(payloadFromFields(live))), live.project?.name);
  for (const k of ["collars", "survey", "assays"]) assert.deepEqual(JSON.parse(JSON.stringify(m.s[k])), JSON.parse(JSON.stringify(roundTrip[k])), k);
  assert.deepEqual(JSON.parse(JSON.stringify(m.s.layers.magsusc)), JSON.parse(JSON.stringify(roundTrip.layers.magsusc)), "magsusc");
  await m.unmount();
});

test("wiring: both reprojection paths load the moved fields directly; loadProjectPayload builds the values from a payload, then the same load", () => {
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /applyLoadedFields\(\{ \.\.\.liveRef\.current, \.\.\.fields \}\); \/\/ TASKS\.csv #3493/);
  assert.match(s, /applyLoadedFields\(\{ \.\.\.liveRef\.current, \.\.\.changed \}\); \/\/ TASKS\.csv #3493/);
  assert.doesNotMatch(s, /loadProjectPayload\(payloadFromFields\(/);
  assert.match(s, /const vals = fieldsFromPayload\(data, fallbackName, dropped\);[\s\S]{0,400}applyLoadedFields\(vals\);/);
});
