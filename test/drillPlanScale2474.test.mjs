// TASKS.csv #2474 (review #2325, WA uranium) — a drill-plan page's title block Scale row and {scale}: the plan's own 1 : N
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pageScaleText } from "../src/lib/layoutGeometry.js";

test("a page with only a drill plan reads its scale; a viewport or a section image still wins; nothing to read is blank", () => {
  const plan = { id: "dp", type: "drillplan", scale: 50000, x: 0, y: 0, w: 700, h: 450 };
  assert.equal(pageScaleText([plan, { type: "titleblock" }]), `1 : ${(50000).toLocaleString()}`);
  assert.equal(pageScaleText([{ ...plan, scale: 12499.6 }]), `1 : ${(12500).toLocaleString()}`);
  const vp = { type: "viewport", trueScale: true, capturedFixedScale: 2000 };
  assert.equal(pageScaleText([plan, vp]), `1 : ${(2000).toLocaleString()}`); // #2139: the viewport's, as before
  assert.equal(pageScaleText([{ ...plan, scale: 0 }]), "");
  assert.equal(pageScaleText([{ type: "text" }]), "");
  // the title block and the {scale} placeholder read it through textContextFor
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /scale: pageScaleText\(els\)/);
});
