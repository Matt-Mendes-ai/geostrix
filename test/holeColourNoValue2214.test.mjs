// TASKS.csv #2214 (review #2174, WA gold) — 'Colour holes by HoleType' (3 holes carry it, 242 do not): the overlay legend's row cap kept
// the group's first rows and dropped '(no value) (242)', so the figure implied three holes. The group carries its counts now, so a cut
// keeps the commonest rows.
import test from "node:test";
import assert from "node:assert/strict";
import { holeColourScheme, holeColourLegendGroup } from "../src/lib/viewer/holeColours.js";
import { allocateLegendRows } from "../src/lib/legendGroups.js";

const collars = [{ attrs: { HoleType: "AC/DD" } }, { attrs: { HoleType: "RC" } }, { attrs: { HoleType: "RC" } }, ...Array.from({ length: 242 }, () => ({ attrs: {} }))];

test("#2214 a cut hole-colour group keeps '(no value) (242)'", () => {
  const g = holeColourLegendGroup(holeColourScheme(collars, "HoleType"), "Holes by HoleType", "(no value)");
  assert.deepEqual(g.items.map((i) => i[0]), ["AC/DD (1)", "RC (2)", "(no value) (242)"]);
  assert.deepEqual(g.counts, [1, 2, 242]);
  const other = { key: "lith", label: "Lithology", items: Array.from({ length: 20 }, (_, i) => [`L${i}`, "#000"]) };
  const { rows } = allocateLegendRows([g, other], 4);
  const holeRows = rows.filter((r) => r.group === "Holes by HoleType").map((r) => r.label);
  assert.deepEqual(holeRows, ["RC (2)", "(no value) (242)"], "the two commonest, in their usual order");
});
