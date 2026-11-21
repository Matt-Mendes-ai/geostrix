// TASKS.csv #3945 — the lithology legend, pills, figure overlay and section key show 'CODE — rock name', not the whole logged description:
// the file's rock-name column where it has one, else the description's first clause, at most five words. Identify and the role reading keep
// the full text. Made-up codes and descriptions only.
import test from "node:test";
import assert from "node:assert/strict";
import { LAYER_META, setLithologyMeanings, lithoMeaning, lithoMeaningText, roleForLithology, categoryLabel } from "../src/lib/layers.js";
import { shortMeaning, descriptionHead, fillFromRows, setEntry } from "../src/lib/codeDictionary.js";
import { TARGET_SCHEMAS, guessMapping } from "../src/lib/layersImport.js";
import { normInterval } from "../src/lib/viewer/importHelpers.js";
import { codeMeaning } from "../src/lib/viewer/codeMeaning.js";
import { withLithoMeanings } from "../src/lib/sectionLegend.js";

const LONG = "Meta-gabbro dyke, dark grey to black, medium grained, strongly foliated with chlorite and epidote along fractures; pyrite 1-2% as fine disseminations";

test("the head of a description: its first clause, outside brackets, at most five words", () => {
  assert.equal(descriptionHead(LONG), "Meta-gabbro dyke");
  assert.equal(descriptionHead("Andesite. Green, massive."), "Andesite");
  assert.equal(descriptionHead("Overburden (till, gravel), with boulders"), "Overburden (till, gravel)", "a comma inside brackets is not the end");
  assert.equal(descriptionHead("Mudstone - black, graphitic"), "Mudstone");
  assert.equal(descriptionHead("Breccia: hydrothermal"), "Breccia");
  assert.equal(descriptionHead("0.5 m quartz vein"), "0.5 m quartz vein", "a decimal point is not a full stop");
  assert.equal(shortMeaning({ desc: LONG }), "Meta-gabbro dyke");
  assert.equal(shortMeaning({ desc: "Fine grained grey green andesite flow with feldspar phenocrysts and calcite" }), "Fine grained grey green andesite…", "capped at five words");
  assert.equal(shortMeaning({ desc: LONG, name: "Gabbro dyke" }), "Gabbro dyke", "the file's rock name first");
  assert.equal(shortMeaning({ desc: "Andesite, porphyritic", source: "user" }), "Andesite, porphyritic", "a short typed entry is used as written");
  assert.equal(shortMeaning({ desc: LONG, source: "user" }), "Meta-gabbro dyke", "a long typed entry is cut like a file's");
  assert.equal(shortMeaning({ desc: "" }), "");
});

test("legend, pills and the section key show the code and the rock name; Identify and the role reading keep the full text", () => {
  setLithologyMeanings({ mgd: { code: "MGD", desc: LONG, source: "file" }, ob: { code: "OB", desc: "Overburden, glacial till with cobbles of granite and basalt", source: "file" } });
  assert.equal(lithoMeaning("MGD"), "MGD — Meta-gabbro dyke");
  assert.equal(categoryLabel({}, LAYER_META.litho, "MGD"), "MGD — Meta-gabbro dyke");
  assert.equal(lithoMeaningText("MGD"), LONG, "the full description is still there");
  assert.equal(roleForLithology("OB"), "overburden", "the #3840 role reading still sees the text");
  const dict = { litho: { mgd: { code: "MGD", desc: LONG } } };
  assert.equal(codeMeaning(dict, "litho", "MGD", "MGD — Meta-gabbro dyke"), LONG, "Identify adds the full description beside the short label");
  const pay = withLithoMeanings({ legendItems: [["Lithology: MGD", "#123456"]], intervals: [{ layer: "litho", code: "MGD" }] });
  assert.equal(pay.legendItems[0][0], "Lithology: MGD — Meta-gabbro dyke");
  setLithologyMeanings(null);
});

test("import: a rock-name column beside the description is kept and becomes the entry's name", () => {
  assert.ok(TARGET_SCHEMAS.litho.fields.some((f) => f.key === "rock_name"));
  const m = guessMapping("litho", ["Hole_ID", "From", "To", "Lith_Code", "Lith_Name", "Description"]);
  assert.equal(m.value, "Lith_Code");
  assert.equal(m.rock_name, "Lith_Name");
  assert.equal(m.description, "Description");
  const lone = guessMapping("litho", ["Hole_ID", "From", "To", "Lith_Code", "Lith_Name"]);
  assert.equal(lone.description, "Lith_Name", "#3735: a lone name column is still the Description");
  assert.equal(lone.rock_name, "", "and not mapped twice");
  const raw = [
    { Hole_ID: "DH-23-001", From: "0", To: "4", Lith_Code: "MGD", Lith_Name: "Gabbro dyke", Description: LONG },
    { Hole_ID: "DH-23-001", From: "4", To: "9", Lith_Code: "MGD", Lith_Name: "Gabbro dyke", Description: LONG },
    { Hole_ID: "DH-23-002", From: "0", To: "3", Lith_Code: "AND", Lith_Name: "", Description: "Andesite, green, massive" },
  ];
  const rows = raw.map((r) => normInterval(r, m, []));
  assert.equal(rows[0].rock_name, "Gabbro dyke");
  assert.equal("rock_name" in rows[2] && rows[2].rock_name !== undefined, false, "a blank name is not kept");
  const { dict } = fillFromRows({}, rows);
  assert.deepEqual(dict.mgd, { code: "MGD", desc: LONG, name: "Gabbro dyke", source: "file" });
  assert.equal(dict.and.name, undefined);
  setLithologyMeanings(dict);
  assert.equal(lithoMeaning("MGD"), "MGD — Gabbro dyke");
  assert.equal(lithoMeaning("AND"), "AND — Andesite");
  // a typed meaning replaces the entry, name and all: the legend then follows what was typed
  setLithologyMeanings(setEntry(dict, "MGD", "Diabase"));
  assert.equal(lithoMeaning("MGD"), "MGD — Diabase");
  setLithologyMeanings(null);
});

test("import: a code logged with only a rock name takes it as its meaning", () => {
  const rows = [{ value: "QFP", rock_name: "Quartz feldspar porphyry" }, { value: "QFP", rock_name: "Quartz feldspar porphyry" }];
  assert.deepEqual(fillFromRows({}, rows).dict.qfp, { code: "QFP", desc: "Quartz feldspar porphyry", source: "file" });
});
