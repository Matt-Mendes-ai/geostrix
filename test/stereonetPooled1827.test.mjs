// TASKS.csv #1827 (review #1646, Kodiak) — 'Add as structural trend' was enabled under 'Mixed types: ... do not describe one population':
// one click added the pooled mean of faults, veins and bedding as a trend
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = readFileSync(new URL("../src/components/StereonetModal.jsx", import.meta.url), "utf8");

test("the button is disabled while several structure types are pooled, the same condition as the 'Mixed types' warning", () => {
  assert.match(m, /const pooledTypes = typeFilter === "all" && types\.length > 1;/);
  assert.match(m, /\{typeFilter === "all" && types\.length > 1 && <div style=\{\{ marginBottom: 3, color: "#8a5a00" \}\}>\{tr\("Mixed types:/);
  assert.match(m, /disabled=\{isGirdle \|\| pooledTypes\}/);
  assert.match(m, /title=\{pooledTypes \? tr\("Disabled: this mean pools \{n\} structure types/);
});
