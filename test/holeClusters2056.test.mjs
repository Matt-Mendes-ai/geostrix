// TASKS.csv #2056 (review #2013, Woodjam) — the default model area spanned three clusters of holes 3-5 km apart (one district blob) and nothing
// said so. lib/holeClusters.js finds the clusters (a gap over 5 x the hole spacing); the Model area offers one cluster at a time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeClusters, onlyTheseHoles } from "../src/lib/holeClusters.js";

let s = 2056; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const cluster = (name, cx, cy, n, step) => Array.from({ length: n }, (_, i) => ({ hole_id: `${name}-${String(i).padStart(2, "0")}`, x: cx + (i % 3) * step + rnd() * 20, y: cy + Math.floor(i / 3) * step + rnd() * 20 }));

test("three prospects kilometres apart are three clusters; a regular grid is one", () => {
  const holes = [...cluster("DH", 0, 0, 3, 150), ...cluster("SE", 4000, 1000, 3, 150), ...cluster("MT", 2000, 5000, 2, 150)];
  const r = holeClusters(holes);
  assert.equal(r.clusters.length, 3, JSON.stringify(r.clusters.map((c) => c.ids)));
  assert.deepEqual(r.clusters.map((c) => c.n), [3, 3, 2]);
  assert.ok(r.clusters.every((c) => new Set(c.ids.map((id) => id.slice(0, 2))).size === 1), "each cluster one prospect");
  const grid = []; for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) grid.push({ hole_id: `G${i}_${j}`, x: i * 50, y: j * 50 });
  assert.equal(holeClusters(grid).clusters.length, 1);
  assert.equal(holeClusters(holes.slice(0, 2)), null, "too few holes to say");
});

test("fans from one pad are one site; numeric hole ids sort", () => {
  const fans = [...[0, 1, 2].map((k) => ({ hole_id: k + 1, x: 0, y: 0 })), ...[0, 1, 2].map((k) => ({ hole_id: k + 10, x: 100, y: 0 })), { hole_id: 99, x: 200, y: 0 }, { hole_id: 50, x: 9000, y: 0 }];
  const r = holeClusters(fans);
  assert.equal(r.clusters.length, 2);
  assert.deepEqual(r.clusters[1].ids, [50]);
});

test("'Only these' checks one cluster's holes and unchecks the rest; the pane offers it per cluster", () => {
  const c = [{ hole_id: "A" }, { hole_id: "B" }, { hole_id: "C" }];
  assert.deepEqual(onlyTheseHoles(c, ["A", "C"]), { A: true, B: false, C: true });
  const m = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(m, /const areaClusters = useMemo\(\(\) => holeClusters\(loggedInArea\), \[loggedInArea\]\);/);
  assert.match(m, /onClick=\{\(\) => \{ setVisibleHoles\(onlyTheseHoles\(collars, c\.ids\)\); setModelArea\("checked"\); \}\}/);
  assert.match(m, /const clusterNote = \(\) => \(areaClusters && areaClusters\.clusters\.length > 1 \? \(<div role="note"/); // #3268: a render function, also in the Implicit and Stack panes
});
