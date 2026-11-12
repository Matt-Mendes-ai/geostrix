// TASKS.csv #2739 (side session 6) — a strip log sent to the Layout draws its own key (keyDrawn): the Layout adds no second legend beside it,
// while a cross-section snapshot still gets its bound legend
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");

test("the image keeps keyDrawn, and the legend additions leave such images out", () => {
  assert.match(m, /\.\.\.\(img\.keyDrawn \? \{ keyDrawn: true \} : \{\}\) \/\* #2739/);
  assert.match(m, /const legends = additions\.filter\(\(a\) => a\.legendItems\?\.length && !a\.keyDrawn\)\.map\(/);
});

test("the same filter on sample additions: a section snapshot gets a legend, a strip log with its own key does not", () => {
  const additions = [
    { id: "sec", legendItems: [{ label: "SST", color: "#c90" }] },
    { id: "log", legendItems: [{ label: "SST", color: "#c90" }], keyDrawn: true },
    { id: "plain" },
  ];
  assert.deepEqual(additions.filter((a) => a.legendItems?.length && !a.keyDrawn).map((a) => a.id), ["sec"]);
});
