// TASKS.csv #1503 (review #1497, Lawyers) — a face-only DXF dropped on the Geophysics tab goes to the 3D View's solid import,
// and a boundary import's message is shown on whatever pane is open, not only under Boundaries
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dxfToBoundaries } from "../src/lib/dxf.js";

const FACES = ["0", "SECTION", "2", "ENTITIES", "0", "3DFACE", "8", "ISO", "10", "0", "20", "0", "30", "0", "11", "1", "21", "0", "31", "0", "12", "1", "22", "1", "32", "0", "13", "1", "23", "1", "33", "0", "0", "ENDSEC", "0", "EOF"].join("\n");

test("a face-only DXF throws facesOnly (the signal the Geophysics drop now acts on)", () => {
  assert.throws(() => dxfToBoundaries(FACES, "faces"), (e) => e.facesOnly === true);
});

test("the Geophysics drop hands solids to the 3D View and shows the message on the open pane", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /if \(err\.facesOnly\) \{ solids\.push\(file\); continue; \}/);
  assert.match(g, /if \(solids\.length\) \{ goToModule\("viewer"\); requestModuleAction\("import-solid", \{ files: solids \}\); \}/);
  assert.match(g, /\(geoPane === "boundaries" \? setBoundaryError : setRasterError\)\(/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /useModuleAction\(\["import-solid"\], \(a, payload\) => \{ for \(const f of payload\?\.files \|\| \[\]\) importSolidFile\(f\); \}\);/);
});
