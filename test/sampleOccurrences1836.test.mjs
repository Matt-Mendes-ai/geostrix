// TASKS.csv #1836 — sample occurrences of one medium, a surface element by default, and the circular warning beside the weights
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the occurrences' medium, the element family on a source change, the circular note in the result and on the posterior", () => {
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(p, /if \(t\.medium && \(s\.medium \|\| ""\) !== t\.medium\) return false;/);
  assert.match(p, /aria-label=\{tr\("Sample medium of the occurrences"\)\}/);
  assert.match(p, /list = source === "collars" \? labElements : source === "samples" \? surfaceElements : null/);
  assert.match(p, /out\.circular = circular;/);
  assert.match(p, /\{result\.circular && <div style=\{\{ color: "var\(--color-warn-text\)", marginTop: 2 \}\}>\{tr\("Circular: the same samples are evidence and occurrences/);
  assert.match(p, /which === "posterior" && result\.circular \? " " \+ tr\("Circular:/);
});
