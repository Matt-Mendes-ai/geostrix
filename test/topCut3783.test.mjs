// TASKS.csv #3783 — Grade-tonnage names the top cut the estimate was made under (and the metal it removed)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { topCutOf, topCutLine } from "../src/lib/topCutNote.js";

const base = { tool: "Grade estimation", element: "Au", unit: "ppm" };
test("a capped estimate: the cap, the samples touched and the metal removed", () => {
  const p = { ...base, capValue: 2.84, capAudit: { capValue: 2.84, nSamples: 3778, nCapped: 62, pctMetalRemoved: 66.1 } };
  const t = topCutOf(p);
  assert.equal(t.kind, "capped"); assert.equal(t.heavy, true); assert.equal(t.pctMetal, 66.1);
  assert.equal(topCutLine(p, "g/t"), "Top cut: grades above 2.84 g/t were capped before estimating (62 of 3778 samples, 66.1% of the metal removed)");
  const light = topCutOf({ ...base, capValue: 30, capAudit: { nSamples: 3778, nCapped: 11, pctMetalRemoved: 8.2 } });
  assert.equal(light.heavy, false);
});
test("an uncapped estimate says so; a model with no estimate record says nothing", () => {
  assert.deepEqual(topCutOf({ ...base, capValue: null }), { kind: "uncapped" });
  assert.match(topCutLine({ ...base, capValue: null }), /^Top cut: none/);
  assert.equal(topCutOf({ source: "import" }), null); assert.equal(topCutOf(undefined), null);
});
test("wired: the modal's note and header line, and the cap advice that no longer points at the cap that removes most of the metal", () => {
  const g = fs.readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.match(g, /topCut && <div role="note"/); assert.match(g, /topCutLine\(model\.params, unitL\)/);
  const e = fs.readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(e, /const p99Heavy = p99Removes != null && p99Removes > CAP_WARN_PCT/);
  assert.match(e, /the usual 97\.5th–99th percentile caps remove \{pct\}% of the metal here/);
});
