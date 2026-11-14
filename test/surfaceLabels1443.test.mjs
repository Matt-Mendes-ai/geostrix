// TASKS.csv #1443 (review #1352, Silvertip) — the dip beside each outcrop symbol and a sample's id or element value beside each
// surface sample, as label sprites decluttered like the hole labels
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { syncTextLabels, sampleLabelText, dipLabelText } from "../src/lib/viewer/holeLabels.js";
import { outcropLabelItems } from "../src/lib/viewer/sceneBuilders.js";

const fakeGroup = () => ({ children: [], add(s) { this.children.push(s); } });
const fakeSprite = (text) => { const sp = { text, position: { set(x, y, z) { Object.assign(this, { x, y, z }); } }, material: { map: { disposed: 0, dispose() { this.disposed++; } }, dispose() {} } }; return sp; };

test("text labels: cleared (textures disposed) and drawn above the anchor; empty text skipped", () => {
  const g = fakeGroup();
  const old = fakeSprite("old"); g.children.push(old);
  const n = syncTextLabels(g, [{ x: 1, y: 2, z: 3, text: "62" }, { x: 4, y: 5, z: 6, text: "" }, { x: 7, y: 8, z: 9, text: 12.5, tip: "S12\n12.5" }], fakeSprite, 2);
  assert.equal(n, 2);
  assert.equal(old.material.map.disposed, 1);
  assert.deepEqual([g.children[0].text, g.children[0].position.y, g.children[1].text, g.children[1].userData.tip], ["62", 4, "12.5", "S12\n12.5"]);
  assert.equal(syncTextLabels(g, [], fakeSprite), 0);
  assert.equal(g.children.length, 0);
});

test("a sample's label: its id, or one element's value shortened; nothing when it has none", () => {
  const row = { sample_id: "RC-0042", values: { Au: 0.0123, Cu: 1234.6, Zn: 45.67, Ag: 2.345 } };
  assert.equal(sampleLabelText(row, "id"), "RC-0042");
  assert.equal(sampleLabelText(row, "el:Cu"), "1235");
  assert.equal(sampleLabelText(row, "el:Zn"), "45.7");
  assert.equal(sampleLabelText(row, "el:Ag"), "2.35");
  assert.equal(sampleLabelText(row, "el:Au"), "0.012");
  assert.equal(sampleLabelText(row, "el:Pb"), null);
  assert.equal(sampleLabelText({ values: {} }, "id"), null);
  assert.equal(sampleLabelText(row, "none"), null);
  assert.equal(dipLabelText({ dip: 61.6 }), "62");
  assert.equal(dipLabelText({}), null);
});

test("outcrop dip labels: only the sets that ask, visible ones, sitting with the disc", () => {
  const sets = [
    { name: "outcrops", labels: "dip", size: 20, rows: [{ x: 100, y: 200, z: 1000, dip: 45, dipDir: 90, cls: "bedding" }, { x: 110, y: 210, z: null, dip: 80, dipDir: 180, cls: "fault" }] },
    { name: "quiet", rows: [{ x: 1, y: 2, z: 3, dip: 30, dipDir: 0 }] },
    { name: "hidden", labels: "dip", visible: false, rows: [{ x: 1, y: 2, z: 3, dip: 30, dipDir: 0 }] },
  ];
  const items = outcropLabelItems(sets, { origin: { x: 0, y: 0, z: 900 }, terrain: null });
  assert.equal(items.length, 2);
  // #3066: at the symbol's label anchor (FGDC 6.2: 0.6 mm along strike, 1.9 mm down dip; 20 m symbol = 4 m a mm): 45 -> 090 puts it 7.6 m
  // east and 2.4 m north of the point
  assert.equal(items[0].text, "45"); assert.ok(Math.abs(items[0].x - 107.6) < 1e-6 && Math.abs(items[0].z + 202.4) < 1e-6, JSON.stringify(items[0]));
  assert.ok(items[0].y > 100 && items[0].y < 120, String(items[0].y)); // 1000 - 900 + a little above the ground
  assert.equal(items[1].y > 0 && items[1].y < 30, true); // no elevation and no terrain: the origin's z
  assert.match(items[1].tip, /^outcrops\nfault: 80° → 180°$/);
});

test("wiring: two label groups decluttered each frame, the outcrop effect and the sample build sync them, the Style dialog and the set card offer them", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /for \(const name of \["outcrop_labels", "sample_labels"\]\) \{ const lg = new THREE\.Group\(\)/);
  assert.match(v, /for \(const name of \["outcrop_labels", "sample_labels"\]\) \{ const lg = layerGroupsRef\.current\?\.\[name\]; if \(lg\?\.visible && lg\.children\.length\) \{ fitScreenLabels\(lg, camera, mount\.clientHeight\); declutterHoleLabels\(lg/);
  assert.match(v, /syncTextLabels\(lg, outcropLabelItems\(surfaceStructures, \{ origin: originRef\.current, terrain, flatZ: surfaceFlatZ \}\), makeTextSprite, 0\)/); // flatZ: #2753
  assert.match(v, /sampleLabelItems\(placedSurfaceSamples, layerStyles\.surface_samples\?\.label \|\| "none", \{ ox, oy, oz(, units: surfaceElementUnits \/\* #2641 \*\/)? \}\)/); // the items come from the lib (ViewerModule's size cap)
  assert.match(v, /labelChoices: key === "surface_samples"/);
  const m = readFileSync(new URL("../src/components/LayerStyleModal.jsx", import.meta.url), "utf8");
  assert.match(m, /target\.labelChoices && \(/);
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /updateSurfaceStructureSet\(s\.id, \{ labels: e\.target\.checked \? "dip" : "none" \}\)/);
});
