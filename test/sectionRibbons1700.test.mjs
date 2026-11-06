// TASKS.csv #1700 (review #1645, Copley) — the section window picks which interval layers draw as ribbons (custom layers only
// on request), and the grade labels go through the collision pass
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ribbonLayers } from "../src/lib/sectionLegend.js";

test("ribbonLayers: one entry per interval layer, in first-seen order, custom layers flagged", () => {
  const iv = [
    { hole_id: "A", from: 0, to: 1, layer: "litho", label: "Lithology: VOLC" },
    { hole_id: "A", from: 1, to: 2, layer: "litho", label: "Lithology: RHYL" },
    { hole_id: "A", from: 0, to: 3, layer: "custom:c9", label: "Copley_2023_DH_SWIR_Halo: K-illite" },
    { hole_id: "A", from: 0, to: 3, layer: "alt", label: "Alteration: ARG" },
  ];
  assert.deepEqual(ribbonLayers(iv), [
    { key: "litho", label: "Lithology", custom: false },
    { key: "custom:c9", label: "Copley_2023_DH_SWIR_Halo", custom: true },
    { key: "alt", label: "Alteration", custom: false },
  ]);
  assert.deepEqual(ribbonLayers([]), []);
  assert.deepEqual(ribbonLayers(null), []);
});

test("the window: built-in ribbons on by default, custom layers off, a per-user preference; grade labels in the collision pass", () => {
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /const ribbonHidden = \(k\) => \(ribbonPref\[k\] != null \? !!ribbonPref\[k\] : k\.startsWith\("custom:"\)\);/);
  assert.match(s, /localStorage\.setItem\("geostrix\.sectionRibbons", JSON\.stringify\(next\)\)/);
  assert.match(s, /intervals: rawData\.intervals\.filter\(\(r\) => !ribbonHidden\(r\.layer \|\| "_"\)\)/);
  assert.match(s, /tr\("Ribbons \{n\} of \{m\}"/);
  assert.match(s, /labelledAssays\.has\(row\) && floatLabels\.push\(\{ key: `grade_\$\{i\}`/);
  assert.ok(!/labelledAssays\.has\(row\) && <text/.test(s), "no inline grade label");
  assert.match(s, /\{ x: fs\(16\), y: H \/ 2 \+ fs\(60\), w: fs\(13\), h: fs\(120\) \}/); // the elevation axis title is an obstacle
});
