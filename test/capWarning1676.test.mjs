// TASKS.csv #1676 — a cap removing much of the metal is said in Grade stats and Compositing alike, naming a coherent zone
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capAboveZone, capWarningText, CAP_WARN_PCT } from "../src/lib/capWarning.js";

// Copley-like: background in nine holes, a 0.8-1.9 % Cu run in one hole from 34 to 57 m
const samples = [];
for (let h = 1; h <= 9; h++) for (let m = 0; m < 200; m += 2) samples.push({ hole_id: `COP-23-000${h}`, from: m, to: m + 2, value: 50 + ((m * 7 + h * 13) % 300) });
for (let m = 34; m < 57; m += 1.5) samples.push({ hole_id: "COP-23-0001", from: m + 200, to: m + 201.5, value: 8000 + m * 200 });
samples.forEach((s) => { if (s.hole_id === "COP-23-0001" && s.from >= 234) { s.from -= 200; s.to -= 200; } });
const hi = samples.filter((s) => s.value > 5000);
hi.forEach((s) => { s.from = Math.round(s.from * 10) / 10; });

test("the values above the cap in one run down one hole are a coherent zone", () => {
  const z = capAboveZone(samples, 2162.5);
  assert.equal(z.above, hi.length);
  assert.equal(z.top.hole, "COP-23-0001");
  assert.ok(z.top.from >= 33.9 && z.top.from <= 34.1 && z.top.to >= 56 && z.top.to <= 58, `${z.top.from}-${z.top.to}`);
  assert.ok(z.coherent);
  const t = capWarningText(41.2, z);
  assert.match(t, /removes 41\.2% of the metal/);
  assert.match(t, /coherent zone \(COP-23-0001 34–5\d(\.\d)? m, \d+ of \d+ samples\)/);
  assert.match(t, /Domain the mineralized zone and cap within it/);
});

test("scattered highs are not a zone; small caps say nothing", () => {
  const scattered = [];
  for (let h = 0; h < 10; h++) scattered.push({ hole_id: `H${h}`, from: h * 13, to: h * 13 + 1, value: 9000 });
  const z = capAboveZone(scattered, 1000);
  assert.equal(z.coherent, false);
  assert.match(capWarningText(15, z), /separate population/);
  assert.equal(capWarningText(CAP_WARN_PCT, z), "");
  assert.equal(capWarningText(4.2, null), "");
  assert.equal(capAboveZone([], 1).top, null);
});

test("both tools use it", () => {
  const g = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  const c = readFileSync(new URL("../src/components/CapAuditHint.jsx", import.meta.url), "utf8");
  assert.ok(g.includes("capWarningText(capFx.pctMetalRemoved"));
  assert.ok(c.includes("capWarningText(audit.pctMetalRemoved"));
  assert.ok(!c.includes("> 20"), "the old 20 % threshold is gone");
});
