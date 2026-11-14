// TASKS.csv #3454 / #3455 (from #3349) — a KML's placemark names are kept as the boundary's part names, its lines are flagged open (a road is not a
// claim), and a second import of the same file is numbered, not a second card of the same name
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kmlToProjectPolylines } from "../src/lib/kml.js";
import { uniqueName } from "../src/lib/idw.js";
import { closedFeaturesOnly } from "../src/lib/boundaryImport.js";

const features = [
  { geomType: "polygon", name: "SYNTHETIC CLAIM", placemark: "p1", coords: [[-131.4, 57.1], [-131.3, 57.1], [-131.3, 57.2], [-131.4, 57.2], [-131.4, 57.1]], attrs: { TENURE_NUM: "SYN-0001" } },
  { geomType: "line", name: "SYNTHETIC ROAD", placemark: "p2", coords: [[-131.4, 57.1], [-131.35, 57.12], [-131.3, 57.15]], attrs: {} },
];
test("the Placemark names come back as part names and the road is open", () => {
  const r = kmlToProjectPolylines(features, null);
  assert.deepEqual(r.partNames, ["SYNTHETIC CLAIM", "SYNTHETIC ROAD"]);
  assert.deepEqual(r.closedFlags, [true, false]);
  const { result, lines } = closedFeaturesOnly(r);
  assert.equal(lines, 1); assert.deepEqual(result.partNames, ["SYNTHETIC CLAIM"]);
  assert.equal(kmlToProjectPolylines([{ ...features[0], name: "" }], null).partNames, undefined); // no names: none stored
});
test("the second import of a file is numbered; the KML route and both import routes use it", () => {
  assert.equal(uniqueName("claims", ["claims"]), "claims (2)");
  assert.equal(uniqueName("claims", ["claims", "claims (2)"]), "claims (3)");
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal((g.match(/uniqueName\((fileStem\(file\.name\)|c\.name), boundaries\.map\(\(b\) => b\.name\)\) \/\* #3455 \*\//g) || []).length, 2);
  assert.match(g, /return \{ polylines, closedFlags, featureOf, attributes, \.\.\.\(partNames \? \{ partNames \} : \{\}\), note: withLonLatSource/);
});
