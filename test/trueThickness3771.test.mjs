// TASKS.csv #3771 (Scottie Gold review) — 'Thickness between top and base' on a steep pair: the thickness normal to the surfaces, not the vertical one (about four times as large for two
// parallel walls dipping 75°). Synthetic walls; the base's seeding and the stale note are pinned by wiring.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { thicknessBetween, STEEP_DIP_DEG } from "../src/lib/stackOrder.js";

// a plane dipping `dip` degrees towards +x (z falls as x rises), as a grid mesh over x 0..200, y 0..200, shifted `offsetM` perpendicular to itself
function wall(dipDeg, offsetM) {
  const d = (dipDeg * Math.PI) / 180, slope = Math.tan(d), n = 41, positions = [], indices = [];
  // the plane z = c - slope * x, c raised so that the perpendicular distance between the two walls is offsetM: vertical shift = offsetM / cos(dip)
  const c = 500 + offsetM / Math.cos(d);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 200, y = (j / (n - 1)) * 200; positions.push(x, y, c - slope * x); }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, e = a + n, f = e + 1; indices.push(a, b, e, b, f, e); }
  return { positions: Float64Array.from(positions), indices: Uint32Array.from(indices) };
}

test("two parallel walls dipping 75° and 10 m apart: the true thickness is 10 m, the vertical one about four times that", () => {
  const top = wall(75, 10), base = wall(75, 0); // the top is 10 m above the base along the normal
  const r = thicknessBetween(top, base, { n: 60 });
  assert.ok(r.dipDeg > 70 && r.dipDeg < 80, `dip ${r.dipDeg}`);
  assert.ok(r.dipDeg >= STEEP_DIP_DEG);
  assert.ok(Math.abs(r.mean - 10 / Math.cos((75 * Math.PI) / 180)) < 0.5, `vertical ${r.mean}`);
  assert.ok(Math.abs(r.true.mean - 10) < 0.7, `true ${r.true.mean}`);
  assert.ok(r.mean > 3.5 * r.true.mean, "the vertical thickness overstates it about four times");
});

test("a gently dipping pair: the true thickness is only a little under the vertical, and the pair is not steep", () => {
  const r = thicknessBetween(wall(10, 5), wall(10, 0), { n: 60 });
  assert.ok(r.dipDeg < STEEP_DIP_DEG);
  assert.ok(r.true.mean < r.mean && r.true.mean > 0.97 * r.mean);
});

test("crossing surfaces keep their negative share; no overlap gives null", () => {
  const a = wall(60, 0), b = wall(60, -8);
  assert.ok(thicknessBetween(b, a, { n: 40 }).negativePct > 90, "a top below its base is negative everywhere");
  assert.equal(thicknessBetween({ positions: Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: Uint32Array.from([0, 1, 2]) }, { positions: Float64Array.from([50, 50, 0, 51, 50, 0, 50, 51, 0]), indices: Uint32Array.from([0, 1, 2]) }, { n: 10 }), null);
});

test("wiring: the panel says true thickness for a steep pair, seeds the bases of a Lower contact and drops another surface's note", () => {
  const p = readFileSync(new URL("../src/components/ExplicitSurfacePanel.jsx", import.meta.url), "utf8");
  assert.match(p, /const steep = r\.true && r\.dipDeg != null && r\.dipDeg >= STEEP_DIP_DEG;/);
  assert.match(p, /measured normal to the surfaces \(they dip about \{d\}°; the vertical thickness is \{v\} m on average\)/);
  assert.match(p, /const seedBases = \(\) => \{/);
  assert.match(p, /contactOf\(def\) === "lower" && seedInfo\.tops\.some\(\(t\) => Number\.isFinite\(t\.end\)/);
  assert.match(p, /useEffect\(\(\) => \{ setSeedNote\(null\); \}, \[def\?\.id\]\);/);
  assert.match(readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8"), /end: r\.to \/\* #3771 — the base of the same run \*\//);
});
