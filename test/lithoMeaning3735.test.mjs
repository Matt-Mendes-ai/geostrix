// TASKS.csv #3735 (Scottie Gold import review) — a code's meaning in this project (the code dictionary) reaches the legend before the built-in name, and a
// meaning of 'overburden' / 'casing' gives the code that role; a lith_name column is guessed as the Description.
import test from "node:test";
import assert from "node:assert/strict";
import { LAYER_META, setLithologyMeanings, lithoMeaning, roleForLithology, roleIsAssumed, categoryLabel } from "../src/lib/layers.js";
import { TARGET_SCHEMAS } from "../src/lib/layersImport.js";

test("legend: the project's meaning first, the built-in name next, the bare code last", () => {
  setLithologyMeanings(null);
  assert.equal(categoryLabel({}, LAYER_META.litho, "FLT"), "FLT — Fault zone");
  assert.equal(categoryLabel({}, LAYER_META.litho, "AND"), "AND");
  setLithologyMeanings({ flt: { code: "FLT", desc: "gouge" }, and: { code: "AND", desc: "andesite" }, x: { desc: "" } });
  assert.equal(categoryLabel({}, LAYER_META.litho, "FLT"), "FLT — gouge");
  assert.equal(categoryLabel({}, LAYER_META.litho, "and"), "and — andesite", "case-folded");
  assert.equal(categoryLabel({ label: "Mine" }, LAYER_META.litho, "FLT"), "Mine", "a legend rename still wins");
  assert.equal(lithoMeaning("X"), null);
  setLithologyMeanings(null);
});

test("roles: a meaning of overburden or casing is suggested as that role", () => {
  setLithologyMeanings(null);
  assert.equal(roleForLithology("OVBN"), "stratigraphic");
  assert.equal(roleIsAssumed("OVBN"), true);
  setLithologyMeanings({ ovbn: { desc: "overburden" }, csg: { desc: "Casing" }, gg: { desc: "andesite" } });
  assert.equal(roleForLithology("OVBN"), "overburden");
  assert.equal(roleForLithology("CSG"), "overburden");
  assert.equal(roleIsAssumed("OVBN"), false);
  assert.equal(roleForLithology("GG"), "stratigraphic", "a rock name gives no role");
  assert.equal(roleForLithology("FLT"), "fault", "the code's own role still first");
  setLithologyMeanings(null);
});

test("import: lith_name is guessed as the Description of a lithology import; the store sets the meanings", async () => {
  const f = TARGET_SCHEMAS.litho.fields.find((x) => x.key === "description");
  assert.ok(["lith_name", "lithology_name", "rock_name"].every((a) => f.aliases.includes(a)));
  const { readFileSync } = await import("node:fs");
  assert.match(readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8"), /useMemo\(\(\) => setLithologyMeanings\(codeDictionary\?\.litho\), \[codeDictionary\]\);/);
});
