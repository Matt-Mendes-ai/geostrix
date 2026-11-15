// TASKS.csv #3122 / #3123 (split from #3089) — the long section offers the plan's ordinary kriging and its standard deviation (a fourth panel), the
// pierce points' hole ids as labels, and a mask by distance from a pierce point (a lode drilled in two separate patches).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sectionGrids, sectionGridsOK } from "../src/lib/longSection.js";
import { layoutLongSection, drawLongSection } from "../src/lib/longSectionFigure.js";
import * as kriging from "../src/lib/planKriging.js";

// two patches of drilling 600 m apart along strike: 5 x 5 pierce points each, 25 m apart, elevations 100-200 m; a smooth GT trend and noise
let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const points = [];
for (const a0 of [0, 700]) for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
  const along = a0 + i * 25, elev = 100 + j * 25, thick = 2 + 0.01 * along + rnd() * 0.5, grade = 3 + 0.004 * along + rnd() * 0.5;
  points.push({ hole_id: `H${a0}-${i}${j}`, along, elev, thick, grade, gt: grade * thick });
}

test("sectionGridsOK: kriged on the same nodes, with a variogram of each and the standard deviations masked like the values", () => {
  const idw = sectionGrids(points, { cell: 10, radius: 80 });
  const ok = sectionGridsOK(points, { cell: 10, radius: 80 }, kriging);
  assert.equal(ok.method, "ok");
  assert.deepEqual([ok.nx, ok.ny, ok.estimated], [idw.nx, idw.ny, idw.estimated], "the same nodes and the same mask");
  assert.ok(ok.vgGT.fit || ok.vgGT.why, "a variogram was tried for GT"); assert.ok(ok.vgTh.fit || ok.vgTh.why);
  assert.ok(ok.sdGT || !ok.vgGT.fit);
  if (ok.sdGT) for (let k = 0; k < ok.gt.length; k++) if (!Number.isFinite(ok.gt[k])) assert.ok(Number.isNaN(ok.sdGT[k]), "sd masked where the value is");
  assert.notDeepEqual([...ok.gt].slice(0, 400), [...idw.gt].slice(0, 400), "kriged values differ from inverse distance's");
  assert.equal(sectionGridsOK(points, { cell: 10, radius: 80 }, null), null);
});

test("the distance mask: the outline spans the gap between the patches, the distance does not", () => {
  const outline = sectionGrids(points, { cell: 10, radius: 400 });
  const near = sectionGrids(points, { cell: 10, radius: 400, maskM: 40 });
  assert.equal(near.maskM, 40); assert.deepEqual(near.hull, []);
  assert.ok(outline.hull.length >= 3 && outline.maskM === 0);
  assert.ok(near.estimated < outline.estimated, `${near.estimated} < ${outline.estimated}`);
  // a node in the middle of the gap (along 400, elevation 150): estimated inside the outline, none under the distance mask
  const at = (g, a, e) => { const i = Math.round((a - g.x0) / g.cell), j = Math.round((e - g.y0) / g.cell); return g.gt[i + g.nx * j]; };
  assert.ok(Number.isFinite(at(outline, 400, 150)), "the outline's mask keeps the gap");
  assert.ok(Number.isNaN(at(near, 400, 150)), "the distance mask drops it");
  assert.ok(Number.isFinite(at(near, 50, 150)), "and keeps a node by a pierce point");
});

test("the figure: a count of panels, and hole-id labels when asked", () => {
  const g = sectionGrids(points, { cell: 10, radius: 80 });
  const L3 = layoutLongSection(g, { width: 1600 }), L4 = layoutLongSection(g, { width: 1600, count: 4 });
  assert.equal(L3.panels.length, 3); assert.equal(L4.panels.length, 4);
  assert.ok(L4.height > L3.height); assert.ok(Math.abs(L4.footY - 4 * (L4.panels[1].y - L4.panels[0].y)) < 1e-6);
  const texts = [];
  const ctx = new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }, { get: (t, k) => (k in t ? t[k] : k === "fillText" ? (s) => texts.push(String(s)) : () => {}), set: () => true });
  const panel = { title: "t", values: g.gt, levels: [1, 2], unit: "u" };
  drawLongSection(ctx, L3, g, [panel, panel, panel], { points });
  const without = texts.filter((s) => /^H\d+-\d+$/.test(s)).length;
  texts.length = 0;
  drawLongSection(ctx, L3, g, [panel, panel, panel], { points, labels: true });
  assert.equal(without, 0);
  assert.equal(texts.filter((s) => /^H\d+-\d+$/.test(s)).length, 3 * points.length, "each point labelled on each panel");
});

test("wiring: the method, the sd panel, the mask and the labels in the long-section view; keys", () => {
  const c = readFileSync(new URL("../src/components/LongSectionGT.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(c, /grid = sectionGridsOK\(points, \{ cell: cellM, radius: radiusM, maskM \}, k\);/);
  assert.match(c, /if \(ok && showSd && grid\.sdGT\) panels\.push\(\{ title: `\(d\) GT kriging standard deviation/);
  assert.match(c, /layoutLongSection\(grid, \{ width: 1600, count: panels\.length \}\)/);
  assert.match(c, /const maskM = maskKind === "distance" \? \(Number\(maskText\) > 0 \? Number\(maskText\) : radiusM \|\| 0\) : 0;/);
  assert.match(c, /\{fig\.ok \? tr\("Ordinary kriging of the pierce points/);
  assert.match(c, /fig\.grid\.maskM > 0 \? tr\("\{n\} of \{t\} nodes estimated, within \{m\} m of a pierce point\./);
  const keys = ["{n} of {t} nodes estimated, within {m} m of a pierce point. Intervals: thickness {a} m, grade {b} {gu}, GT {c} {tu}.", "Section estimation method", "Add a panel of the GT kriging standard deviation", "Panels stop at", "Where the panels stop", "the outline of the pierce points", "a distance from the nearest pierce point", "Distance (m)", "Mask distance (m)", "Label the pierce points with their hole ids"];
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")); for (const k of keys) assert.ok(d[k], `${l}: ${k}`); assert.ok(Object.keys(d).some((k) => k.startsWith("Ordinary kriging of the pierce points")), l); }
});
