// TASKS.csv #3990 — Mineralization slices: each interval's tube cut into one wedge per mineral, its angle the mineral's share of the interval's per
// cent; every mineral its wedge (light drawing too), a small one a 2 % sliver; whole per cents summing to 100; the long form grouped by hole, from
// and to, the wide form by its fields; the prototypes face out; the drawing loads on use. Made-up holes and numbers.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { wedgeSpans, slicesOf, MIN_SLIVER } from "../src/lib/mineralSlices.js";
import { wedgePositions, wedgeProto, FULL_SEGMENTS, LIGHT_SEGMENTS } from "../src/lib/viewer/mineralSlices3d.js";
import { isTubeProto } from "../src/lib/viewer/tubeShader.js";
import { cleanLayerStyle } from "../src/lib/layerStyle.js";

const sum = (a) => a.reduce((s, v) => s + v, 0);
const R = (hole_id, from, to, value, extra) => ({ hole_id, from, to, value, extra });

test("#3990 the spans follow the per cents, whole per cents summing to 100, a small mineral a 2 % sliver", () => {
  assert.deepEqual(wedgeSpans([3, 1]), [75, 25]);
  assert.deepEqual(wedgeSpans([1, 1, 1]), [34, 33, 33]);
  const s = wedgeSpans([40, 0.1, 9.9]);
  assert.equal(sum(s), 100);
  assert.equal(s[1], MIN_SLIVER, "a trace mineral: still a visible sliver");
  assert.ok(s[0] < 80 && s[2] >= 19, "taken from the largest");
  const many = wedgeSpans(Array.from({ length: 70 }, (_, i) => i + 1));
  assert.equal(many.length, 70, "no cap: every mineral its wedge");
  assert.equal(sum(many), 100);
  assert.ok(many.every((v) => v >= 1));
  assert.deepEqual(wedgeSpans([0, 0]), [50, 50]);
  assert.deepEqual(wedgeSpans([]), []);
});

test("#3990 long form: the rows on one hole, from and to make the slices; a mineral logged twice counts once; no per cent: equal, counted", () => {
  const rows = [R("DH-23-001", 0, 2, "Py", 3), R("DH-23-001", 0, 2, "Cpy", 1), R("DH-23-001", 0, 2, "Py", 4), R("DH-23-001", 2, 4, "Py", 5),
    R("DH-23-002", 0, 1, "Sph"), R("DH-23-002", 0, 1, "Gn"), R("DH-23-002", 5, 6, "Py", 2), R("DH-23-002", 5, 6, "Mt", "")];
  const s = slicesOf(rows);
  assert.equal(s.form, "long");
  const a = s.parts.get(rows[0])[0], b = s.parts.get(rows[1])[0];
  assert.deepEqual([a.code, a.pct, a.span, a.start], ["Py", 4, 80, 0], "Py at its largest, 4 of 5 %");
  assert.deepEqual([b.code, b.span, b.start], ["Cpy", 20, 0.8]);
  assert.equal(s.parts.get(rows[2]), undefined, "the repeat draws no wedge");
  assert.equal(s.parts.get(rows[3])[0].span, 100, "one mineral: the whole tube");
  assert.deepEqual([s.parts.get(rows[4])[0].span, s.parts.get(rows[5])[0].span], [50, 50]);
  assert.equal(s.noPct, 1);
  assert.equal(s.parts.get(rows[7])[0].span, MIN_SLIVER, "a mineral with no per cent beside one that has: a sliver");
  assert.equal(slicesOf(rows), s, "kept per rows array");
});

test("#3990 wide form: a row's wedges from its mineral fields, in the layer's order; a row with none over 0 has no parts", () => {
  const rows = [{ hole_id: "DH-1", from: 0, to: 1, value: "CPY", extra: 7, MN_PY_pct: 2, MN_CPY_pct: 6, MN_MT_pct: null },
    { hole_id: "DH-1", from: 1, to: 2, value: "MT", extra: 3, MN_PY_pct: 0, MN_CPY_pct: null, MN_MT_pct: 0 }];
  const s = slicesOf(rows);
  assert.equal(s.form, "wide");
  assert.deepEqual(s.codes, ["MN_PY_pct", "MN_CPY_pct", "MN_MT_pct"]);
  assert.deepEqual(s.parts.get(rows[0]).map((p) => [p.code, p.span, p.lane]), [["MN_PY_pct", 25, 0], ["MN_CPY_pct", 75, 1]]);
  assert.equal(s.parts.get(rows[1]), undefined);
});

test("#3990 the wedge prototypes: faces outward, fewer arc segments in light drawing (never fewer wedges), shared per span, a tube piece", () => {
  for (const circle of [FULL_SEGMENTS, LIGHT_SEGMENTS]) for (const span of [1, 2, 25, 50]) {
    const P = wedgePositions(span, circle), mid = (span / 100) * Math.PI, inside = [0.5 * Math.cos(mid), 0.5, -0.5 * Math.sin(mid)];
    for (let i = 0; i < P.length; i += 9) {
      const u = [P[i + 3] - P[i], P[i + 4] - P[i + 1], P[i + 5] - P[i + 2]], v = [P[i + 6] - P[i], P[i + 7] - P[i + 1], P[i + 8] - P[i + 2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const c = [(P[i] + P[i + 3] + P[i + 6]) / 3, (P[i + 1] + P[i + 4] + P[i + 7]) / 3, (P[i + 2] + P[i + 5] + P[i + 8]) / 3];
      assert.ok((c[0] - inside[0]) * n[0] + (c[1] - inside[1]) * n[1] + (c[2] - inside[2]) * n[2] > 0, `span ${span} circle ${circle} triangle ${i / 9}`);
    }
  }
  assert.ok(wedgePositions(50, LIGHT_SEGMENTS).length < wedgePositions(50, FULL_SEGMENTS).length);
  assert.equal(wedgeProto(25), wedgeProto(25.2));
  assert.notEqual(wedgeProto(25, true), wedgeProto(25));
  assert.ok(isTubeProto(wedgeProto(25)) && isTubeProto(wedgeProto(3, true)));
  assert.deepEqual(cleanLayerStyle({ slices: true }, "interval"), { slices: true });
  assert.equal(cleanLayerStyle({ slices: false }, "interval"), null);
});

test("#3990 wiring: the scene draws the Mineralization layer's wedges, the drawing loads on use, the Style dialog's row, the wide layer's key", () => {
  const scene = readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(scene, /slices: mnlgySlices \/\* #3990 \*\//);
  assert.match(scene, /loadSlices\(\)\.then\(\(\) => requestRebuild\?\.\(\)\)/);
  assert.match(scene, /SL\.wedgeProto\(pt\.span, isLight\(\)\)/);
  assert.match(scene, /\.multiply\(SL\.rollOf\(pt\.start, ROLL_TMP\)\)/);
  assert.doesNotMatch(scene, /from "\.\.\/\.\.\/lib\/viewer\/mineralSlices3d\.js"/, "not in the startup bundle");
  assert.doesNotMatch(readFileSync(new URL("../src/lib/legendGroups.js", import.meta.url), "utf8"), /from "\.\/mineralSlices\.js"|mineralSlices3d/);
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /requestRebuild: \(\) => setRebuildSeq\(\(n\) => n \+ 1\)/);
  const modal = readFileSync(new URL("../src/components/LayerStyleModal.jsx", import.meta.url), "utf8");
  assert.match(modal, /<MineralSlicesRow rows=\{layers\?\.mnlgy\}/);
  const row = readFileSync(new URL("../src/components/MineralSlicesRow.jsx", import.meta.url), "utf8");
  assert.match(row, /loadSlices\(\)\.then\(\(\) => onChange\(\{ slices: true \}\)\)/);
});
