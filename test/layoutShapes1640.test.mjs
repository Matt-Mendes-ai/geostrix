// TASKS.csv #1640 — inserted shapes go into free space, as views, text, north arrow and legend already do (#1484).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { freeSpot } from "../src/lib/layoutPlace.js";

test("the shapes are placed by freeSpot", () => {
  const s = fs.readFileSync("src/modules/LayoutModule.jsx", "utf8");
  assert.match(s, /if \(type === "rect" \|\| type === "arrow" \|\| type === "callout"\) Object\.assign\(base, freeSpot\(elements,/);
});

test("successive shapes do not land on one another", () => {
  const page = { w: 1123, h: 794 };
  const els = [{ x: 60, y: 60, w: 700, h: 450 }];
  const a = freeSpot(els, 180, 110, page); els.push({ ...a, w: 180, h: 110 });
  const b = freeSpot(els, 180, 110, page);
  assert.ok(!(a.x === b.x && a.y === b.y), JSON.stringify([a, b]));
  assert.ok(!(a.x < 760 && a.y < 510 && a.x + 180 > 60 && a.y + 110 > 60), "the first clears the view");
});
