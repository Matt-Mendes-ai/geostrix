// TASKS.csv #1637 — a section's ribbons named; long descriptions kept out of its legend
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ribbonOrder, groupSectionLegend, LONG_VALUE } from "../src/lib/sectionLegend.js";

test("ribbon order, left to right, from first-seen offsets 0, +1, -1, +2, -2 (positive is left on a descending trace)", () => {
  const iv = ["litho", "alt", "vein", "structzone", "mnlgy"].map((layer, i) => ({ layer, label: `${["Lithology", "Alteration", "Veins", "Structural zones", "Mineralization"][i]}: X` }));
  assert.deepEqual(ribbonOrder([...iv, ...iv]), ["Structural zones", "Alteration", "Lithology", "Veins", "Mineralization"]);
  assert.deepEqual(ribbonOrder([iv[0]]), ["Lithology"]);
});

test("legend: headings say which ribbon; long values left out with a note", () => {
  const longText = "pyrite disseminated in quartz-carbonate veinlets with minor chalcopyrite and sphalerite along fractures";
  assert.ok(longText.length > LONG_VALUE);
  const rows = groupSectionLegend([["Lithology: Andesite", "#111"], ["Alteration: Pchy", "#222"], ["Mineralization: py", "#333"], [`Mineralization: ${longText}`, "#444"]], ["Alteration", "Lithology", "Mineralization"]);
  const heads = rows.filter((r) => r[2]?.heading).map((r) => r[0]);
  assert.ok(heads.includes("Lithology (ribbon 2 of 3, from the left)"), heads.join(" | "));
  assert.ok(!rows.some((r) => r[0] === longText));
  assert.ok(rows.some((r) => r[2]?.note && /1 longer description/.test(r[0])));
  assert.deepEqual(groupSectionLegend(rows), rows, "safe to apply twice");
});

test("wired: the section header names the ribbons; the snapshot legend gets the order", () => {
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /Ribbons on each hole, left to right: \{list\}/);
  assert.match(s, /ribbonOrder\(data\.intervals\)\), \/\/ models/);
});
