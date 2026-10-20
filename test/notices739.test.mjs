// TASKS.csv #739 — notice severity: explicit level wins, an Error instance is an error whatever its wording,
// and plain strings fall back to the wording test.
import test from "node:test";
import assert from "node:assert/strict";
import { noticeText, noticeLevel, errorNotice, infoNotice } from "../src/lib/notices.js";

test("severity of explicit notices, Error instances and plain strings", () => {
  const thrown = new Error("no block is both below the ground and within 150 m of a sample.");
  assert.equal(noticeLevel(thrown), "error");
  assert.equal(noticeText(thrown), thrown.message);
  assert.equal(noticeLevel(errorNotice("Loaded 37 holes")), "error");
  assert.equal(noticeLevel(infoNotice("Export failed: retried")), "info");
  assert.equal(noticeLevel("Couldn't read the file."), "error");
  assert.equal(noticeLevel("Loaded 37 holes."), "info");
  assert.equal(noticeText(null), "");
});

// TASKS.csv #786 — notice(): translated text, severity judged on the English wording
test("notice() translates the text but keeps the English severity", async () => {
  const { notice } = await import("../src/lib/notices.js");
  const { useDictionary } = await import("../src/lib/i18n.js");
  useDictionary("es", { "{name}: couldn't read DXF ({message}).": "{name}: no se pudo leer el DXF ({message}).", "Loaded {rows} rows.": "Se cargaron {rows} filas." });
  const err = notice("{name}: couldn't read DXF ({message}).", { name: "a.dxf", message: "bad" });
  assert.deepEqual(err, { text: "a.dxf: no se pudo leer el DXF (bad).", level: "error" });
  assert.deepEqual(notice("Loaded {rows} rows.", { rows: 3 }), { text: "Se cargaron 3 filas.", level: "info" });
  assert.equal(notice("Untranslated, failed").level, "error");
  useDictionary("en", null);
  assert.deepEqual(notice("Loaded {rows} rows.", { rows: 3 }), { text: "Loaded 3 rows.", level: "info" });
});
