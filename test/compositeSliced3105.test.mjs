// TASKS.csv #3105 — a whole-field Estimation run's compositing (about 0.6 s on WA iron's 147,891 assays) and its top-composite check (a
// comparator sort of every composite, about 0.35 s) were each one main-thread task. Compositing now runs in slices of holes (the same
// composites, concatenated in compositeDownhole's own order), and the check selects its top 5 % instead of sorting them all.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compositeDownhole } from "../src/lib/geochem.js";
import { compositeDownholeSliced } from "../src/lib/compositeSliced.js";
import { topCompositesWithoutBlocks } from "../src/lib/shellSupport.js";

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const assays = [];
for (let h = 0; h < 120; h++) { const id = `H${String((h * 37) % 120).padStart(3, "0")}`; let d = 0; for (let k = 0; k < 40; k++) { const len = 0.5 + rnd() * 2.5; if (rnd() > 0.1) assays.push({ hole_id: id, from: d, to: d + len, values: rnd() < 0.05 ? {} : { Cu: Math.round(rnd() * 5000) } }); d += len + (rnd() < 0.1 ? 1 : 0); } }
const dom = []; for (let h = 0; h < 120; h++) for (let d = 0; d < 120; d += 15) dom.push({ hole_id: `H${String(h).padStart(3, "0")}`, from: d, to: d + 15, value: (d / 15) % 2 ? "A" : "B" });

test("compositing in slices of holes gives exactly the one-call composites and stats", async () => {
  for (const o of [{ length: 2, minCoverage: 0.5 }, { length: 4, minCoverage: 0.3, capValue: 3000, domainRows: dom }, { length: 1, minCoverage: 0.9 }]) {
    const s1 = {}, s2 = {};
    const one = compositeDownhole(assays, "Cu", "ppm", {}, { ...o, stats: s1 });
    let pieces = 0;
    const sliced = await compositeDownholeSliced(assays, "Cu", "ppm", {}, { ...o, stats: s2 }, { rowsPerSlice: 500, yieldFn: async () => { pieces++; } });
    assert.deepEqual(sliced, one);
    assert.deepEqual(s2, s1);
    assert.ok(pieces >= 5, String(pieces));
  }
  // nothing to composite: the one-call answer
  assert.deepEqual(await compositeDownholeSliced([], "Cu", "ppm", {}, { length: 2 }), compositeDownhole([], "Cu", "ppm", {}, { length: 2 }));
});

test("a cancel between slices stops the compositing", async () => {
  const ac = new AbortController();
  await assert.rejects(compositeDownholeSliced(assays, "Cu", "ppm", {}, { length: 2 }, { rowsPerSlice: 500, signal: ac.signal, yieldFn: async () => ac.abort() }), (e) => e.cancelled === true);
});

test("the top-composite check selects its top 5 %: the same answer as a full sort (ties keep their order)", () => {
  const ref = (composites, cells, cellSize, share = 0.05, min = 3) => { // the top n by a stable full sort, then the same reach test
    const all = composites.filter((c) => Number.isFinite(c.value)).sort((a, b) => b.value - a.value);
    const n = Math.min(all.length, Math.max(min, Math.ceil(share * all.length)));
    const r = Math.sqrt(3) * cellSize;
    return { checked: n, ids: all.slice(0, n).filter((c) => !cells.some((k) => (k.x - c.x) ** 2 + (k.y - c.y) ** 2 + (k.z - c.z) ** 2 <= r * r)).map((c) => `${c.hole_id}:${c.value}`) };
  };
  for (let t = 0; t < 12; t++) {
    const comps = [], cells = [];
    for (let i = 0; i < 1500; i++) comps.push({ x: rnd() * 500, y: rnd() * 500, z: rnd() * 100, value: t % 2 ? Math.floor(rnd() * 4) : rnd() < 0.02 ? NaN : rnd() * 10, hole_id: `H${i}` });
    for (let i = 0; i < 400; i++) cells.push({ x: rnd() * 500, y: rnd() * 500, z: rnd() * 100 });
    const got = topCompositesWithoutBlocks(comps, cells, 10), want = ref(comps, cells, 10);
    assert.equal(got.checked, want.checked);
    assert.deepEqual(got.unsupported.map((u) => `${u.hole_id}:${u.value}`), want.ids);
  }
});

test("wiring: the Estimation run composites in slices", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /intervals = await compositeDownholeSliced\(runAssays, symbol, unit, elementUnits, \{/);
  assert.match(m, /await compositeDownholeSliced\(rows, el, u, elementUnits, \{ length: compositeLength, minCoverage, capValue: mCap, domainRows: domainRowsSel \}, \{ signal: ac\.signal \}\)/);
  assert.ok(!/= compositeDownhole\(runAssays/.test(m));
});
