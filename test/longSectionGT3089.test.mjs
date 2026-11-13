// TASKS.csv #3089 (Matt, 2026-11-12, after the Sanshandao figure) — Grade x thickness on a long section: pierce points projected on a
// vertical plane along strike (typed, or the intercepts' best-fit plane), true / horizontal / downhole thickness, the three grids masked to
// the drilled extent, round contour intervals, the figure's layout, a one-page PDF of the figure, and the modal's wiring.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sectionFrame, thicknesses, projectPierces, sectionGrids, contourLevels, bandOf, rampColours, hull2d, pierceRows } from "../src/lib/longSection.js";
import { layoutLongSection } from "../src/lib/longSectionFigure.js";
import { imagePdf } from "../src/lib/imagePdf.js";
import { holeTotals } from "../src/lib/accumulation.js";

// a synthetic steep vein: strike 035 (dips 70 to 125), 2 m true, cut by holes drilled at -55 towards 305 (against the dip), on 8 x 6
// pierce points 40 m apart along strike and 30 m apart down the vein
const strike = 35, dip = 70, RAD = Math.PI / 180;
const sv = { x: Math.sin(strike * RAD), y: Math.cos(strike * RAD), z: 0 };
const dd = { x: Math.sin((strike + 90) * RAD) * Math.cos(dip * RAD), y: Math.cos((strike + 90) * RAD) * Math.cos(dip * RAD), z: -Math.sin(dip * RAD) }; // down dip
const n = { x: sv.y * dd.z - sv.z * dd.y, y: sv.z * dd.x - sv.x * dd.z, z: sv.x * dd.y - sv.y * dd.x }; // the vein's normal
const hole = { x: Math.sin(305 * RAD) * Math.cos(55 * RAD), y: Math.cos(305 * RAD) * Math.cos(55 * RAD), z: -Math.sin(55 * RAD) };
const cosHN = Math.abs(hole.x * n.x + hole.y * n.y + hole.z * n.z);
const pierces = [];
for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) {
  const along = i * 40, down = j * 30, p = { x: 1000 + along * sv.x + down * dd.x, y: 2000 + along * sv.y + down * dd.y, z: 400 + down * dd.z };
  const grade = 2 + i + j; // g/t, richer along strike and at depth
  pierces.push({ hole_id: `H${i}_${j}`, ...p, thicknessM: 2 / cosHN, meanGrade: grade, dir: hole });
}

test("the plane: typed (vertical, its normal across strike) or the intercepts' best-fit plane (its strike, dip and normal)", () => {
  const t = sectionFrame(pierces, { mode: "azimuth", azimuthDeg: 35 });
  assert.equal(t.strikeAz, 35); assert.equal(t.dip, 90);
  assert.ok(Math.abs(t.normal.x * sv.x + t.normal.y * sv.y) < 1e-12, "the normal is across strike");
  const f = sectionFrame(pierces, { mode: "fit" });
  assert.ok(Math.abs(f.strikeAz - 35) < 0.5 || Math.abs(f.strikeAz - 215) < 0.5, `strike ${f.strikeAz}`);
  assert.ok(Math.abs(f.dip - 70) < 0.5, `dip ${f.dip}`);
  assert.equal(sectionFrame(pierces, { mode: "azimuth" }).error, "azimuth", "no azimuth is chosen for the user");
  assert.equal(sectionFrame(pierces.slice(0, 1), {}).error, "few");
  const line = pierces.filter((p) => p.hole_id.endsWith("_0"));
  assert.equal(sectionFrame(line, { mode: "fit" }).error, "nofit", "pierce points along one line define no plane");
});

test("true, horizontal and downhole thickness", () => {
  const f = sectionFrame(pierces, { mode: "fit" });
  const th = thicknesses(2 / cosHN, hole, f);
  assert.ok(Math.abs(th.true - 2) < 0.02, `true ${th.true}`);
  assert.ok(Math.abs(th.horizontal - 2 / Math.sin(70 * RAD)) < 0.03, `horizontal ${th.horizontal}`);
  assert.ok(Math.abs(th.downhole - 2 / cosHN) < 1e-12);
  assert.deepEqual(thicknesses(3, null, f), { downhole: 3, true: null, horizontal: null }, "no direction: downhole only");
  assert.deepEqual(thicknesses(0, hole, f), { downhole: 0, true: 0, horizontal: 0 });
});

const t0 = (az) => ({ x: Math.cos(az * RAD), y: -Math.sin(az * RAD) });
test("projected along strike from the first pierce point, at their own elevation; GT = grade x the chosen thickness", () => {
  const f = sectionFrame(pierces, { mode: "azimuth", azimuthDeg: 35 });
  const pts = projectPierces(pierces, f, "true");
  const p = pts.find((q) => q.hole_id === "H3_2");
  assert.ok(Math.abs(p.along - 120) < 1e-6, `along ${p.along}`);
  assert.ok(Math.abs(p.elev - (400 + 60 * dd.z)) < 1e-9);
  // across a typed VERTICAL plane, 'true' is the intercept measured along that plane's horizontal normal: not the dipping vein's own
  const nH = t0(35), across = (2 / cosHN) * Math.abs(hole.x * nH.x + hole.y * nH.y);
  assert.ok(Math.abs(p.thick - across) < 1e-9, `${p.thick} against ${across}`);
  assert.ok(Math.abs(p.thick - 2) > 0.1, "so it differs from the vein's true 2 m: the best-fit plane gives that");
  assert.ok(Math.abs(p.gt - p.grade * p.thick) < 1e-9 && p.grade === 7);
  const down = projectPierces(pierces, f, "downhole");
  assert.ok(Math.abs(down[0].thick - 2 / cosHN) < 1e-9);
  const rows = pierceRows(pts, { gradeLabel: "g/t Au", gtLabel: "m·g/t Au", kind: "true" });
  assert.deepEqual(Object.keys(rows[0]), ["hole_id", "along_strike_m", "elevation_m", "x", "y", "z", "downhole_m", "true_m", "horizontal_m", "thickness_used_true_m", "grade_g_t_Au", "gt_m_g_t_Au"]);
});

test("the grids stop at the pierce points' outline; grade is GT over thickness; round levels and bands", () => {
  const f = sectionFrame(pierces, { mode: "fit" });
  const pts = projectPierces([...pierces, { hole_id: "Z", x: pierces[0].x, y: pierces[0].y, z: pierces[0].z + 5, thicknessM: 0, meanGrade: 0, dir: null }], f, "true");
  const g = sectionGrids(pts, { cell: 5, radius: 80 });
  const h = hull2d(pts.map((q) => [q.along, q.elev]));
  assert.equal(h.length >= 4, true);
  let outside = 0, inside = 0;
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const k = i + g.nx * j; if (Number.isFinite(g.gt[k])) inside++; else outside++; }
  assert.ok(inside > 0 && g.estimated === inside);
  // a node at a pierce point carries its values
  const q = pts.find((r) => r.hole_id === "H4_3"), i = Math.round((q.along - g.x0) / g.cell), j = Math.round((q.elev - g.y0) / g.cell), k = i + g.nx * j;
  assert.ok(Math.abs(g.grade[k] - g.gt[k] / g.thickness[k]) < 1e-9);
  assert.ok(g.grade[k] > 6 && g.grade[k] < 11, `grade ${g.grade[k]} near 9`);
  const lv = contourLevels(g.gt, {});
  assert.ok(lv.length >= 4 && lv.length <= 12, lv.join());
  assert.ok(lv.every((v, m) => m === 0 || Math.abs(v - lv[m - 1] - lv[0]) < 1e-9), "evenly spaced");
  assert.deepEqual(contourLevels([0.3, 1.2, 2.9], { step: 1 }), [1, 2]);
  assert.deepEqual(contourLevels([NaN, 0]), []);
  assert.equal(bandOf(0.5, [1, 2]), 0); assert.equal(bandOf(1, [1, 2]), 1); assert.equal(bandOf(9, [1, 2]), 2);
  assert.equal(rampColours(5).length, 5);
  assert.equal(rampColours(5)[0], "rgb(255,255,204)", "lightest first");
  // the figure: three panels on one frame and scale
  const L = layoutLongSection(g, { width: 1600 });
  assert.equal(L.panels.length, 3);
  assert.ok(L.panels.every((b) => b.w === L.panels[0].w && b.h === L.panels[0].h));
  assert.ok(L.panels[1].y > L.panels[0].y + L.panels[0].h && L.height > L.panels[2].y + L.panels[2].h);
});

test("the figure as a one-page PDF: the JPEG as it is, a valid cross-reference", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const pdf = imagePdf(jpeg, 1600, 1200, { dpi: 160, title: "GT (test)" });
  const text = new TextDecoder("latin1").decode(pdf);
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.match(text, /\/MediaBox \[0 0 720 540\]/);
  assert.match(text, /\/Filter \/DCTDecode \/Length 9/);
  const startxref = Number(/startxref\n(\d+)/.exec(text)[1]);
  assert.equal(text.slice(startxref, startxref + 4), "xref");
  const offs = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offs.forEach((o, k) => assert.equal(text.slice(o, o + `${k + 1} 0 obj`.length), `${k + 1} 0 obj`, `object ${k + 1}`));
  assert.match(text, /\/Title \(GT \\\(test\\\)\)/);
});

test("holeTotals carries each hole's pierce elevation and direction; the modal offers Plan / Long section", () => {
  const t = holeTotals([{ hole_id: "A", from: 10, to: 12, length: 2, grade: 3 }], (h, md) => ({ x: md, y: 0, z: 100 - md }));
  assert.ok(Math.abs(t[0].z - 89) < 1e-9);
  assert.ok(Math.abs(t[0].dir.x - Math.SQRT1_2) < 1e-9 && Math.abs(t[0].dir.z + Math.SQRT1_2) < 1e-9);
  const m = readFileSync(new URL("../src/components/GradeThicknessModal.jsx", import.meta.url), "utf8");
  assert.match(m, /<option value="long">/);
  assert.match(m, /<LongSectionGT /);
});
