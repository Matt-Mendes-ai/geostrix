// TASKS.csv #2752 — each tool says which samples it counts (the diagram filter: every sample; Grade stats: those with the element)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the diagram filter and Grade stats say what they count", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /tr\("Counts every sample of the chosen source, with or without the plotted elements; a sample takes the code it overlaps most\."\)/);
  const s = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(s, /tr\("n counts the samples with a \{symbol\} result, each metre once; a sample takes the domain code it overlaps most\.", \{ symbol \}\)/);
  const t = readFileSync(new URL("../src/components/ThresholdToolkit.jsx", import.meta.url), "utf8");
  assert.match(t, /Each assay counts by its length/, "Thresholds already says it");
});
