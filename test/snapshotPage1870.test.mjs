// TASKS.csv #1870 — a section snapshot that would cover a frame on the page (the plan viewport) goes onto a new page of its own, with its
// legend, and the notice says so
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");

test("the overlap test counts frames only (viewports, drill plans, placed sections)", () => {
  assert.match(m, /const frames = elements\.filter\(\(e\) => e\.type === "viewport" \|\| e\.type === "drillplan" \|\| \(e\.type === "image" && e\.worldWidthAtCaptureM != null\)\)\.map\(elementBox\);/);
});

test("an overlapping snapshot goes to a new page with its legend, and the page keeps its own elements", () => {
  assert.match(m, /if \(frames\.length && additions\.some\(overlapsFrame\)\) \{/);
  assert.match(m, /addLayoutPages\(\[\{ name, elements: \[\.\.\.atTop, \.\.\.moved\] \}\]\);/);
  assert.match(m, /The snapshot would have covered a frame on this page, so it is on a new page, \\"\{name\}\\"\./);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(d['The snapshot would have covered a frame on this page, so it is on a new page, "{name}".'], lang);
    assert.ok(d["Snapshot {n}"], lang);
  }
});
