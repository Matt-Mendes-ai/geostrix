// TASKS.csv #2949 (review #2876, WA iron) — Targeting's drill-site spacing compared every site with every other (2.8-4.7 s at 6,390 collars,
// on every open of Evidence overlay and Undrilled zones and on each distance card) and its fixed 25 m pad joined the holes of a dense
// pattern into multi-hole sites ('typically 27 m apart' on a 23 m pattern). It is grid-hashed now, the pad follows the drilling, and the
// result is kept per collars array.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { medianSiteSpacing, drilledSiteSpacing } from "../src/lib/evidenceSources.js";

const grid = (g, n = 40) => { const c = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c.push({ hole_id: `H${i}_${j}`, x: i * g, y: j * g }); return c; };

test("#2949 a dense pattern reads its own spacing, not the 25 m pad's", () => {
  for (const g of [4, 5, 10, 23, 25]) assert.ok(Math.abs(medianSiteSpacing(grid(g)) - g) < 0.01, `${g} m grid: ${medianSiteSpacing(grid(g))}`);
  // a 23 m pattern with some twins 2.5 m off: still 23 m
  const twins = grid(23, 50); for (let k = 0; k < twins.length; k += 15) twins.push({ hole_id: `T${k}`, x: twins[k].x + 2.5, y: twins[k].y });
  assert.ok(Math.abs(medianSiteSpacing(twins) - 23) < 0.01);
});

test("#2949 collars on a pad still count once (#1451); one pad has no spacing; two sites are their distance", () => {
  const pads = []; for (let i = 0; i < 6; i++) for (let k = 0; k < 3; k++) pads.push({ x: i * 150 + k * 1.3, y: k * 0.8 });
  assert.equal(medianSiteSpacing(pads), 150);
  assert.equal(medianSiteSpacing([{ x: 0, y: 0 }, { x: 2, y: 1 }]), null);
  assert.equal(medianSiteSpacing([{ x: 0, y: 0 }, { x: 100, y: 0 }]), 100);
  assert.equal(medianSiteSpacing([]), null);
  assert.equal(medianSiteSpacing(grid(10), 25) > 10, true, "a padM given is used as given");
});

test("#2949 kept per collars array; the drilled one leaves proposed collars out (#2097)", () => {
  const c = grid(23, 80); // 6,400 collars
  const t0 = performance.now(); const a = drilledSiteSpacing(c); const first = performance.now() - t0;
  const t1 = performance.now(); const b = drilledSiteSpacing(c); const again = performance.now() - t1;
  assert.equal(a, b); assert.ok(Math.abs(a - 23) < 0.01);
  assert.ok(again < 50, `the second call is a look-up (${again} ms; first ${first} ms)`);
  const withProposed = [...grid(100, 10), ...grid(5, 10).map((p) => ({ ...p, x: p.x + 2000, attrs: { status: "proposed" } }))];
  assert.equal(drilledSiteSpacing(withProposed), 100);
});

test("#2949 no pairwise loop left; the panes take the kept measure once, not per card", () => {
  const lib = fs.readFileSync(new URL("../src/lib/evidenceSources.js", import.meta.url), "utf8");
  const fn = lib.slice(lib.indexOf("export function medianSiteSpacing"), lib.indexOf("export function drilledSiteSpacing"));
  assert.ok(!/sites\.(filter|map)\(/.test(fn) && !/sites\.find\(/.test(fn), "no site-by-site scan");
  for (const f of ["EvidenceOverlayPane.jsx", "UndrilledZonesPane.jsx"]) {
    const s = fs.readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8");
    assert.ok(s.includes("const siteSpacing = useMemo(() => drilledSiteSpacing(collars), [collars]);"), f);
    assert.ok(!s.includes("medianSiteSpacing("), `${f} measures nowhere else`);
  }
});
