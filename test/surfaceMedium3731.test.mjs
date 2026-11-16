// TASKS.csv #3731 — a rock appendix's unread types (Composite, blank) must not become soil
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { commonestMedium, unreadMediumWords, mediumRead } from "../src/lib/surfaceMedium.js";
const MEDIA = ["soil", "rock chip", "stream sediment", "moss mat", "heavy mineral concentrate", "BLEG", "stream water", "talus fines", "other"];
// the Scottie Gold appendix: Grab 169, grab 10, Chip 40, chip 22, Channel 9, Composite 6, 10 blank
const col = [...Array(169).fill("Grab"), ...Array(10).fill("grab"), ...Array(40).fill("Chip"), ...Array(22).fill("chip"), ...Array(9).fill("Channel"), ...Array(6).fill("Composite"), ...Array(10).fill("")];

test("the fallback follows the column: rock chip, not soil", () => {
  assert.equal(commonestMedium(col, MEDIA), "rock chip");
  assert.equal(commonestMedium(["Soil", "B horizon", "soil", "Rock"], MEDIA), "soil");
  assert.equal(commonestMedium(["???", ""], MEDIA), null, "nothing reads: the caller keeps its own default");
});
test("the unread words are named with their counts, blank included", () => {
  assert.deepEqual(unreadMediumWords(col, MEDIA), [["", 10], ["Composite", 6]]);
  assert.equal(mediumRead("Rock Chip", MEDIA), "rock chip");
});
test("wired: the dialog opens on the file's commonest medium and a hand-picked fallback is kept; the notice names the fallback rows", () => {
  const g = fs.readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /defaultMedium: \(mapping\.medium && commonestMedium\(/);
  assert.match(g, /took the fallback medium \(\{medium\}\)/);
  const m = fs.readFileSync(new URL("../src/components/SurfaceImportModal.jsx", import.meta.url), "utf8");
  assert.match(m, /defaultMediumPicked: true/);
  assert.match(m, /key === "medium" && !modal\.defaultMediumPicked/);
});
