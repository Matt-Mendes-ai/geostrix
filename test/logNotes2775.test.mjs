// TASKS.csv #2775 (split from #2432) — Geophysics > Downhole logs shows the chosen log's layer notes (what the import left out, where readings
// sit) under its readings line, as the 3D View's custom-layer row does (#2432); the notes are English project text, wrapped in 'Layer notes: …'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the pane reads the custom layer's notes and shows them under the readings line", () => {
  const src = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(src, /const layerNotes = source\?\.layerId != null \? String\(customLayers\.find\(\(c\) => c\.id === source\.layerId\)\?\.notes \|\| ""\)\.trim\(\) : "";/);
  assert.match(src, /\{layerNotes && <div style=\{\{ \.\.\.note, color: "var\(--color-text-muted\)", whiteSpace: "pre-wrap" \}\}>\{tr\("Layer notes: \{v\}", \{ v: layerNotes \}\)\}<\/div>\}/);
  const i = src.indexOf("{layerNotes && <div"), j = src.indexOf("{overPct > 0 && <div"), k = src.indexOf('{data && <div style={note}>{tr(source?.binM');
  assert.ok(k > 0 && i > k && j > i, "between the readings line and the over-100 % warning");
  for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"))["Layer notes: {v}"], lang);
});
