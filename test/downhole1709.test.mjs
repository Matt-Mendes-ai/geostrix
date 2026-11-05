// TASKS.csv #1709 (review #1645, Copley) — downhole readings imported as a point survey are told from surface stations
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { downholeLikeness } from "../src/lib/downholeLikeness.js";

const collars = [{ hole_id: "A", x: 0, y: 0, z: 900 }, { hole_id: "B", x: 600, y: 0, z: 860 }];
// readings every 2 m down two 60 deg holes, 0-280 m: plan within 140 m of the collar, z down to 657 m
const downhole = [];
for (const c of collars) for (let d = 0; d <= 280; d += 2) downhole.push({ x: c.x + d * 0.5, y: c.y, z: c.z - d * 0.866, value: 1 });
// a ground survey on a 10 % hillside between the collars: z follows the slope, 50 m stations
const surface = [];
for (let x = -200; x <= 800; x += 50) for (let y = -200; y <= 200; y += 50) surface.push({ x, y, z: 900 - 0.1 * (x + 200) + 0.05 * y, value: 1 });

test("#1709 readings down the holes are downhole; stations on a hillside are not (nearest collar as the ground)", () => {
  const d = downholeLikeness(downhole, collars);
  assert.ok(d.isDownhole && d.share > 0.9 && d.medianDropM > 100 && d.maxDropM > 240, JSON.stringify(d));
  assert.equal(d.withZ, downhole.length);
  const s = downholeLikeness(surface, collars);
  assert.ok(!s.isDownhole, JSON.stringify(s)); // a slope puts some stations below the nearest collar, but not most by 20 m
  assert.ok(s.share < 0.5 || s.medianDropM < 20);
});

test("#1709 with a terrain the ground is the terrain; no elevations or nothing to compare with gives null", () => {
  const groundAt = (x, y) => 900 - 0.1 * (x + 200) + 0.05 * y;
  const s = downholeLikeness(surface, [], groundAt);
  assert.ok(s && !s.isDownhole && s.below === 0, JSON.stringify(s));
  const d = downholeLikeness(downhole, [], groundAt);
  assert.ok(d.isDownhole, JSON.stringify(d));
  assert.equal(downholeLikeness(surface.map(({ z, ...p }) => p), collars), null, "no elevations");
  assert.equal(downholeLikeness(surface, [], null), null, "no collars, no terrain");
  assert.equal(downholeLikeness([], collars), null);
});

test("#1709 the import says so, the inversion refuses, and the method list has a downhole label", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.ok(g.includes("downholeLikeness(good, collars") && g.includes("These look like downhole readings"));
  const inv = readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8");
  assert.ok(inv.includes("downholeLikeness(rows, collars") && inv.includes("not survey stations"));
  const m = readFileSync(new URL("../src/lib/geophysSurveys.js", import.meta.url), "utf8");
  assert.ok(m.includes("magsus_downhole"));
});
