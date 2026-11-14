// TASKS.csv #2600 / #2444 — drifts checked against the collar ground with no terrain; the dump compares with pit designs too
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runAboveGround } from "../src/lib/designLines.js";
import { collarGround } from "../src/lib/pitShell.js";

test("a portal 79 m above the collar ground: the line's start runs above it", () => {
  const g = collarGround([{ x: 0, y: 0, z: 221 }, { x: 1000, y: 0, z: 221 }, { x: 0, y: 1000, z: 221 }, { x: 1000, y: 1000, z: 221 }]);
  const line = [[500, 500, 300], [700, 500, 272], [900, 500, 150]]; // -14 % then down through the ground
  const above = runAboveGround(line, g);
  assert.ok(above > 150 && above <= 400, String(above));
});

test("the panes", () => {
  const d = fs.readFileSync("src/components/DesignLinesPane.jsx", "utf8");
  assert.match(d, /const collarSurf = useMemo\(\(\) => \(terrain \|\| collarsLookUnderground\(collars\)\.underground \? null : collarGround\(collars\)\)/); // #3327 — one memo for the start and the check
  assert.match(d, /const collarSurface = collarSurf;/);
  assert.match(d, /c && collarSurface \? runAboveGround\(c\.vertices, collarSurface\)/);
  assert.match(fs.readFileSync("src/components/DumpPane.jsx", "utf8"), /\(s\.type === "pit_shell" \|\| s\.type === "pit_design"\) && Number\.isFinite\(s\.params\?\.wasteTonnes\)/);
});
