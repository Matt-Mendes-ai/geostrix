// TASKS.csv #3260 (Galore review) — the default classes of a trace element spread over a decade or more between its median and P97.5 are round
// numbers on a log scale between them, so the usual cut-offs fall on class limits; a tighter spread keeps the percentile classes, and a
// major component keeps its round equal steps (#2935).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { logClassLimits, seedBreaks } from "../src/lib/colorRamp.js";

test("the review's copper and gold", () => {
  assert.deepEqual(logClassLimits({ p50: 460, p975: 16600, max: 64700 }), [1000, 3000, 10000]);
  assert.deepEqual(seedBreaks({ min: 0.7, max: 64700, p50: 460, p90: 6590, p975: 16600 }).map((b) => b.max), [1000, 3000, 10000, 64700]);
  assert.deepEqual(logClassLimits({ p50: 0.04, p975: 1.19, max: 20 }), [0.1, 0.3, 1]);
  assert.deepEqual(logClassLimits({ p50: 0.046, p975: 1.66, max: 6.47 }), [0.1, 0.3, 1], "the same copper in %");
});

test("when it applies: a decade or more, two to five limits (1 x 10^k alone over a wide spread)", () => {
  assert.equal(logClassLimits({ p50: 30, p975: 120, max: 400 }), null, "a tight spread: the percentile classes");
  assert.equal(logClassLimits({ p50: 0, p975: 10, max: 20 }), null);
  assert.equal(logClassLimits({ p50: 5, p975: 50 }), null, "no maximum");
  assert.equal(logClassLimits({ p50: 0.002, p975: 9000, max: 20000 }), null, "over five limits even with 1 x 10^k alone: the percentile classes");
  const wide = logClassLimits({ p50: 0.5, p975: 900, max: 2000 });
  assert.ok(wide && wide.length >= 2 && wide.length <= 5 && wide.every((v) => v > 0.5 && v <= 900), JSON.stringify(wide));
});

test("every class its own colour, darker as the grade rises (five or more classes too)", async () => {
  const { labLightness } = await import("../src/lib/colorRamp.js");
  for (const base of ["#c0392b", "#4a9be0", undefined]) {
    const b = seedBreaks({ min: 0.1, max: 19400, p50: 5.1, p90: 59.2, p975: 911.1 }, base);
    const L = b.map((x) => labLightness(x.color));
    assert.equal(new Set(b.map((x) => x.color)).size, b.length, String(base));
    assert.ok(L.every((v, i) => i === 0 || v < L[i - 1]), `${base}: ${L.map((v) => v.toFixed(1)).join(" ")}`);
  }
});

test("the major component rule comes first; the style dialog explains the log limits", () => {
  const fe = seedBreaks({ min: 5, max: 68.5, p50: 35.4, p90: 60, p975: 64, unit: "%" });
  assert.deepEqual(fe.map((b) => b.max), [30, 40, 50, 60, 68.5]);
  const m = fs.readFileSync(new URL("../src/components/AssayStyleModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const logLims = !major \? logClassLimits\(range\) : null;/);
  assert.match(m, /tr\("Default classes: round limits on a log scale between the median \(\{p50\}\) and the 97\.5th percentile \(\{p975\}\): \{limits\} \{unit\}\."/);
});
