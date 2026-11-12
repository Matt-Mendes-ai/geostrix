// TASKS.csv #2784 — an interpretation line's vertex added (a midpoint handle pressed or dragged) or removed (Alt+click), as the section
// window's contact editor does; length, ties and box follow, as for a move (#2767).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { interpretationLayer, addInterpretationLine, insertInterpretationVertex, removeInterpretationVertex, moveInterpretationVertex } from "../src/lib/interpretation.js";

const base = addInterpretationLine(interpretationLayer("Faults"), [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], { type: "fault", name: "F1" });

test("insert: the new vertex at its place, the length follows, the other lines and the input untouched", () => {
  const l = insertInterpretationVertex(base, 0, 1, [50, 30]);
  assert.deepEqual(l.features[0].parts[0], [[0, 0], [50, 30], [100, 0], [100, 100]]);
  assert.equal(l.features[0].attributes.length_m, Math.round(Math.hypot(50, 30) * 2 + 100));
  assert.deepEqual(base.features[0].parts[0], [[0, 0], [100, 0], [100, 100]]);
  for (const at of [0, 3, -1]) assert.equal(insertInterpretationVertex(base, 0, at, [1, 1]), base, `at ${at}: only inside the line`);
  assert.equal(insertInterpretationVertex(base, 0, 1, [NaN, 1]), base);
});

test("insert with a tie keeps the per-vertex ties aligned; a later move of a vertex past it still works", () => {
  const l = insertInterpretationVertex(base, 0, 2, [100, 50], { hole_id: "DH1", depth: 12 });
  assert.deepEqual(l.features[0].tieVerts, [null, null, { hole_id: "DH1", depth: 12 }, null]);
  assert.match(String(l.features[0].attributes.ties), /DH1/);
  const m = moveInterpretationVertex(l, 0, 3, [120, 100]);
  assert.deepEqual(m.features[0].parts[0][3], [120, 100]);
  assert.deepEqual(m.features[0].tieVerts[2], { hole_id: "DH1", depth: 12 });
});

test("remove: the vertex goes, its tie with it; a two-vertex line is kept whole", () => {
  const t = insertInterpretationVertex(base, 0, 1, [50, 0], { hole_id: "DH2", depth: 3 });
  const r = removeInterpretationVertex(t, 0, 1);
  assert.deepEqual(r.features[0].parts[0], [[0, 0], [100, 0], [100, 100]]);
  assert.equal(r.features[0].tieVerts, undefined);
  assert.equal(r.features[0].attributes.ties, undefined);
  const two = removeInterpretationVertex(base, 0, 0);
  assert.deepEqual(two.features[0].parts[0], [[100, 0], [100, 100]]);
  assert.equal(removeInterpretationVertex(two, 0, 0), two, "a line keeps two vertices");
  assert.equal(removeInterpretationVertex(base, 0, 9), base);
});

test("wiring: midpoint handles and Alt+click in the 3D view's edit hook; the pane passes both; the help line says so", () => {
  const h = fs.readFileSync(new URL("../src/components/useInterpretVertexEdit.js", import.meta.url), "utf8");
  assert.match(h, /if \(vi >= 0 && e\.altKey\) \{ if \(verts\.length > 2\) live\.current\.onRemove\?\.\(vi\); return true; \}/);
  assert.match(h, /const mi = vi < 0 && live\.current\.onInsert \? nearest\(e, mids\) : -1;/);
  assert.match(h, /live\.current\.onInsert\(mi \+ 1, moved \? \[last\.x, last\.y\] : \[mids\[mi\]\[0\], mids\[mi\]\[1\]\]/);
  const p = fs.readFileSync(new URL("../src/components/InterpretPane.jsx", import.meta.url), "utf8");
  assert.match(p, /onInsert: \(at, xy, tie\) => \{ if \(layer\) updateMapLayer\(layer\.id, \(l\) => \(\{ \.\.\.insertInterpretationVertex\(l, editIdx, at, xy, tie\)/);
  assert.match(p, /onRemove: \(vi\) => \{ if \(layer\) updateMapLayer\(layer\.id, \(l\) => \(\{ \.\.\.removeInterpretationVertex\(l, editIdx, vi\)/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(fs.readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))['Editing "{name}": drag a vertex (the orange points) in the 3D view to move it, drag a midpoint (the small yellow points) to add one, Alt+click a vertex to remove it. Top view works best.'], l);
});
