// TASKS.csv #2136 — the atlas leaves the template's own (another hole's) strip log off the generated pages when it adds each page's, and its
// hole list leaves out collars with no trace
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isStripLogImage, tracedCollar } from "../src/lib/atlas.js";

test("a placed strip log is recognised by its label; other images are not", () => {
  assert.equal(isStripLogImage({ type: "image", label: "Strip log — TF24-126, 100-250 m" }), true);
  assert.equal(isStripLogImage({ type: "image", label: "Strip log - DH24-119" }), true);
  assert.equal(isStripLogImage({ type: "image", label: "Section 611400E" }), false);
  assert.equal(isStripLogImage({ type: "text", text: "Strip log" }), false);
});

test("a collar with a depth has a trace", () => {
  assert.equal(tracedCollar({ length: 250 }), true);
  assert.equal(tracedCollar({ length: 0 }), false);
  assert.equal(tracedCollar({}), false);
});

test("wired: the template's strip log left out with strip logs on; the list of traced holes; the notes", () => {
  const a = readFileSync(new URL("../src/lib/atlas.js", import.meta.url), "utf8");
  assert.match(a, /const fromTemplate = includeStripLog \? templateElements\.filter\(\(el\) => !isStripLogImage\(el\)\) : templateElements;/);
  const m = readFileSync(new URL("../src/components/GenerateAtlasModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const tracedCollars = useMemo\(\(\) => collars\.filter\(tracedCollar\), \[collars\]\);/);
  assert.match(m, /collar\(s\) with no depth \(no trace\) are left out of the list/);
});
