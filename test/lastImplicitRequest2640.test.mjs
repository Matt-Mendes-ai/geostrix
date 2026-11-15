// TASKS.csv #2640 (side 2's Stage 1) — the last GemPy request as sent, kept in the store for the session (store.lastImplicitRequest): the
// record (lib/gempyInputs.js implicitRequestRecord), the store field (session only: not saved, not undone, null once another project shows),
// and the wiring (modellingRuns before the GemPy call, not for the layer-cake; useModelling hands the setter to the run).
import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { implicitRequestRecord } from "../src/lib/gempyInputs.js";
import { payloadFromFields, emptyFields } from "../src/lib/projectFields.js";

const origin = { x: 500000, y: 6200000, z: 1000 };
const specs = [
  { label: "Top of BAS", meshName: "top_bas", points: [{ x: 1, y: 2, z: -3, hole_id: "DH1" }, { x: 10.0004, y: 20, z: -30, hole_id: "DH2", nugget: 0.01 }, { x: 5, y: 5, z: 5 }], orientations: [{ x: 1, y: 1, z: -1, dip: 30.123, azimuth: 270.456, hole_id: "DH1" }] },
  { label: "Main fault", meshName: "f1", fault: true, points: [{ x: 0, y: 0, z: 0, hole_id: "DH3" }], orientations: [] },
];
const sent = [{ points: [{ nugget: 0.5 }, {}, {}] }, { points: [{}] }];

test("the record: project coordinates, hole ids, nuggets as sent, orientations, extent / resolution as sent, the trend flag", () => {
  const r = implicitRequestRecord({ tool: "Stack model", extent: [0, 100, 0, 200, -50, 10], resolution: [40, 50, 20], trendFrame: true, origin, specs, sent });
  assert.match(r.at, /^\d{4}-\d\d-\d\dT/);
  assert.equal(r.tool, "Stack model"); assert.equal(r.trendFrame, true);
  assert.deepEqual(r.origin, origin); assert.deepEqual(r.extent, [0, 100, 0, 200, -50, 10]); assert.deepEqual(r.resolution, [40, 50, 20]);
  assert.equal(r.surfaces.length, 2);
  const s = r.surfaces[0];
  assert.equal(s.name, "Top of BAS"); assert.equal(s.fault, false);
  assert.deepEqual(s.points[0], { x: 500001, y: 6200002, z: 997, hole_id: "DH1", nugget: 0.5 }, "the nugget as sent");
  assert.deepEqual(s.points[1], { x: 500010, y: 6200020, z: 970, hole_id: "DH2", nugget: 0.01 }, "rounded to the mm; its own nugget");
  assert.deepEqual(s.points[2], { x: 500005, y: 6200005, z: 1005, hole_id: null, nugget: null }, "a point from a map or a section: no hole");
  assert.deepEqual(s.orientations[0], { x: 500001, y: 6200001, z: 999, hole_id: "DH1", dip: 30.12, azimuth: 270.46 });
  assert.equal(r.surfaces[1].fault, true); assert.equal(r.surfaces[1].points[0].hole_id, "DH3");
  const plain = implicitRequestRecord({ tool: "x", extent: [0, 1, 0, 1, 0, 1], resolution: [2, 2, 2], trendFrame: false, origin, specs, sent: null });
  assert.equal(plain.trendFrame, false); assert.equal(plain.surfaces[0].points[0].nugget, null);
  assert.ok(JSON.stringify(r).length > 0, "plain data");
});

// the store, bundled with esbuild, rendered with react-test-renderer and a fake desktop bridge
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let fileContent = null, saved = null;
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window.confirm = () => true;
globalThis.window.desktop = {
  saveFile: async ({ content }) => { saved = content; return { ok: true, filePath: "C:/tmp/s.geostrix.json" }; },
  openFile: async () => ({ ok: true, content: fileContent.text, filePath: fileContent.path, name: path.basename(fileContent.path) }),
  autosaveWrite: async () => ({ ok: true }), autosaveRead: async () => ({ ok: false }), autosaveClear: async () => ({ ok: true }), autosaveQuarantine: async () => ({ ok: false }), setDirtyState: () => {},
};
const here = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-req2640-"));
const out = path.join(dir, "store.bundle.mjs");
writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", "src", "lib", "store.jsx")], bundle: true, write: false, format: "esm", platform: "node", jsx: "transform",
  external: ["react", "react-dom"], loader: { ".js": "jsx" }, logLevel: "silent" }).outputFiles[0].text);
const { StoreProvider, useStore } = await import(pathToFileURL(out).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("the store: kept for the session, the same object every read, not saved, not undone, null once another project shows", { timeout: 30000 }, async () => {
  const ref = { s: null };
  function Probe() { ref.s = useStore(); return null; }
  let r;
  await act(async () => { r = TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Probe))); });
  try {
    await act(async () => { await wait(20); });
    assert.equal(ref.s.lastImplicitRequest, null);
    const rec = implicitRequestRecord({ tool: "Implicit", extent: [0, 1, 0, 1, 0, 1], resolution: [2, 2, 2], trendFrame: false, origin, specs, sent });
    await act(async () => { ref.s.setCollars([{ hole_id: "DH1", x: 0, y: 0, z: 0 }]); await wait(950); }); // something to save
    const undoBefore = ref.s.canUndo;
    await act(async () => { ref.s.setLastImplicitRequest(rec); await wait(950); });
    const got = ref.s.lastImplicitRequest;
    assert.deepEqual({ ...got, projectToken: undefined }, { ...rec, projectToken: undefined });
    assert.ok(got.projectToken, "tagged with its project");
    assert.equal(ref.s.lastImplicitRequest, got, "the same object every read");
    assert.equal(ref.s.canUndo, undoBefore, "not an undo step");
    await act(async () => { await ref.s.saveProject({ saveAs: true }); await wait(50); });
    assert.equal(typeof saved, "string");
    assert.doesNotMatch(saved, /lastImplicitRequest|Top of BAS/, "not in the project file");
    fileContent = { text: JSON.stringify(payloadFromFields({ ...emptyFields(), collars: [{ hole_id: "B1", x: 1, y: 1, z: 1 }] })), path: "C:/tmp/other.geostrix.json" };
    await act(async () => { await ref.s.openProject(); await wait(80); });
    assert.equal(ref.s.lastImplicitRequest, null, "another project: null");
  } finally { await act(async () => { r.unmount(); }); }
});

test("wiring: the run records the GemPy request before the call (not the layer-cake); useModelling hands the setter over; the store lines", () => {
  const runs = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8").replace(/\r\n/g, "\n"); // CRLF checkout
  assert.match(runs, /if \(!cakeRun\) setLastImplicitRequest\?\.\(implicitRequestRecord\(\{ tool: label, extent, resolution, trendFrame: anisotropy\.enabled, origin: originRef\.current, specs, sent: sidecarSpecs \}\)\);\n\s*const res = cakeRun \?/);
  assert.match(readFileSync(new URL("../src/modules/viewer/useModelling.js", import.meta.url), "utf8"), /setLastImplicitRequest: store\.setLastImplicitRequest \/\* #2640 \*\//);
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /const \[lastImplicitRequest, setLastImplicitRequestRaw\] = useState\(null\);/);
  assert.match(s, /setLastImplicitRequestRaw\(r \? \{ \.\.\.r, projectToken: getProjectToken\(\) \} : null\), \[\]\);/);
  assert.match(s, /lastImplicitRequest: lastImplicitRequest && isSameProject\(lastImplicitRequest\.projectToken\) \? lastImplicitRequest : null, setLastImplicitRequest, \/\/ TASKS\.csv #2640/);
  const pf = readFileSync(new URL("../src/lib/projectFields.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.doesNotMatch(pf, /lastImplicitRequest/, "not a project field");
});
