// TASKS.csv #3560 A1 — several holes' strip logs side by side on one depth scale (lib/multiStripLog.js), the modal and its entry.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { composeStripLogs, MULTI_MAX_HOLES } from "../src/lib/multiStripLog.js";

const collars = [{ hole_id: "A", x: 0, y: 0, z: 500, length: 100 }, { hole_id: "B", x: 50, y: 0, z: 480, length: 200 }, { hole_id: "C", x: 90, y: 0, z: 510, length: 0 }];
const layers = { litho: [{ hole_id: "A", from: 0, to: 100, value: "BAS" }, { hole_id: "B", from: 0, to: 200, value: "RHY" }] };
const opts = { collars, layers };

test("one depth scale for every hole: the longest sets it; columns side by side; a hole with nothing is skipped", () => {
  const r = composeStripLogs(["A", "B", "C"], opts);
  assert.equal(r.holes.length, 2);
  assert.deepEqual(r.skipped, ["C"]);
  assert.equal(r.pxPerMeter, 900 / 200, "the 200 m hole's own scale");
  const [a, b] = r.holes;
  assert.ok(b.x > a.x + a.width - 1, "side by side");
  assert.ok(Math.abs((b.height - a.height) - 100 * r.pxPerMeter) < 1, "the 100 m hole is 100 m shorter at the same scale");
  assert.match(r.svg, /<svg x="0" y="0" /);
  assert.equal(composeStripLogs([], opts), null);
});

test("hung from collar elevations: the lower collar shifts down by the elevation difference at the shared scale", () => {
  const r = composeStripLogs(["A", "B"], opts, { align: "rl" });
  const [a, b] = r.holes;
  assert.equal(a.y, 0);
  assert.equal(b.y, Math.round(20 * r.pxPerMeter), "B's collar is 20 m below A's");
  const d = composeStripLogs(["A", "B"], opts, { align: "depth" });
  assert.deepEqual(d.holes.map((h) => h.y), [0, 0]);
});

test("a given scale, and the cap on holes", () => {
  assert.equal(composeStripLogs(["A", "B"], opts, { pxPerMeter: 2 }).pxPerMeter, 2);
  const many = Array.from({ length: 12 }, (_, i) => ({ hole_id: `H${i}`, x: i, y: 0, z: 0, length: 50 }));
  const r = composeStripLogs(many.map((c) => c.hole_id), { collars: many, layers: { litho: many.map((c) => ({ hole_id: c.hole_id, from: 0, to: 50, value: "X" })) } });
  assert.equal(r.holes.length, MULTI_MAX_HOLES);
});

test("the wiring: the strip log's Side by side button opens the lazy modal", () => {
  const s = readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");
  assert.match(s, /const MultiStripLogModal = lazyModal\(\(\) => import\("\.\/MultiStripLogModal\.jsx"\)\);/);
  assert.match(s, /\{sideBySide && <MultiStripLogModal holeId=\{holeId\}/);
  assert.match(readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8"), /legendOverride=\{legendOverride\} \/\/ #3560 A0 \/ A1/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["Strip logs side by side"], l);
});
