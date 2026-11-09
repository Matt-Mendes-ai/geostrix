// TASKS.csv #2302 (review #2174, WA gold) — inserting a Drill plan ties the page's starter '100 m' scale bar to the plan's own scale
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tieStarterFurniture } from "../src/lib/layoutLinks.js";
import { pxPerMetre } from "../src/lib/drillPlan.js";

test("the starter bar binds to a 1:20,000 drill plan with that plan's pixels per metre and a round length", () => {
  const plan = { id: "dp1", type: "drillplan", scale: 20000, x: 60, y: 80, w: 700, h: 450 };
  const starter = { id: "sb", type: "scale", meters: 100, x: 40, y: 700 };
  const out = tieStarterFurniture([starter, plan], plan);
  const bar = out.find((e) => e.id === "sb");
  assert.equal(bar.boundTo, "dp1");
  assert.ok(Math.abs(bar.pxPerMeter - pxPerMetre(20000)) < 1e-12);
  assert.ok(bar.meters > 100, String(bar.meters)); // a 100 m bar is a sliver at 1:20,000
  // a bar the user already bound or sized is left alone
  const mine = { id: "sb2", type: "scale", meters: 100, pxPerMeter: 0.5, x: 0, y: 0 };
  assert.equal(tieStarterFurniture([mine, plan], plan).find((e) => e.id === "sb2"), mine);
});

test("the Layout's insert ties it for a drill plan", () => {
  const l = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(l, /setElements\(\(els\) => \(type === "drillplan" \? tieStarterFurniture\(\[\.\.\.els, base\], base\) : \[\.\.\.els, base\]\)\)/);
});
