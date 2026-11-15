// TASKS.csv #3609 (Fireweed rehearsal) — the Legend inserted on a drill-plan sheet turned the plan's ring symbols into filled squares: 'assayed, no Zn intercept at the cut-off' (a hollow ring) and 'no Zn
// assays' (a crossed ring) got the same grey square as a colour class. The rows now carry the plan's own symbol (a filled dot, a hollow ring, a crossed ring).
import { test } from "node:test";
import assert from "node:assert/strict";
import { planKeyItems } from "../src/lib/planKeyLegend.js";

test("a hollow ring, a crossed ring and a dot keep their symbol in the legend rows", () => {
  const d = { colouring: { title: "Zn best intercept", key: [
    { label: "< 95.8 m × %", colour: "#8a9bb0", rMm: 0.8, hollow: false },
    { label: "assayed, no Zn intercept at the cut-off", colour: "#9aa3ad", rMm: 0.6, hollow: true },
    { label: "no Zn assays", colour: "#9aa3ad", rMm: 0.8, hollow: true, cross: true },
  ] } };
  const rows = planKeyItems(d);
  const dot = rows.find((r) => r[0].startsWith("<")), ring = rows.find((r) => /no Zn intercept/.test(r[0])), crossed = rows.find((r) => r[0] === "no Zn assays");
  assert.match(dot[2].svg, /fill="#8a9bb0"/, "a colour class is a filled dot, as on the plan");
  assert.match(ring[2].svg, /fill="none"/); assert.doesNotMatch(ring[2].svg, /<path/);
  assert.match(crossed[2].svg, /fill="none"[^>]*\/><path d="M/);
  assert.equal(ring[1], "#9aa3ad");
});
