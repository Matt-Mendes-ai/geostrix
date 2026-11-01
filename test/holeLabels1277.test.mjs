// TASKS.csv #1277 — collar labels are redrawn on their own, not by rebuilding every drillhole
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { holeLabelText, syncHoleLabels } from "../src/lib/viewer/holeLabels.js";

const fakeGroup = () => ({ children: [], add(c) { this.children.push(c); } });
const makeSprite = (text) => ({ text, position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, material: { map: { dispose() { this.disposed = true; } }, dispose() {} } });

test("#1277 label text per mode", () => {
  const a = { id: "H1", x: 0, y: 0, z: 0, zWorld: 1234.6, depth: 250.4 };
  assert.equal(holeLabelText(a, "hole_id"), "H1");
  assert.equal(holeLabelText(a, "hole_id_z"), "H1 (1235m)");
  assert.equal(holeLabelText(a, "hole_id_depth"), "H1 (250.4m)");
});

test("#1277 sync clears the old sprites (textures disposed) and draws the mode's labels above the collar", () => {
  const g = fakeGroup();
  const anchors = [{ id: "A", x: 1, y: 2, z: 3, zWorld: 100, depth: 50 }, { id: "B", x: 4, y: 5, z: 6, zWorld: 100, depth: 50 }];
  assert.equal(syncHoleLabels(g, anchors, "hole_id", makeSprite), 2);
  const old = g.children[0];
  assert.equal(old.position.y, 8);
  assert.equal(syncHoleLabels(g, anchors, "hole_id_depth", makeSprite), 2);
  assert.equal(old.material.map.disposed, true);
  assert.equal(g.children[1].text, "B (50m)");
  assert.equal(syncHoleLabels(g, anchors, "none", makeSprite), 0);
  assert.equal(g.children.length, 0);
  assert.equal(syncHoleLabels(null, anchors, "hole_id", makeSprite), 0);
});

test("#1277 holeLabelMode is no longer a dependency of the drillhole rebuild effect", () => {
  const src = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  const deps = src.match(/\}, \[collars, survey, desurveyMethod[^\n]*\]\);/)[0];
  assert.ok(!deps.includes("holeLabelMode"), deps.slice(-120));
  assert.match(src, /useEffect\(\(\) => \{[^\n]*syncHoleLabels\([^\n]*\}, \[holeLabelMode\]\);/);
});
