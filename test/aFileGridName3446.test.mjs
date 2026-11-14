// TASKS.csv #3446 (split from #2297) — Maps > A file reads a GRIDNAME-style column's VALUES (MGA94_51) into the file's CRS, as the collar import does
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gridFrameFromRows } from "../src/lib/crsFromColumns.js";

test("every row naming MGA94_51 gives EPSG:28351; rows in several frames are mixed and give none", () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ HOLE: `H${i}`, GRIDNAME: "MGA94_51", E: 450000 + i, N: 7000000 }));
  const f = gridFrameFromRows(["HOLE", "GRIDNAME", "E", "N"], rows);
  assert.deepEqual([f.epsg, f.mixed, f.cols], [28351, false, ["GRIDNAME"]]);
  const m = gridFrameFromRows(["GRIDNAME"], [...rows, { GRIDNAME: "WALLABY" }, { GRIDNAME: "WALLABY" }]);
  assert.deepEqual([m.epsg, m.mixed], [null, true]);
  assert.equal(gridFrameFromRows(["HOLE", "E"], rows), null);
});

test("A file pre-fills From from the values (after a srid column, before the header prefix) and says so; a mixed file leaves From to the user", () => {
  const c = readFileSync(new URL("../src/modules/CartographyModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(c, /const frame = !srid \? gridFrameFromRows\(t\.headers, t\.rows\) : null;/);
  assert.match(c, /const implied = srid \? srid\.epsg : named \|\| \(g\.geographic \? 4326 : fromForGridPrefix/);
  assert.match(c, /from the values of its \{col\} column: check both, then save\./);
  assert.match(c, /names more than one grid \(\{names\}\): the rows are not in one CRS, so From is left for you to choose\./);
});
