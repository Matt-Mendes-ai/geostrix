// TASKS.csv #2334 (review #2325, WA uranium) — the 439,780-reading gamma log was 32.6 MB of one JSON object per reading in the
// project file: custom layers had no compact form. A layer of 2,000+ rows now saves its rows as exact columns, like the assays.
import test from "node:test";
import assert from "node:assert/strict";
import { compactTable, compactCustomLayers, expandCustomLayers, COMPACT_TABLE_MIN_ROWS } from "../src/lib/compactTable.js";
import { payloadFromFields, fieldsFromPayload, emptyFields } from "../src/lib/projectFields.js";

const log = (n, hole = "WAC") => Array.from({ length: n }, (_, i) => ({ hole_id: `${hole}${i % 37}`, depth: +(i * 0.1).toFixed(2), value: i % 11 === 0 ? -0.5 : +(i * 0.37).toFixed(2), _src: "geophysics_1.csv" }));

test("a big custom layer saves as exact columns and comes back the same; a small one stays plain", () => {
  const big = { id: "g", name: "Gamma: eU3O8", unit: "ppm", rows: log(6000) };
  const small = { id: "s", name: "Strat unit", rows: [{ hole_id: "A", from: 0, to: 2, code: "E1" }] };
  big.rows[7] = { ...big.rows[7], note: "re-logged", value: undefined }; // a sparse field and an absent value
  const saved = compactCustomLayers([big, small]);
  assert.equal(saved[0].rows.__compactTable, 1);
  assert.equal(saved[0].name, "Gamma: eU3O8"); assert.equal(saved[0].unit, "ppm");
  assert.equal(saved[1], small, "a layer under the minimum is the same object");
  const json = JSON.stringify(saved), plain = JSON.stringify([big, small]);
  assert.ok(json.length < plain.length / 3, `compact ${json.length} vs plain ${plain.length}`);
  const back = expandCustomLayers(JSON.parse(json));
  assert.deepEqual(back[0].rows, JSON.parse(JSON.stringify(big.rows)));
  assert.deepEqual(back[1], small);
});

test("adding a layer re-encodes only that layer (the rows' encoding is cached)", () => {
  const a = { id: "a", name: "A", rows: log(COMPACT_TABLE_MIN_ROWS + 10) };
  const first = compactCustomLayers([a]);
  const b = { id: "b", name: "B", rows: log(COMPACT_TABLE_MIN_ROWS + 20, "B") };
  const second = compactCustomLayers([a, b]);
  assert.equal(second[0].rows, first[0].rows, "layer A's encoding is the cached one");
  assert.equal(second[0].rows, compactTable(a.rows));
});

test("the project file round trip: version 25, customLayers through save / load; an older plain file still opens", () => {
  const live = { ...emptyFields(), customLayers: [{ id: "g", name: "Gamma", rows: log(2500) }] };
  const file = JSON.parse(JSON.stringify(payloadFromFields(live)));
  assert.ok(file.version >= 25, String(file.version)); // 25 brought the columns; later versions keep them (#2691: 26)
  assert.equal(file.customLayers[0].rows.__compactTable, 1);
  const opened = fieldsFromPayload(file);
  assert.deepEqual(opened.customLayers[0].rows, JSON.parse(JSON.stringify(live.customLayers[0].rows)));
  const old = fieldsFromPayload({ version: 24, customLayers: [{ id: "g", name: "Gamma", rows: log(2500) }] });
  assert.equal(old.customLayers[0].rows.length, 2500);
});

test("dictionary codes are unchanged by the string-keyed map: strings, objects, NaN and a string that looks like JSON", () => {
  const rows = Array.from({ length: 2100 }, (_, i) => ({ k: i % 5 === 0 ? "null" : i % 5 === 1 ? null : i % 5 === 2 ? { a: 1 } : i % 5 === 3 ? "x" : NaN }));
  const c = compactTable(rows);
  assert.deepEqual(c.cols.k.d, ["null", null, { a: 1 }, "x"], "the string 'null' and a null / NaN are different entries");
});
