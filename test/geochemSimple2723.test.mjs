// TASKS.csv #2723 (Matt's decision) — Lab certificates and Calc. element join the Simple Geochem ribbon once the project has assays;
// AI / CCPI, SQL and Isocon stay behind 'Show all'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
const line = (re) => g.split(/\r?\n/).find((l) => re.test(l)) || "";

test("Lab certificates and the Calculate group are Simple once there are assays", () => {
  assert.match(line(/label="Lab certificates"/), /<RibbonButton advanced=\{!assays\.length\}/);
  assert.match(line(/label="Calculate"/), /<RibbonGroup advanced=\{!assays\.length\}/);
  assert.doesNotMatch(line(/label="Calc\. element"/), /advanced/, "shown whenever its group is");
});

test("Isocon, AI / CCPI and SQL stay in Advanced", () => {
  assert.match(line(/label="Isocon"/), /<RibbonButton advanced icon=/);
  assert.match(line(/label="Classify"/), /<RibbonGroup advanced label="Classify">/);
  assert.match(line(/label="SQL"/), /<RibbonButton advanced icon=/);
});
