// TASKS.csv #630 — georeferencing vertical (cross-section) images.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionLine, alongDistance, fitSectionTransform, sectionResiduals, sectionImageCorners, sectionFitSummary } from "../src/lib/sectionGeoref.js";

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

// a NE-trending section, A = (1000, 2000) to B = (1600, 2800): length 1000 m, azimuth ~36.87°
const line = sectionLine({ x: 1000, y: 2000 }, { x: 1600, y: 2800 });

test("#630 section line and horizontal readings", () => {
  near(line.length, 1000);
  near(line.azimuth, 36.8698976, 1e-6);
  near(alongDistance(line, "distance", 250), 250);
  near(alongDistance(line, "easting", 1300), 500); // half-way in easting = half-way along
  near(alongDistance(line, "northing", 2400), 500);
  const ns = sectionLine({ x: 500, y: 0 }, { x: 500, y: 900 });
  assert.throws(() => alongDistance(ns, "easting", 500), /north–south/);
  near(alongDistance(ns, "northing", 300), 300);
  assert.throws(() => sectionLine({ x: 1, y: 1 }, { x: 1, y: 1 }), /same/);
});

test("#630 two grid corners: scale + offset, corners land on the section plane", () => {
  // image 1000 x 500 px: x px 0..1000 = distance 0..1000 m, y px 0..500 = elevation 800..300 m
  const fit = fitSectionTransform([
    { px: 100, py: 50, hKind: "distance", h: 100, z: 750 },
    { px: 900, py: 450, hKind: "easting", h: 1000 + 0.6 * 900, z: 350 },
  ], line);
  assert.equal(fit.kind, "scale");
  sectionResiduals(fit).forEach((r) => near(r.error, 0, 1e-9));
  const c = sectionImageCorners(fit, line, 1000, 500);
  near(c[0][0], 1000); near(c[0][1], 2000); near(c[0][2], 800); // top-left at A, 800 m
  near(c[1][0], 1600); near(c[1][1], 2800); near(c[1][2], 800); // top-right at B
  near(c[2][2], 300); near(c[3][2], 300);
  const s = sectionFitSummary(fit, 1000, 500);
  near(s.fromDist, 0); near(s.toDist, 1000); near(s.zTop, 800); near(s.zBottom, 300);
  assert.equal(s.upsideDown, false); assert.equal(s.mirrored, false);
  assert.throws(() => fitSectionTransform([{ px: 1, py: 1, hKind: "distance", h: 0, z: 0 }, { px: 1, py: 9, hKind: "distance", h: 5, z: 9 }], line), /differ both/);
});

test("#630 three or more points: affine handles a rotated scan; residuals expose a typo", () => {
  // a scan rotated 2°: build pixels from known (d, z) by the inverse of a rotation + scale
  const th = (2 * Math.PI) / 180, s = 2; // 2 m per pixel
  const toPx = (d, z) => { const u = d / s, v = (800 - z) / s; return { px: u * Math.cos(th) - v * Math.sin(th), py: u * Math.sin(th) + v * Math.cos(th) }; };
  const truth = [[0, 800], [1000, 800], [1000, 300], [0, 300], [500, 550]];
  const pts = truth.map(([d, z]) => ({ ...toPx(d, z), hKind: "distance", h: d, z }));
  const fit = fitSectionTransform(pts, line);
  assert.equal(fit.kind, "affine");
  sectionResiduals(fit).forEach((r) => near(r.error, 0, 1e-6));
  const bad = fitSectionTransform(pts.map((p, i) => (i === 4 ? { ...p, z: 650 } : p)), line); // 100 m typo
  const errs = sectionResiduals(bad).map((r) => r.error);
  assert.equal(errs.indexOf(Math.max(...errs)), 4, "the mistyped point has the largest residual");
});

test("#631 a section image is matched to a cross-section on (or along) its line, not to others", async () => {
  const { sectionImagesOnSection } = await import("../src/lib/sectionGeoref.js");
  const fit = fitSectionTransform([
    { px: 100, py: 50, hKind: "distance", h: 100, z: 750 },
    { px: 900, py: 450, hKind: "distance", h: 900, z: 350 },
  ], line);
  const im = { id: "a", name: "Old section", corners: sectionImageCorners(fit, line, 1000, 500), opacity: 0.8 };
  // same line
  const [m] = sectionImagesOnSection([im], { ax: 1000, ay: 2000, bx: 1600, by: 2800 }, 25);
  near(m.tl[0], 0); near(m.tl[1], 800); near(m.tr[0], 1000); near(m.bl[1], 300); near(m.offset, 0, 1e-6);
  // drawn the other way round (B -> A) and starting 100 m further out: distances flip, still matched
  const [r] = sectionImagesOnSection([im], { ax: 1660, ay: 2880, bx: 1000, by: 2000 }, 25);
  near(r.tl[0], 1100); near(r.tr[0], 100);
  // a parallel section 50 m away, a crossing section, or a hidden image: not matched
  assert.equal(sectionImagesOnSection([im], { ax: 1040, ay: 1970, bx: 1640, by: 2770 }, 25).length, 0);
  assert.equal(sectionImagesOnSection([im], { ax: 1000, ay: 2800, bx: 1600, by: 2000 }, 25).length, 0);
  assert.equal(sectionImagesOnSection([{ ...im, visible: false }], { ax: 1000, ay: 2000, bx: 1600, by: 2800 }, 25).length, 0);
});
