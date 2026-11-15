// TASKS.csv #3521 / #3522 (from #3164) — the block calculator says how far it is (a fraction at each slice), and offers to colour the new
// model as its first input when the new value is in the same unit (that input's ramp, range and stops). Synthetic blocks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blockCalc, BLOCK_CALC_SLICE } from "../src/lib/blockCalc.js";

function model(n, valueOf) {
  const cells = [];
  for (let i = 0; i < n; i++) cells.push({ x: 500005 + (i % 100) * 10, y: 6200005 + Math.floor(i / 100) % 100 * 10, z: 102.5 + Math.floor(i / 10000) * 5, dx: 10, dy: 10, dz: 5, value: valueOf(i) });
  return { name: "m", cells, params: { element: "Fe", unit: "%" } };
}

test("#3521: progress fractions at each slice, rising, within 0..1; none for a small model", async () => {
  const A = model(30000, (i) => 50 + (i % 7)), B = model(30000, (i) => 4 + (i % 3));
  const seen = [];
  const r = await blockCalc([{ var: "Fe", model: A }, { var: "LOI", model: B }], "Fe / (1 - LOI / 100)", { onProgress: (f) => seen.push(f) });
  assert.equal(r.blocks, 30000);
  assert.ok(seen.length >= Math.floor(90000 / BLOCK_CALC_SLICE) - 1, `${seen.length} reports`);
  assert.ok(seen.every((f, i) => f >= 0 && f <= 1 && (i === 0 || f >= seen[i - 1])), "rising, within 0..1");
  assert.ok(seen.at(-1) > 0.9, `the last report near the end: ${seen.at(-1)}`);
  const few = [];
  await blockCalc([{ var: "Fe", model: model(100, () => 1) }], "Fe * 2", { onProgress: (f) => few.push(f) });
  assert.deepEqual(few, [], "under one slice: nothing to report");
});

test("#3522 / #3521 wiring: the option only with the same unit, what it copies, the progress label; the strings in the four locales", () => {
  const m = readFileSync(new URL("../src/components/BlockCalculatorModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const first = picked\[0\]\?\.model, sameUnit = !!\(first\?\.stops\?\.length && first\.params\?\.unit && unit\.trim\(\) && first\.params\.unit === unit\.trim\(\)\);/);
  assert.match(m, /const rampLike = sameUnit && likeFirst \? \{ min: first\.min, max: first\.max, colorMode: first\.colorMode, stops: first\.stops \} : null;/);
  assert.match(m, /\{sameUnit && \(/, "offered only with the same unit");
  assert.match(m, /const \[likeFirst, setLikeFirst\] = useState\(false\);/, "off by default: the grade ramp over its own values");
  assert.match(m, /onProgress: setProgress \/\* #3521 \*\//);
  assert.match(m, /progress != null \? tr\("Calculating… \{p\} %", \{ p: Math\.round\(progress \* 100\) \}\) : tr\("Calculating…"\)/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Calculating… {p} %", "Colour it as {model} (the same ramp and range)"]) assert.ok(d[k], `${l}: ${k}`);
  }
});
