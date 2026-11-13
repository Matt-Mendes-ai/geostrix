// TASKS.csv #3161 — a map feature of several polygons goes in the project KMZ as one Placemark with a MultiGeometry: bare <Polygon>s side by
// side in a Placemark are not KML, and Google Earth drew only the first (Perk-Rocky's And unit lost most of its area).
import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectKml } from "../src/lib/projectKmz.js";

const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];

test("a three-part polygon feature is one Placemark with one MultiGeometry of three Polygons", () => {
  const layer = { id: "m1", name: "Litho", geomType: "polygon", visible: true, opacity: 0.6, color: "#33aa55",
    features: [{ parts: [sq(0, 0, 100), sq(500, 0, 100), sq(1000, 0, 100)], attributes: { code: "And" } }] };
  const { kml } = buildProjectKml({ mapLayers: [layer] }, { toLonLat: (x, y) => [-125 + x * 1e-5, 51.8 + y * 1e-5] });
  const pms = [...kml.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)].map((m) => m[1]).filter((b) => b.includes("<Polygon>"));
  assert.equal(pms.length, 1);
  assert.equal((pms[0].match(/<Polygon>/g) || []).length, 3);
  assert.equal((pms[0].match(/<MultiGeometry>/g) || []).length, 1);
  // no Placemark anywhere holds more than one geometry outside a MultiGeometry
  for (const m of kml.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
    const b = m[1], n = (b.match(/<(Polygon|LineString|Point)>/g) || []).length;
    if (n > 1) assert.ok(b.includes("<MultiGeometry>"), b.slice(0, 120));
  }
});
