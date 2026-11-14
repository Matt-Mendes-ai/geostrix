// TASKS.csv #2163 — the per-project code dictionary: case-folded codes, a meaning filled from the description logged beside a code only
// when it is unambiguous, typed entries, legend labels from it, saved with the project and undoable.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { codeKey, loggedDescriptions, fileDescriptionOf, fillFromRows, setEntry, entryOf, labelsFromDictionary } from "../src/lib/codeDictionary.js";
import { FIELDS, UNDO_KEYS, emptyFields, payloadFromFields, fieldsFromPayload } from "../src/lib/projectFields.js";

const row = (value, description) => ({ hole_id: "H1", from: 0, to: 1, value, ...(description != null ? { description } : {}) });

test("#2163 codes are case-folded; the most used spelling is kept", () => {
  assert.equal(codeKey("  SMP "), "smp");
  const m = loggedDescriptions([row("SMP"), row("Smp"), row("SMP"), row("")]);
  assert.equal(m.size, 1);
  assert.equal(m.get("smp").code, "SMP");
  assert.equal(m.get("smp").total, 3);
});

test("#2163 a file description is taken only when it is unambiguous", () => {
  const info = (rows) => fileDescriptionOf(loggedDescriptions(rows).get("sa"));
  assert.equal(info([row("SA", "Saprolite")]), "Saprolite", "the only description logged");
  assert.equal(info([row("SA", "Saprolite"), row("SA", "saprolite, clay rich"), row("SA", "Saprolite")]), "Saprolite", "the most used, on 2+ rows");
  assert.equal(info([row("SA", "pale, soft"), row("SA", "red-brown, mottled"), row("SA", "clay, wet")]), null, "notes that differ on every row describe intervals");
  assert.equal(info([row("SA", "Saprolite"), row("SA", "Sand"), row("SA", "Saprolite"), row("SA", "Sand")]), null, "a tie");
  assert.equal(info([row("SA"), row("SA")]), null, "nothing logged");
  assert.equal(info([row("SA", "  Saprolite   clay ")]), "Saprolite clay", "spaces collapsed");
});

test("#2163 filling never replaces an entry already there, and returns the same object when nothing is added", () => {
  const rows = [row("SA", "Saprolite"), row("MB", "Metabasalt"), row("mb", "Metabasalt"), row("Q", "vein a"), row("Q", "vein b")];
  const a = fillFromRows({}, rows);
  assert.equal(a.added, 2);
  assert.deepEqual(a.dict.sa, { code: "SA", desc: "Saprolite", source: "file" });
  assert.equal(a.dict.mb.desc, "Metabasalt");
  assert.equal(a.dict.q, undefined, "Q: two different notes, each once");
  const typed = setEntry(a.dict, "sa", "Sandstone (this report's code)");
  assert.equal(typed.sa.source, "user");
  assert.equal(typed.sa.code, "SA", "the stored spelling is kept");
  const b = fillFromRows(typed, rows);
  assert.equal(b.added, 0);
  assert.equal(b.dict, typed, "unchanged object");
  assert.equal(b.dict.sa.desc, "Sandstone (this report's code)");
  assert.equal(fillFromRows(undefined, []).added, 0);
});

test("#2163 a typed entry: blank removes it, the same text returns the same object", () => {
  const d = setEntry({}, "BIF", "Banded iron formation");
  assert.deepEqual(d, { bif: { code: "BIF", desc: "Banded iron formation", source: "user" } });
  assert.equal(setEntry(d, "bif", "Banded iron formation"), d);
  assert.deepEqual(setEntry(d, "Bif", "   "), {});
  const none = {};
  assert.equal(setEntry(none, "X", ""), none);
  assert.equal(entryOf(d, " bif").desc, "Banded iron formation");
  assert.equal(entryOf(null, "bif"), null);
});

test("#2163 legend labels from the dictionary: only codes with a meaning that differs from their label now", () => {
  const dict = { sa: { code: "SA", desc: "Saprolite", source: "file" }, mb: { code: "MB", desc: "Metabasalt", source: "user" } };
  const cats = [["SA", 10], ["MB", 4], ["CY", 2]];
  const labels = labelsFromDictionary(dict, cats, (v) => (v === "MB" ? "Metabasalt" : v));
  assert.deepEqual(labels, [{ value: "SA", label: "Saprolite" }]);
});

test("#2163 codeDictionary is a saved, undoable project field that round-trips", () => {
  const f = FIELDS.find((x) => x.key === "codeDictionary");
  assert.ok(f, "a project field");
  assert.ok(UNDO_KEYS.includes("codeDictionary"));
  assert.deepEqual(emptyFields().codeDictionary, {});
  const live = { ...emptyFields(), codeDictionary: { litho: { sa: { code: "SA", desc: "Saprolite", source: "file" } } } };
  const back = fieldsFromPayload(JSON.parse(JSON.stringify(payloadFromFields(live))), "Demo");
  assert.deepEqual(back.codeDictionary, live.codeDictionary);
  assert.deepEqual(fieldsFromPayload({ version: 26 }, "Old").codeDictionary, {}, "an older file: empty");
});

test("#2163 wiring: the store setters, the import fill and the inspector's dictionary pane", () => {
  const store = fs.readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.match(store, /codeDictionary: \[codeDictionary, setCodeDictionary\]/);
  assert.match(store, /fillCodeDictionary, setCodeDictionaryEntry/);
  const imp = fs.readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(imp, /!numeric && fillCodeDictionary \? fillCodeDictionary\(target, rows\)/);
  const insp = fs.readFileSync(new URL("../src/components/LayerInspector.jsx", import.meta.url), "utf8");
  assert.match(insp, /<CodeDictionaryTable /);
  const table = fs.readFileSync(new URL("../src/components/CodeDictionaryTable.jsx", import.meta.url), "utf8");
  assert.match(table, /setCodeDictionaryEntry\(layerKey, value, ev\.target\.value\)/);
});
