// TASKS.csv #2032 — a surface import's elements are kept with the data's lead commodity first, then the commodity metals, then alphabetical,
// not in the file's column order (V first on Woodjam's soils)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orderElements } from "../src/lib/elementOrder.js";

const els = (...s) => s.map((symbol) => ({ symbol }));

test("Woodjam's soil columns (V, Au, Ag, Al, Cu ...) with Cu as the lead", () => {
  assert.deepEqual(orderElements(els("V", "Au", "Ag", "Al", "Cu", "As", "Mo"), "Cu").map((e) => e.symbol), ["Cu", "Au", "Ag", "Mo", "Al", "As", "V"]);
});

test("no lead: commodity metals first, the rest alphabetical; nothing lost", () => {
  const r = orderElements(els("Zr", "La", "U", "Ce"), null).map((e) => e.symbol);
  assert.deepEqual(r, ["U", "Ce", "La", "Zr"]);
  assert.deepEqual(orderElements([], "Au"), []);
});

test("wired into the surface import (new elements only; the project's own keep their place)", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const merged = new Map\(prev\.map\(\(e\) => \[e\.symbol, e\]\)\); orderElements\(chosen, leadFor\(rows, chosen\)\)/);
});
