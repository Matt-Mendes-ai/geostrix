// TASKS.csv #3423 (#2206 Phase 1, docs/ideas/columnar-project-tables.md) — the survey table is saved as exact columns (compactTable.js) from
// 2,000 rows, as assays are (v30). Survey was the only big table still written one JSON object per row.
import test from "node:test";
import assert from "node:assert/strict";
import { PROJECT_VERSION, fieldsFromPayload, payloadFromFields, emptyFields } from "../src/lib/projectFields.js";

const stations = (holes, per) => {
  const out = [];
  for (let h = 0; h < holes; h++) for (let k = 0; k < per; k++) out.push({ hole_id: `RH${String(h).padStart(5, "0")}`, depth: k * 50, azimuth: (h * 7.3 + k * 1.1) % 360, dip: -45 - ((h + k) % 45) - 0.25, ...(k % 3 ? { method: "gyro" } : {}), ...(h % 50 === 0 && k === 0 ? { note: null } : {}) });
  return out;
};

test("a survey of 2,000+ stations is written as columns and comes back the same rows (numbers bit for bit, absent and null kept apart)", () => {
  const survey = stations(600, 5);
  const live = { ...emptyFields(), survey };
  const text = JSON.stringify(payloadFromFields(live));
  const file = JSON.parse(text);
  assert.equal(file.version, PROJECT_VERSION);
  assert.ok(PROJECT_VERSION >= 30);
  assert.ok(file.survey.__compactTable, "written as columns");
  assert.ok(JSON.stringify(file.survey).length < JSON.stringify(survey).length * 0.6, `${JSON.stringify(file.survey).length} vs ${JSON.stringify(survey).length}`);
  const back = fieldsFromPayload(file, "t.geostrix.json").survey;
  assert.equal(back.length, survey.length);
  back.forEach((r, i) => assert.deepEqual(r, survey[i]));
  assert.ok(!("method" in back[0]) && back[1].method === "gyro" && back[0].note === null && !("note" in back[1]));
});

test("a small survey stays plain rows; a version-29 file with the survey as rows opens unchanged", () => {
  const small = stations(10, 5);
  assert.ok(Array.isArray(JSON.parse(JSON.stringify(payloadFromFields({ ...emptyFields(), survey: small }))).survey), "under 2,000 rows: plain JSON");
  const big = stations(600, 5);
  const v29 = { ...JSON.parse(JSON.stringify(payloadFromFields(emptyFields()))), version: 29, survey: big };
  const loaded = fieldsFromPayload(JSON.parse(JSON.stringify(v29)), "old.geostrix.json");
  assert.deepEqual(loaded.survey, big);
});
