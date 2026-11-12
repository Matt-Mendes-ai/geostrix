// TASKS.csv #2971 (WA iron review) — the stereonet zoomed to flat-lying data, with rings of equal dip
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { netZoom, poleRadiusForDip, dipAtRadius } from "../src/lib/stereonetZoom.js";
import { projectPole } from "../src/lib/stereonet.js";

test("the radius of a dip's pole matches projectPole, and back", () => {
  for (const proj of ["equalArea", "equalAngle"]) for (const d of [2, 8, 30, 60]) {
    const p = projectPole(123, d, proj);
    assert.ok(Math.abs(Math.hypot(p.x, p.y) - poleRadiusForDip(d, proj)) < 1e-9, `${proj} ${d}`);
    assert.ok(Math.abs(dipAtRadius(poleRadiusForDip(d, proj), proj) - d) < 1e-9);
  }
});

test("30 flat beds (2-8°): the farthest pole at 80 % of the radius, rings every 2°; spread data or no data: no zoom", () => {
  const pts = Array.from({ length: 30 }, (_, i) => projectPole((i * 13) % 360, 2 + (i % 7), "equalArea"));
  const z = netZoom(pts, "equalArea");
  const far = Math.max(...pts.map((p) => Math.hypot(p.x, p.y)));
  assert.ok(Math.abs(far * z.k - 0.8) < 1e-9);
  assert.equal(z.edgeDip, 10);
  assert.deepEqual(z.rings.map((r) => r.dip), [2, 4, 6, 8]);
  assert.equal(netZoom([projectPole(0, 70, "equalArea")], "equalArea"), null);
  assert.equal(netZoom([], "equalArea"), null);
  assert.ok(netZoom([{ x: 0, y: 0 }]).k <= 20, "all horizontal: capped");
});

test("the modal: the toggle, the scaled net, clipped data, the caption, and where an outcrop pole is", () => {
  const p = readFileSync(new URL("../src/components/StereonetModal.jsx", import.meta.url), "utf8");
  assert.match(p, /const toSvg = \(p\) => \(\{ x: CX \+ p\.x \* R \* K, y: CY - p\.y \* R \* K \}\)/);
  assert.match(p, /<g clipPath=\{zoom \? "url\(#stereonet-zoom-clip\)" : undefined\}>/);
  assert.match(p, /tr\("Zoomed: the edge of the net is a dip of \{d\}°", \{ d: zoom\.edgeDip \}\)/);
  assert.match(p, /\{tr\("Zoom to the data"\)\}/);
  assert.match(p, /p\.outcrop && Number\.isFinite\(p\.x\)/);
});
