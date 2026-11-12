// TASKS.csv #1742 (review #1645, Copley) — ordinary kriging used its own auto-fitted variogram with no fit quality (Cu spherical 886 m at
// 51 % nugget; Au pure nugget). The fit's r² now travels with the variogram and the result says it, warning below 0.5.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateBlockModel } from "../src/lib/estimation.js";

let seed = 1742; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pts = [];
for (let h = 0; h < 9; h++) { const hx = (h % 3) * 40, hy = Math.floor(h / 3) * 40; for (let i = 0; i < 30; i++) pts.push({ x: hx, y: hy, z: -2 * i, value: 1 + Math.sin(hx / 30 + i / 6) + rnd() * 0.3, hole_id: "H" + h, length: 2 }); }

test("an auto-fitted variogram carries its r²; a typed one does not", () => {
  const base = { bounds: { xmin: -10, xmax: 90, ymin: -10, ymax: 90, zmin: -60, zmax: 0 }, cellSize: { dx: 10, dy: 10, dz: 10 }, searchRadius: 80, minSamples: 1, maxSamples: 12, method: "ok" };
  const a = estimateBlockModel(pts, base);
  assert.equal(a.variogram.fitted, true);
  assert.ok(Number.isFinite(a.variogram.rSquared) && a.variogram.rSquared <= 1, String(a.variogram.rSquared));
  const b = estimateBlockModel(pts, { ...base, variogram: { model: "spherical", nugget: 0.1, sill: 0.6, range: 60 } });
  assert.equal(b.variogram.fitted, false);
  assert.equal(b.variogram.rSquared, undefined);
});

test("the result line says the fit and warns below 0.5", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /result\.variogram\.fitted && result\.variogram\.rSquared != null && <span>\{tr\(" Fit r² \{r\}\."/);
  assert.match(m, /result\.variogram\.rSquared < 0\.5 && <span style=\{\{ color: "var\(--color-warn-text\)" \}\}>\{" "\}\{tr\("Weak fit \(r² \{r\}\): these points do not pin the nugget, sill and range/);
});
