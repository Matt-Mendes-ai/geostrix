// TASKS.csv #786 — translating library messages must not change what the library computes: Data QC on the real Woodjam
// sample gives the same issues (count, severity, category, hole) in Spanish, with Spanish text.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runDataQC } from "../src/lib/dataQC.js";
import { useDictionary } from "../src/lib/i18n.js";

const csv = (f) => {
  const [h, ...lines] = readFileSync(f, "utf8").trim().split(/\r?\n/);
  const keys = h.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [keys[i], keys[i] === "hole_id" ? v : Number(v)])));
};
const es = JSON.parse(readFileSync(new URL("../src/locales/es.json", import.meta.url), "utf8"));
const qc = () => runDataQC({ project: { epsg: 26910, name: "t" }, collars: csv("sample_data/woodjam/collars.csv"), survey: csv("sample_data/woodjam/survey.csv"), layers: {}, boundaries: [], assays: [] });

test("Data QC: same issues in English and Spanish, translated text", () => {
  useDictionary("en", null);
  const en = qc();
  useDictionary("es", es);
  const sp = qc();
  useDictionary("en", null);
  const shape = (r) => r.issues.map((i) => `${i.severity}|${i.category}|${i.holeId}`);
  assert.ok(en.issues.length > 0);
  assert.deepEqual(shape(sp), shape(en));
  const changed = sp.issues.filter((i, k) => i.message !== en.issues[k].message).length;
  assert.ok(changed > en.issues.length / 2, `${changed} of ${en.issues.length} messages translated`);
  assert.ok(sp.issues.some((i) => /sondaje|survey termina/.test(i.message)), sp.issues.map((i) => i.message).slice(0, 3).join(" | "));
});
