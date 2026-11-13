// TASKS.csv #786 — translating library messages must not change what the library computes: Data QC gives the same issues (count,
// severity, category, hole) in Spanish, with Spanish text. TASKS.csv #3134 — on synthetic holes (it ran on Woodjam, no longer in the repository):
// surveys short of the end of hole, a collar with no survey, a hole drilled upward and two collars at one place.
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
const collars = [{ hole_id: "A", x: 600000, y: 5790000, z: 1000, length: 300 }, { hole_id: "B", x: 600100, y: 5790000, z: 1000, length: 250 }, { hole_id: "C", x: 600200, y: 5790000, z: 1000, length: 120 },
  { hole_id: "D", x: 600300, y: 5790000, z: 1000, length: 400 }, { hole_id: "E", x: 600300, y: 5790000, z: 1000, length: 100 }];
const survey = [["A", 0, 0, -60], ["A", 120, 2, -59], ["B", 0, 90, -70], ["B", 100, 91, -69], ["C", 0, 180, -55], ["C", 118, 181, -55], ["D", 0, 270, -50], ["D", 150, 271, -50]].map(([hole_id, depth, azimuth, dip]) => ({ hole_id, depth, azimuth, dip }));
const qc = () => runDataQC({ project: { epsg: 26910, name: "t" }, collars, survey, layers: {}, boundaries: [], assays: [] });

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
