// TASKS.csv #2970 (WA iron review) — a map unit named like a logged code takes the logs' colour: at import and when 'Colour by' comes back
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loggedCodeSpellings, withLogColours } from "../src/lib/logColours.js";

const litho = [{ value: "ALU" }, { value: "alu" }, { value: "ALU" }, { value: "BNAM" }, { value: " HNAM " }, { value: "" }];

test("the logged spellings, case-folded, the most used one kept", () => {
  assert.deepEqual([...loggedCodeSpellings(litho)], [["ALU", "ALU"], ["BNAM", "BNAM"], ["HNAM", "HNAM"]]);
});

test("categories named like a logged code take its colour, others keep theirs; a subcrop layer's are ordered by count", () => {
  const colourOf = (c) => ({ ALU: "#E69F00", BNAM: "#117733", HNAM: "#D55E00" })[c];
  const cats = [{ value: "BNAM", color: "#000001", count: 2 }, { value: "alu", color: "#000002", count: 5 }, { value: "Granite", color: "#000003", count: 9 }, { value: null, color: "#000004", count: 1 }];
  const out = withLogColours(cats, loggedCodeSpellings(litho), colourOf);
  assert.deepEqual(out.map((c) => c.color), ["#117733", "#E69F00", "#000003", "#000004"]);
  assert.deepEqual(withLogColours(cats, loggedCodeSpellings(litho), colourOf, { byCount: true }).map((c) => c.value), ["Granite", "alu", "BNAM", null]);
  assert.equal(withLogColours(cats, new Map(), colourOf), cats, "no logs: unchanged");
});

test("the pane uses it at import (no QML), on 'Colour by' and on 'Each value'", () => {
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /if \(!qml && !layer\.styleBreaks && layer\.categories\.length > 1\) layer = \{ \.\.\.layer, categories: logCats\(layer, layer\.categories\) \};/);
  assert.match(p, /categories: logCats\(layer, autoCategories\(layer\.features, field, autoColorFor\(\)\)\)/);
  assert.match(p, /categories: logCats\(layer, autoCategories\(layer\.features, layer\.styleField, autoColorFor\(\)\)\)/);
  assert.match(p, /byCount: !!\(layer\.subcropFromCollars \|\| layer\.subcropOutlines\)/);
});
