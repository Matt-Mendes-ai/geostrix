// TASKS.csv #1722 (review #1645, Copley) — the outcrop importer fed a downhole structure table says where it belongs; Cancel clears the
// column check's message; Struc_Code is guessed as the Type
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { downholeTableColumns, structureCodeColumn } from "../src/lib/downholeTableGuess.js";
import { guessStructureColumns } from "../src/lib/mapLayers.js";

const COPLEY = ["HOLEID", "GEOLFROM", "GEOLTO", "Struc_Code", "Struc_Intensity", "Struc_Alpha", "Struc_Desc"];

test("Copley's downhole structure table is recognized; an outcrop table is not", () => {
  const g = guessStructureColumns(COPLEY);
  assert.equal(g.x, null); assert.equal(g.y, null);
  assert.deepEqual(downholeTableColumns(COPLEY, g), { hole: "HOLEID", from: "GEOLFROM", to: "GEOLTO", depth: null, angles: ["Struc_Alpha"] });
  assert.ok(downholeTableColumns(["Hole_ID", "Depth", "Alpha", "Beta"], {}));
  const outcrop = ["Station", "Easting", "Northing", "Dip", "Dip_Direction", "Type"];
  assert.equal(downholeTableColumns(outcrop, guessStructureColumns(outcrop)), null);
  assert.equal(downholeTableColumns(["HoleID", "Easting", "Northing", "From", "To"], guessStructureColumns(["HoleID", "Easting", "Northing", "From", "To"])), null); // has map coordinates
  assert.equal(downholeTableColumns(["Station", "Dip", "Strike"], {}), null); // no hole id
});

test("Struc_Code is the outcrop importer's Type when nothing named 'type' is there (not in the shared guess: #604 keeps Copley's table as zones)", () => {
  assert.equal(structureCodeColumn(COPLEY), "Struc_Code");
  assert.equal(guessStructureColumns(COPLEY).type, null);
  assert.equal(structureCodeColumn(["Station", "Dip"]), null);
});

test("the panel refuses with the reason and clears the message on Cancel", () => {
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /const dh = downholeTableColumns\(headers, cols\);\s*if \(dh\) \{\s*setStructMsg\(\{ ok: false, text: tr\("\{name\} looks like a downhole table/);
  assert.match(p, /onClick=\{\(\) => \{ setPendingStruct\(null\); setStructMsg\(null\);/);
  assert.match(p, /if \(!cols\.type\) cols\.type = structureCodeColumn\(headers\);/);
});
