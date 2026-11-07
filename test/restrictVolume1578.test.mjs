// TASKS.csv #1578 — 'Restrict to a modelled volume' lists closed solids with their volumes and greys open meshes (as #1564).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the estimation dialog's volume list goes through solidChoices, open meshes disabled", () => {
  const s = fs.readFileSync("src/components/GradeEstimationModal.jsx", "utf8");
  assert.match(s, /const ch = solidChoices\(volumeShells\);/);
  assert.match(s, /\{ch\.open\.map\(\(v\) => <option key=\{v\.id\} value=\{v\.id\} disabled>/);
  assert.doesNotMatch(s, /\{volumeShells\.map\(\(v\) => <option key=\{v\.id\} value=\{v\.id\}>\{v\.name\}<\/option>\)\}/);
});
