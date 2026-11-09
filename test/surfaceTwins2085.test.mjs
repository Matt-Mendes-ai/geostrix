// TASKS.csv #2085 (review #2013, Surface Geology) — re-importing the same soil ids as 'rock chip' made 49 duplicates at the same coordinates
// with 'Loaded 49 surface samples'; the import now asks, and the dialog says what the file's medium column holds when it is not used.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { otherMediumTwins, mergeSurfaceSamples } from "../src/lib/geochem.js";
const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const m = readFileSync(new URL("../src/components/SurfaceImportModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

const prev = [{ sample_id: "C00365645", x: 614247.47, y: 5781694.71, medium: "soil", values: { Au: 0.0005 } }, { sample_id: "007", x: 1, y: 1, medium: "soil", values: {} }];
test("same id, other medium, same place: a twin; same medium is an ordinary update; far away is not a twin", () => {
  const rows = [{ sample_id: "C00365645", x: 614247.5, y: 5781694.7, medium: "rock chip", values: {} }, { sample_id: "7", x: 1.4, y: 1.2, medium: "rock chip", values: {} }, { sample_id: "007", x: 500, y: 500, medium: "rock chip" }, { sample_id: "C00365645", x: 614247.5, y: 5781694.7, medium: "soil" }];
  const t = otherMediumTwins(prev, rows);
  assert.equal(t.n, 2); // '7' matches '007' (sampleIdKey), within 1 m; the far one and the same-medium one do not
  assert.deepEqual(t.media, { soil: 2 });
});
test("taking the existing medium turns the duplicates into updates", () => {
  const rows = [{ sample_id: "C00365645", x: 614247.5, y: 5781694.7, medium: "rock chip", values: { Cu: 13 } }];
  const t = otherMediumTwins(prev, rows);
  const fixed = rows.map((r) => (t.existing.has(r) ? { ...r, medium: t.existing.get(r) } : r));
  const merged = mergeSurfaceSamples(prev, fixed);
  assert.equal(merged.samples.length, 2); assert.equal(merged.updated, 1);
});
test("wired: asked before adding, the cancel path adds nothing, the dialog names the unused medium column", () => {
  assert.match(g, /const twins = otherMediumTwins\(surfaceSamples, rows\);/);
  assert.match(g, /notice\("Surface sample import cancelled: nothing was added\."\)\]\); return; \}/);
  assert.match(m, /The file's \\"\{col\}\\" column holds \{list\}; with no medium column chosen, every row is imported as \{medium\}\./);
});
