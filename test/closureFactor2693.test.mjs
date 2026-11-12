// TASKS.csv #2693 — an artificially closed grade shell's note gives what its own (flat) search implies; TASKS.csv #2703 — the planned-hole
// export's date is the local calendar day.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("#2693 flatSearchAxes: a flat ellipsoid (thinnest axis a third of the longest or less, not a cigar), longest first", async () => {
  // ClosureNote.jsx imports React and i18n only; read the pure helper's source and evaluate it
  const s = src("modules/viewer/ClosureNote.jsx");
  const body = s.slice(s.indexOf("export function flatSearchAxes"), s.indexOf("export default function ClosureNote")).replace("export function", "function");
  const flatSearchAxes = new Function(`${body}; return flatSearchAxes;`)();
  assert.deepEqual(flatSearchAxes({ searchEllipsoidM: [200, 200, 20] }), [200, 200, 20]); // 10:10:1
  assert.deepEqual(flatSearchAxes({ searchEllipsoidM: [30, 50, 10] }), [50, 30, 10]); // 5:3:1, unsorted
  assert.equal(flatSearchAxes({ searchEllipsoidM: [100, 80, 60] }), null, "not flat");
  assert.equal(flatSearchAxes({ searchEllipsoidM: [100, 20, 20] }), null, "a cigar: two short axes");
  assert.equal(flatSearchAxes({ searchRadiusM: 100 }), null, "no trend");
  assert.equal(flatSearchAxes(null), null);
});

test("#2693 ViewerModule passes the shell's params; the sentence is for grade shells only and translated", () => {
  assert.match(src("modules/ViewerModule.jsx"), /<ClosureNote type=\{s\.type\} params=\{s\.params\} \/\* #2693 \*\/ \/>/);
  const n = src("modules/viewer/ClosureNote.jsx");
  assert.match(n, /type === "unit_body" \|\| type === "alteration_envelope" \? null : flatSearchAxes\(params\)/);
  const key = "With this shell's flat search ({a} × {b} × {c} m along its trend), doubling the radius multiplies the volume by about four where its top and base are grade boundaries, and by up to eight where it closes on every side.";
  assert.ok(n.includes(key));
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(src(`locales/${l}.json`))[key], l);
});

test("#2703 the planned-hole export dates the file by the local day", () => {
  const v = src("modules/ViewerModule.jsx");
  assert.match(v, /const today = localDate\(\); \/\/ #2703/);
  assert.ok(!v.includes("new Date().toISOString().slice(0, 10)"));
});
