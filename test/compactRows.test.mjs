// TASKS.csv #374 — geophysics point surveys stored compactly.
import test from "node:test";
import assert from "node:assert/strict";
import { compactPointRows, expandPointRows, compactLayers, expandLayers, COMPACT_MIN_ROWS } from "../src/lib/compactRows.js";

function survey(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const r = { x: 463000.25 + (i % 500) * 12.5, y: 6178000.75 + Math.floor(i / 500) * 25, value: 56000 + Math.sin(i) * 350.123, _src: i < n / 2 ? "heli_mag.csv" : "ground_mag.csv", line: String(1000 + Math.floor(i / 500)), fid: i };
    if (i % 3 === 0) r.z = 1100 + (i % 7); else r.z = null; // some points have no elevation
    if (i % 5 === 0) r.zAgl = 35 + (i % 4);
    if (i === 7) r.custom = { note: "kept verbatim" };
    rows.push(r);
  }
  return rows;
}

test("#374 point rows round-trip: every field back (Float32 precision), nulls and absences kept", () => {
  const rows = survey(3000);
  const back = expandPointRows(JSON.parse(JSON.stringify(compactPointRows(rows))));
  assert.equal(back.length, rows.length);
  for (let i = 0; i < rows.length; i += 37) {
    const a = rows[i], b = back[i];
    assert.ok(Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01, `xy ${i}`);   // offsets from the first point
    assert.ok(Math.abs(a.value - b.value) < 0.01, `value ${i}`);                       // ~7 significant digits
    assert.equal(b.z === null, a.z === null, `z null ${i}`);
    if (a.z !== null) assert.ok(Math.abs(a.z - b.z) < 1e-3);
    assert.equal("zAgl" in b, "zAgl" in a);
    assert.equal(b._src, a._src); assert.equal(b.line, a.line); assert.equal(b.fid, a.fid);
  }
  assert.deepEqual(back[7].custom, { note: "kept verbatim" });
});

test("#374 size: a 200,000-point survey is several times smaller; small surveys stay plain; layers helpers", () => {
  const rows = survey(200000);
  const plain = JSON.stringify(rows).length, compact = JSON.stringify(compactPointRows(rows)).length;
  console.log(`200k points: plain ${(plain / 1e6).toFixed(1)} MB, compact ${(compact / 1e6).toFixed(1)} MB`);
  assert.ok(compact < plain / 3);
  assert.equal(compactPointRows(rows), compactPointRows(rows)); // cached: autosave re-encodes nothing unchanged
  const small = survey(COMPACT_MIN_ROWS - 1);
  assert.equal(compactPointRows(small), small);
  const layers = { litho: [{ hole_id: "A" }], geophys_pts: rows };
  const c = compactLayers(layers);
  assert.equal(c.litho, layers.litho);
  assert.equal(compactLayers(c), c); // idempotent on an already-compact layer set
  assert.equal(expandLayers(c).geophys_pts.length, 200000);
  assert.equal(expandLayers(layers), layers);
});
