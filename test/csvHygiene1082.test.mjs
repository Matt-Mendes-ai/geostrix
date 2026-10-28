// TASKS.csv #1082 (review #1016) — CSV exports go through tabular.js (Papa): no component builds its own quoting again.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { toCsv, FORMULA_LEAD } from "../src/lib/tabular.js";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const files = ["components", "modules"].flatMap((d) => readdirSync(join(root, d)).filter((f) => f.endsWith(".jsx")).map((f) => join(root, d, f)));

test("#1082 no file that saves a CSV quotes cells by hand", () => {
  const bad = files.filter((p) => { const s = readFileSync(p, "utf8"); return /extensions: \["csv"\]/.test(s) && /replace\(\/"\/g, '""'\)/.test(s); });
  assert.deepEqual(bad, []);
});

test("#1082 a parameter value with quotes and commas stays one cell", () => {
  const rows = [["section", "item", "version A", "version B"], ["parameter changed", "mapModel.order", '["Andesite","Tuff"]', '["Tuff","Andesite"]'], ["hole", "DH-1, wedge", "=cmd", ""]];
  const text = toCsv(rows, { escapeFormulae: FORMULA_LEAD });
  const back = Papa.parse(text);
  assert.equal(back.errors.length, 0);
  assert.deepEqual(back.data[1], rows[1]);
  assert.equal(back.data[2][1], "DH-1, wedge");
  assert.equal(back.data[2][2], "'=cmd");
});
