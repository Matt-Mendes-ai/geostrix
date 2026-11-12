// TASKS.csv #2736 (split from #2596) — 'Unsampled metres … barren' filled only the gaps of holes that carry the element. Holes drilled but
// never assayed for it can now be read as barren too, over their whole length: the user's tick, off by default, said in the result.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fillUnsampled, unassayedHoles } from "../src/lib/unsampledFill.js";

const collars = [{ hole_id: "A", max_depth: 50 }, { hole_id: "B", max_depth: 40 }, { hole_id: "C", max_depth: 0 }, { hole_id: "D" }];
const assays = [{ hole_id: "A", from: 10, to: 20, values: { Cu: 500 } }, { hole_id: "B", from: 0, to: 5, values: { Au: 1 } }];

test("the holes never assayed for the element, with a length", () => {
  assert.deepEqual(unassayedHoles(assays, collars, "Cu", "ppm", { Cu: "ppm" }).map((h) => [h.hole_id, h.end, h.endFrom]), [["B", 40, "collar"]], "B has Au only; C and D have no length");
});

test("with no collar length, the deepest logged interval gives it (WA exports carry no max_depth)", async () => {
  const { loggedEndsOf } = await import("../src/lib/unsampledFill.js");
  const ends = loggedEndsOf({ litho: [{ hole_id: "D", from: 0, to: 60 }, { hole_id: "D", from: 60, to: 84 }], alt: [{ hole_id: "C", from: 0, to: 12 }] });
  assert.equal(ends.get("D"), 84);
  const h = unassayedHoles(assays, collars, "Cu", "ppm", { Cu: "ppm" }, { loggedEnds: ends });
  assert.deepEqual(h.map((x) => [x.hole_id, x.end, x.endFrom]), [["B", 40, "collar"], ["C", 12, "logs"], ["D", 84, "logs"]]);
  const f = fillUnsampled(assays, collars, "Cu", "ppm", { Cu: "ppm" }, 5, { alsoUnassayed: true, loggedEnds: ends });
  assert.equal(f.unassayedHoles, 3);
  assert.equal(f.unassayedM, 136);
});

test("off by default; with the tick, those holes too, over their whole length", () => {
  const off = fillUnsampled(assays, collars, "Cu", "ppm", { Cu: "ppm" }, 5);
  assert.equal(off.filledM, 40, "A's gaps: 0-10 and 20-50");
  assert.equal(off.unassayedHoles, undefined);
  assert.ok(!off.fills.some((f) => f.hole_id === "B"));
  const on = fillUnsampled(assays, collars, "Cu", "ppm", { Cu: "ppm" }, 5, { alsoUnassayed: true });
  assert.equal(on.unassayedHoles, 1);
  assert.equal(on.unassayedM, 40);
  const b = on.fills.find((f) => f.hole_id === "B");
  assert.deepEqual([b.from, b.to, b.values.Cu, b.unassayedHole], [0, 40, 5, true]);
  assert.equal(on.filledM, 40, "filledM stays the sampled holes' gaps; the whole-hole fills are counted apart");
});

test("the choice, its run and its result line", () => {
  const u = readFileSync(new URL("../src/components/UnsampledChoice.jsx", import.meta.url), "utf8");
  assert.match(u, /fillUnsampled\(rows, collars, symbol, unit, elementUnits, Number\(value\), \{ alsoUnassayed: !!saved\?\.alsoUnassayed, loggedEnds: saved\?\.alsoUnassayed && logCtx\?\.layers \? loggedEndsOf\(logCtx\.layers\) : null \}\)/);
  assert.match(u, /mode === "barren" && unassayed\.length > 0 && <label/);
  assert.match(u, /unsampledUnassayedHoles: filled\.unassayedHoles/);
  assert.match(u, /"Also \{k\} hole\(s\) never assayed for \{symbol\}, over their whole length \(\{m\} m\)\."/);
});
