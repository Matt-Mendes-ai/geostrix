// TASKS.csv #2517 / #2343 — the section Buffer opened at ±100 m on a 25 m drill grid (eight lines on one plane). The default is now half
// the drill-site spacing measured from the collars (fans from one site count once), until the user types a buffer.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drillSiteSpacing } from "../src/lib/drillSpacing.js";

test("a 25 m grid: spacing 25, buffer 12.5", () => {
  const g = [];
  for (let i = 0; i < 48; i++) for (let j = 0; j < 47; j++) g.push({ x: 500000 + i * 25, y: 7000000 + j * 25 });
  assert.deepEqual(drillSiteSpacing(g), { sites: 2256, spacing: 25, buffer: 12.5 });
});

test("fans from shared sites count once: the spacing between sites, not 0 m", () => {
  const f = [];
  for (let s = 0; s < 40; s++) for (let k = 0; k < 6; k++) f.push({ x: 1000 + (s % 8) * 60 + k * 0.3, y: 2000 + Math.floor(s / 8) * 80 });
  const r = drillSiteSpacing(f);
  assert.equal(r.sites, 40); assert.equal(r.spacing, 60); assert.equal(r.buffer, 30);
});

test("clamped and rounded; too few sites gives none", () => {
  const wide = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }, { x: 1000, y: 1000 }];
  assert.equal(drillSiteSpacing(wide).buffer, 100, "never more than the old 100 m");
  const tight = Array.from({ length: 10 }, (_, i) => ({ x: i * 3, y: 0 }));
  assert.equal(drillSiteSpacing(tight).buffer, 2, "never under 2 m");
  assert.equal(drillSiteSpacing([{ x: 0, y: 0 }, { x: 5, y: 0 }]), null);
  assert.equal(drillSiteSpacing([{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0.2 }]), null, "one site");
  assert.equal(drillSiteSpacing([{ x: NaN, y: 0 }]), null);
});

test("matches a brute-force nearest-neighbour median on scattered collars", () => {
  let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pts = Array.from({ length: 600 }, () => ({ x: rnd() * 3000, y: rnd() * 1500 }));
  const nn = pts.map((p) => Math.min(...pts.filter((q) => q !== p).map((q) => Math.hypot(q.x - p.x, q.y - p.y)))).sort((a, b) => a - b);
  const r = drillSiteSpacing(pts, { siteM: 0.001 });
  assert.ok(Math.abs(r.spacing - nn[Math.floor(nn.length / 2)]) < 1e-9);
});

test("the toolbar sets it until a buffer is typed, and says where it came from", () => {
  const s = readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8");
  assert.match(s, /const spacing = useMemo\(\(\) => drillSiteSpacing\(spacingCollars\), \[spacingCollars\]\);/);
  assert.match(s, /if \(!bufferTyped\.current && spacing\?\.buffer && setSectionCorridor\) setSectionCorridor\(spacing\.buffer\);/);
  assert.match(s, /bufferTyped\.current = true; setSectionCorridor\(/);
  assert.match(s, /half the \{s\} m drill spacing/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["half the {s} m drill spacing"], l);
});
