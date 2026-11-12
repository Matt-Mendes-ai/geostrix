// TASKS.csv #2795 — the hole / sample / outcrop labels are drawn into shared atlas pages (one canvas and one GPU upload per page),
// not a canvas and texture per label
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { atlasLayout, ATLAS_W } from "../src/lib/viewer/textSprite.js";
import { syncHoleLabels, syncTextLabels } from "../src/lib/viewer/holeLabels.js";

test("atlas cells do not overlap, stay inside their page and start a new row or page when full", () => {
  const widths = Array.from({ length: 2300 }, (_, i) => 120 + (i % 7) * 20);
  const { cells, pageHeights } = atlasLayout(widths, 44);
  assert.equal(cells.length, 2300);
  assert.ok(pageHeights.length >= 2 && pageHeights.every((h) => h <= 2048));
  const byPage = new Map();
  cells.forEach((c, i) => {
    assert.ok(c.x >= 0 && c.x + c.w <= ATLAS_W && c.y >= 0 && c.y + 44 <= pageHeights[c.page], JSON.stringify(c));
    assert.equal(c.w, widths[i]);
    (byPage.get(c.page) || byPage.set(c.page, []).get(c.page)).push(c);
  });
  for (const list of byPage.values()) for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    assert.ok(b.y > a.y || b.x >= a.x + a.w + 2, "in reading order, 2 px apart");
  }
  // 2,300 labels in about 5 pages, not 2,300 canvases
  assert.ok(pageHeights.length <= 6, String(pageHeights.length));
  assert.deepEqual(atlasLayout([], 44), { cells: [], pageHeights: [] });
  assert.equal(atlasLayout([5000], 44).cells[0].w, ATLAS_W, "a label wider than a page is cut to it");
});

test("the label syncs make all their sprites in one batch when the sprite maker offers it", () => {
  const calls = [];
  const one = () => { throw new Error("one at a time"); };
  one.many = (texts) => { calls.push(texts); return texts.map(() => new THREE.Sprite(new THREE.SpriteMaterial())); };
  const g = new THREE.Group();
  const anchors = [{ id: "A", x: 0, y: 0, z: 0, depth: 50 }, { id: "B", x: 100, y: 0, z: 0, depth: 60 }, { id: "C", x: 100.2, y: 0, z: 0, depth: 70 }];
  assert.equal(syncHoleLabels(g, anchors, "id", one), 2);
  assert.deepEqual(calls[0], ["A", "B +1"], "one label for the B / C fan (#2208)");
  assert.equal(g.children[1].userData.tip, "B\nC");
  assert.deepEqual(g.children[0].position.toArray(), [0, 6, 0]);
  const t = new THREE.Group();
  assert.equal(syncTextLabels(t, [{ x: 0, y: 0, z: 0, text: "45" }, { x: 1, y: 0, z: 0, text: "" }, { x: 2, y: 0, z: 0, text: 30, tip: "S2\n30" }], one, 3), 2);
  assert.deepEqual(calls[1], ["45", "30"]);
  assert.equal(t.children[1].userData.tip, "S2\n30");
  // without the batch form, one sprite per label as before
  const single = (text) => { const s = new THREE.Sprite(new THREE.SpriteMaterial()); s.name = text; return s; };
  const h = new THREE.Group();
  syncHoleLabels(h, anchors.slice(0, 1), "id", single);
  assert.equal(h.children[0].name, "A");
});

test("makeTextSprite offers the atlas batch; each atlas sprite keeps the single sprite's look", () => {
  const s = readFileSync(new URL("../src/lib/viewer/textSprite.js", import.meta.url), "utf8");
  assert.ok(s.includes("makeTextSprite.many = makeTextSprites;"));
  assert.ok(s.includes("new THREE.SpriteMaterial({ depthTest: false, transparent: true, sizeAttenuation: false })"));
  assert.ok(s.includes("sprite.center.set(0.5, -0.35);") && s.includes("sprite.renderOrder = 999;"));
  assert.ok(s.includes("m.userData.labelAspect = cell.w / h;"));
  assert.ok(s.includes("const t = page.texture.clone();"), "a clone sharing the page's image");
});
