// TASKS.csv #2820 (split from #2756) — Grade × thickness in plan by ordinary kriging now gives each node's kriging variance (as its standard
// deviation, in the variable's unit) and shades the plan by GT's, so the kriged plan says where it is least sure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planGridOK, sdSummary, sdPixels } from "../src/lib/planKriging.js";
import { okEstimate } from "../src/lib/estimation.js";

let seed = 2820; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const holes = [];
for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) { const x = i * 50 + rnd() * 20, y = j * 50 + rnd() * 20, gt = 3 + 2 * Math.sin(x / 120) + rnd(); holes.push({ hole_id: `H${i}_${j}`, x, y, gt, thicknessM: 1 + rnd() * 3 }); }
const vg = { model: "spherical", nugget: 0.3, sill: 2.1, range: 180 };

test("each node's kriging variance matches the estimator's okEstimate on the same nearest holes", () => {
  const radius = 120, ok = planGridOK(holes, { cell: 10, radius, pad: 60, vgGT: vg, vgTh: null, maxSamples: 12 });
  assert.equal(ok.sdTh, null, "no thickness variogram: no thickness standard deviation");
  let checked = 0;
  for (let k = 0; k < ok.gt.length; k += 41) {
    if (!Number.isFinite(ok.sdGT[k]) || ok.sdGT[k] === 0) continue;
    const x = ok.x0 + (k % ok.nx) * ok.cell, y = ok.y0 + Math.floor(k / ok.nx) * ok.cell;
    const used = holes.map((h) => ({ p: { x: h.x, y: h.y, z: 0 }, d2: (h.x - x) ** 2 + (h.y - y) ** 2, value: h.gt })).filter((u) => u.d2 <= radius * radius).sort((a, b) => a.d2 - b.d2).slice(0, 12);
    const ref = okEstimate(used, x, y, 0, vg);
    assert.ok(Math.abs(ok.sdGT[k] ** 2 - ref.kv) < 1e-9 * Math.max(1, ref.kv), `node ${k}: ${ok.sdGT[k] ** 2} vs ${ref.kv}`);
    assert.ok(Math.abs(ok.gt[k] - Math.max(0, ref.value)) < 1e-9, "the same estimate too");
    checked++;
  }
  assert.ok(checked > 40, `${checked} nodes compared`);
});

test("larger between the holes than beside them; past the drilling larger still; the same whatever the values", () => {
  const ok = planGridOK(holes, { cell: 5, radius: 150, pad: 75, vgGT: vg, vgTh: vg });
  const at = (x, y) => ok.sdGT[Math.round((x - ok.x0) / ok.cell) + ok.nx * Math.round((y - ok.y0) / ok.cell)];
  const h = holes[44];
  assert.ok(at(h.x + 2, h.y + 2) < at(h.x + 25, h.y + 25), "near a hole < half-way to the next");
  assert.ok(at(h.x + 25, h.y + 25) < at(-50, 200), "inside the drilling < 50 m past its edge");
  const s = sdSummary(ok.sdGT);
  assert.ok(s.min >= 0 && s.max <= Math.sqrt(2 * vg.sill) && s.median > s.min && s.max > s.median, JSON.stringify(s));
  const other = planGridOK(holes.map((p) => ({ ...p, gt: p.gt * 10 + 7 })), { cell: 5, radius: 150, pad: 75, vgGT: vg, vgTh: vg });
  for (let k = 0; k < ok.sdGT.length; k += 131) if (Number.isFinite(ok.sdGT[k])) assert.equal(other.sdGT[k], ok.sdGT[k]);
  assert.deepEqual(sdSummary(ok.sdTh), s, "same variogram, same layout: the same spread");
  // a nugget: beside a hole the deviation is not 0 (only exactly on one), so the text says 'lowest beside the holes'
  assert.ok(s.min > 0.5 && s.min < Math.sqrt(vg.sill));
  // a node with no hole in reach: not kriged, NaN
  const tight = planGridOK(holes, { cell: 5, radius: 20, pad: 40, vgGT: vg, vgTh: null });
  assert.ok(tight.sdGT.some((v) => Number.isNaN(v)) && tight.sdGT.some((v) => Number.isFinite(v)));
  assert.equal(sdSummary(null), null);
});

test("the image: north row first, opacity in proportion to the deviation, clear where not kriged", () => {
  const sd = Float64Array.from([0, 1, NaN, 2]); // 2 x 2: south row [0, 1], north row [NaN, 2]
  const px = sdPixels(sd, 2, 2, 2);
  assert.equal(px[3], 0, "image (0,0) = node (0,1): not kriged, clear");
  assert.equal(px[7], Math.round(0.7 * 255), "image (1,0) = node (1,1): the largest, 70 %");
  assert.equal(px[11], 0, "image (0,1) = node (0,0): on a hole");
  assert.equal(px[15], Math.round(0.7 * 255 / 2));
});

test("the modal states each kriged variable's deviation and offers the shading", () => {
  const m = readFileSync(new URL("../src/components/GradeThicknessModal.jsx", import.meta.url), "utf8");
  assert.ok(m.includes("sd: { gt: sdSummary(grid?.sdGT), thickness: sdSummary(grid?.sdTh) }") || m.includes("const sd = { gt: sdSummary(grid?.sdGT), thickness: sdSummary(grid?.sdTh) };"));
  assert.ok(m.includes('"{what}: kriging standard deviation {a}–{b} {u} (median {m}): lowest beside the holes, highest where they are farthest apart."'));
  assert.ok(m.includes("showSd && ok?.sdImage && <") || m.includes("showSd && ok?.sdImage && (() =>"));
  assert.doesNotMatch(m, /^import [^;]*planKriging/m, "the kriging module still loads on demand");
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(d["Shade the plan by the GT kriging standard deviation (darkest = least sure)"], l);
  }
});
