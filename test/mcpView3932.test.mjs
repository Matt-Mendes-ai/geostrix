// TASKS.csv #3932 (Matt's decision, 2026-11-21) — the view tools (colour_holes, show_layers, set_view) carried out in StrixViewer by modules/viewer/useMcpViewActions.js
// with its own setters and camera, each with a revert that puts back exactly what it changed (the toast's Undo). Stand-in setters and camera; made-up holes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { viewAction } from "../src/modules/viewer/mcpViewAction.js";
import { runChange } from "../src/lib/mcpActions.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const vec = (x, y, z) => ({ x, y, z, clone() { return vec(this.x, this.y, this.z); }, copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; } });

function viewer() {
  const v = {
    collars: [{ hole_id: "DH-23-001", attrs: { Type: "DD", Year: 2023 } }, { hole_id: "DH-23-002", attrs: { Type: "RC" } }],
    layers: { litho: [{ hole_id: "DH-23-001", from: 0, to: 2, value: "AND" }], alt: [], vein: [{ hole_id: "DH-23-001", from: 1, to: 2, value: "Q" }] },
    assayElements: [{ symbol: "Au", unit: "ppm" }, { symbol: "Cu", unit: "ppm" }],
    terrain: { id: "t1", visible: true }, sections: [{ id: "s1", name: "A-A" }],
    holeColourBy: "", layerVisible: { litho: true, vein: false }, assayVisible: false, assayDisplayElements: ["Cu"],
    camState: { current: { theta: 0.7, phi: 1.0, radius: 500, target: vec(1, 2, 3) } }, updates: 0, calls: [],
  };
  const upd = (k) => (fn) => { v[k] = typeof fn === "function" ? fn(v[k]) : fn; };
  Object.assign(v, {
    setHoleColourBy: upd("holeColourBy"), setLayerVisible: upd("layerVisible"), setAssayVisible: upd("assayVisible"), setAssayDisplayElements: upd("assayDisplayElements"),
    toggleAssayElement: (s) => { v.calls.push(["toggleAssayElement", s]); v.assayDisplayElements = v.assayDisplayElements.includes(s) ? v.assayDisplayElements.filter((x) => x !== s) : [...v.assayDisplayElements, s]; },
    updateTerrain: (p) => { v.terrain = { ...v.terrain, ...p }; },
    cameraRef: { current: { __update: () => { v.updates++; } } },
    fitButton: () => { v.calls.push(["fitButton"]); v.camState.current.radius = 900; },
    zoomToHole: (id) => { v.calls.push(["zoomToHole", id]); v.camState.current.target.copy(vec(9, 9, 9)); },
    reopenSection: (s) => v.calls.push(["reopenSection", s.id]),
  });
  return v;
}

test("#3932 colour_holes: by a collar field (matched without case), by an element (its grades alone, seeded as its own tick), by a logged layer, one colour; each put back exactly", () => {
  const v = viewer();
  const f = viewAction(v, { op: "colour", by: "field", name: "type" });
  assert.deepEqual([f.ok, f.name, v.holeColourBy], [true, "Type", "Type"]);
  f.revert(); assert.equal(v.holeColourBy, "");
  const e = viewAction(v, { op: "colour", by: "element", name: "au" });
  assert.deepEqual([e.ok, e.name, v.assayVisible, v.assayDisplayElements], [true, "Au", true, ["Au"]], "that element alone, the display on");
  assert.deepEqual(v.calls, [["toggleAssayElement", "Au"]]);
  e.revert(); assert.deepEqual([v.assayVisible, v.assayDisplayElements], [false, ["Cu"]]);
  const l = viewAction(v, { op: "colour", by: "layer", name: "VEIN" });
  assert.deepEqual([l.ok, l.name, v.layerVisible.vein], [true, "vein", true]);
  l.revert(); assert.equal(v.layerVisible.vein, false);
  v.holeColourBy = "Year"; const n = viewAction(v, { op: "colour", by: "none" }); assert.equal(v.holeColourBy, ""); n.revert(); assert.equal(v.holeColourBy, "Year");
  assert.match(viewAction(v, { op: "colour", by: "field", name: "Depth" }).error, /^No collar field 'Depth'\. The fields: Type, Year\.$/);
  assert.match(viewAction(v, { op: "colour", by: "element", name: "Zn" }).error, /^No element 'Zn'.*Available: Au, Cu\.$/);
  assert.match(viewAction(v, { op: "colour", by: "layer", name: "alt" }).error, /^No logged layer 'alt' with intervals.*litho, vein\.$/, "a layer with no intervals is not offered");
  assert.match(viewAction(v, { op: "colour", by: "field" }).error, /'name' is needed/);
});

test("#3932 show_layers: logged layers by key, 'assays', 'terrain'; what is not found is said; Undo restores each one as it was; none found is refused", () => {
  const v = viewer();
  const r = viewAction(v, { op: "layers", layers: ["LITHO", "vein", "assays", "terrain", "rasters", "vein"], visible: false });
  assert.deepEqual([r.ok, r.layers, r.not_found], [true, ["litho", "vein", "assays", "terrain"], ["rasters"]]);
  assert.deepEqual([v.layerVisible, v.assayVisible, v.terrain.visible], [{ litho: false, vein: false }, false, false]);
  r.revert();
  assert.deepEqual([v.layerVisible, v.assayVisible, v.terrain.visible], [{ litho: true, vein: false }, false, true]);
  const on = viewAction(v, { op: "layers", layers: ["vein"], visible: true }); assert.equal(v.layerVisible.vein, true); on.revert(); assert.equal(v.layerVisible.vein, false);
  assert.match(viewAction(v, { op: "layers", layers: ["nothing"], visible: true }).error, /^None of these is a layer here: nothing\. The keys are those list_layers gives \(litho, vein\), and 'assays' and 'terrain'\.$/);
});

test("#3932 set_view: Fit, Top and Bottom as the buttons do, a hole, a section opened in its window; the camera put back on Undo", () => {
  const v = viewer(), cs = v.camState.current;
  const top = viewAction(v, { op: "view", view: "top" });
  assert.deepEqual([cs.theta, cs.phi, v.updates], [0, 0.02, 1], "the Top button's camera");
  top.revert(); assert.deepEqual([cs.theta, cs.phi, v.updates], [0.7, 1.0, 2]);
  viewAction(v, { op: "view", view: "bottom" }); assert.ok(Math.abs(cs.phi - (Math.PI - 0.02)) < 1e-12);
  cs.phi = 1.0;
  const fit = viewAction(v, { op: "view", view: "fit" }); assert.equal(cs.radius, 900); fit.revert(); assert.equal(cs.radius, 500);
  const h = viewAction(v, { op: "view", view: "hole", target: "dh-23-002" });
  assert.deepEqual(v.calls.at(-1), ["zoomToHole", "DH-23-002"]); assert.equal(cs.target.x, 9);
  h.revert(); assert.deepEqual([cs.target.x, cs.target.y, cs.target.z], [1, 2, 3]);
  const s = viewAction(v, { op: "view", view: "section", target: "a-a" });
  assert.deepEqual([s.ok, s.name, s.revert, v.calls.at(-1)], [true, "A-A", undefined, ["reopenSection", "s1"]], "a window opened, nothing in the view to put back");
  assert.match(viewAction(v, { op: "view", view: "hole", target: "DH-99" }).error, /^No hole 'DH-99'/);
  assert.match(viewAction(v, { op: "view", view: "section", target: "Z-Z" }).error, /^No section 'Z-Z'/);
});

test("#3932 through the bridge: StrixViewer comes forward, the toast says what was done, its Undo is the view's revert; target needed for a hole or a section", async () => {
  if (!globalThis.window) globalThis.window = new EventTarget();
  const v = viewer();
  const on = (e) => { if (e.detail.action === "mcp-view") e.detail.payload.reply(viewAction(v, e.detail.payload)); };
  window.addEventListener("geostrix-module-action", on);
  try {
    const tabs = [], toasts = [], log = [];
    const s = { goToModule: (m) => tabs.push(m), undoCheckpoint: (l) => log.push(l ?? null) };
    const run = (name, args) => runChange(name, args, { getStore: () => s, client: "Claude Desktop", toast: (t) => toasts.push(t), settle: async () => {} });
    assert.deepEqual(await run("colour_holes", { by: "element", name: "Au" }), { ok: true, data: { ok: true, changed: "assay display", name: "Au" } });
    assert.equal(toasts[0].message, "Claude Desktop: showed the Au grades along the holes");
    assert.deepEqual(log, [null, null], "a view change gets no undo label (it is not in the history)");
    toasts[0].undo(); assert.deepEqual(v.assayDisplayElements, ["Cu"]);
    assert.equal((await run("show_layers", { layers: ["vein"], visible: true })).ok, true); assert.equal(toasts[1].message, "Claude Desktop: showed vein");
    assert.equal((await run("set_view", { view: "top" })).ok, true); assert.equal(toasts[2].message, "Claude Desktop: turned the view to the top");
    assert.deepEqual(tabs, ["viewer", "viewer", "viewer"]);
    assert.deepEqual(await run("set_view", { view: "hole" }), { ok: false, error: "'target' is needed with view: 'hole' (a hole id)." });
  } finally { window.removeEventListener("geostrix-module-action", on); }
  const vm = read("../src/modules/ViewerModule.jsx");
  assert.match(vm, /useMcpViewActions\(\(\) => \(\{ collars, layers, assayElements, terrain, updateTerrain, sections, holeColourBy, setHoleColourBy, layerVisible, setLayerVisible, assayVisible, setAssayVisible, assayDisplayElements, setAssayDisplayElements, toggleAssayElement, camState, cameraRef, fitButton, zoomToHole, reopenSection \}\)\);/);
  assert.equal((vm.match(/useMcpViewActions\(/g) || []).length, 1, "one call");
  assert.match(vm, /import \{ useMcpViewActions \} from "\.\/viewer\/useMcpViewActions\.js";/);
});
