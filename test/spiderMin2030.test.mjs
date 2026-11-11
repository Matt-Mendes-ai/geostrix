// TASKS.csv #2030 — a spider diagram with fewer than 4 of its elements in the samples shown says so instead of drawing two-point 'patterns'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SPIDER_DIAGRAMS } from "../src/lib/geochemDiagrams.js";

test("the spiders have more than four elements each, so four is a real floor", () => {
  for (const d of Object.values(SPIDER_DIAGRAMS)) assert.ok(d.spider && d.order.length > 4, d.label);
});

test("wired: the present elements from the samples shown, the message instead of the plot", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const SPIDER_MIN = 4;/);
  assert.match(g, /d\?\.spider \? d\.order\.filter\(\(sym\) => sourceRows\.some\(\(r\) => Number\.isFinite\(r\.values\?\.\[sym\]\)\)\) : null/);
  assert.match(g, /\{spiderPresent && spiderPresent\.length < SPIDER_MIN \? \(/);
  assert.match(g, /Only \{list\} of this diagram's \{n\} elements were analysed/);
});
