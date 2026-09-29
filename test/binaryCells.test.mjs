// TASKS.csv #325 — inversion results' cell columns arrive as base64 binary (sidecar main.py binary_cells)
// and are decoded back to plain arrays on receipt (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import { decodeBinaryCells } from "../src/lib/desktop.js";

const b64 = (typed) => Buffer.from(typed.buffer).toString("base64");

test("#325 decodeBinaryCells: float32 offsets rounded back to the column's decimals, raw float32, float64, passthrough", () => {
  const x = [461535.46, 461510.12, 463999.99], base = x[0];
  const data = {
    kind: "inversion", phi_d: 1.5, predicted: [1, 2],
    cells: {
      x: { dtype: "f4", n: 3, base, decimals: 2, b64: b64(Float32Array.from(x, (v) => v - base)) },
      value: { dtype: "f4", n: 3, base: 0, decimals: null, b64: b64(Float32Array.from([0.1, 0.2, 0.3])) },
      raw: { dtype: "f8", n: 2, b64: b64(Float64Array.from([1e-17, 123456789.123456])) },
      old: [1, 2, 3], // an older sidecar's plain list
    },
  };
  const out = decodeBinaryCells(data);
  assert.deepEqual(out.cells.x, x); // exact, back to the centimetre values
  assert.deepEqual(out.cells.value, [...Float32Array.from([0.1, 0.2, 0.3])]);
  assert.deepEqual(out.cells.raw, [1e-17, 123456789.123456]);
  assert.deepEqual(out.cells.old, [1, 2, 3]);
  assert.equal(out.phi_d, 1.5); assert.deepEqual(out.predicted, [1, 2]);
  assert.ok(Array.isArray(out.cells.x)); // plain arrays: .map to objects etc. keeps working
  assert.deepEqual(decodeBinaryCells({ surfaces: [] }), { surfaces: [] }); // results without cells untouched
});
