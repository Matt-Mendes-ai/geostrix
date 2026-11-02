import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_ANOMALY } from "../src/lib/anomalyMap.js";
import { linePlacement } from "../src/lib/dcipStations.js";

test("#1322 no deposit type is assumed: the index starts unchosen, and user-facing text names none where it means any", () => {
  assert.equal(DEFAULT_ANOMALY.preset, null);
  for (const f of ["src/components/InversionPanel.jsx", "src/components/IsoconTool.jsx", "src/modules/viewer/ModellingPanes.jsx"]) assert.doesNotMatch(readFileSync(f, "utf8"), /Golden Triangle rocks|defaults for VMS|in an epithermal system/, f);
});
const files = [{ name: "BoundaryGPS.txt", epsg: 26910, lines: { "9000N": [{ s: 4650, x: 343181, y: 6204481, z: 1710 }, { s: 4700, x: 343224, y: 6204514, z: 1672 }], "90": [{ s: 1, x: 1, y: 1 }, { s: 2, x: 2, y: 2 }] } }, { name: "MistyGPS.txt", epsg: 32610, lines: { "4100N": [{ s: 4900, x: 341000, y: 6198400, z: 900 }, { s: 5000, x: 341100, y: 6198400, z: 910 }] } }];
test("#1328 a line finds its stations by name, across several GPS files, reprojected", () => {
  const seen = [];
  const to = (x, y, from) => { seen.push(from); return [x + 1, y]; };
  const b = linePlacement("9000N", files, to);
  assert.equal(b.stations.file, "BoundaryGPS.txt");
  assert.equal(b.stations.line, "9000N");
  assert.equal(b.stations.list.length, 2);
  assert.equal(b.stations.list[0].x, 343182, "through the reprojection");
  assert.ok(seen.includes(26910));
  const m = linePlacement("4100N", files, (x, y) => [x, y]);
  assert.equal(m.stations.file, "MistyGPS.txt");
  assert.equal(Number(m.y0), 6198400);
  assert.equal(linePlacement("7777N", files, (x, y) => [x, y]), null, "no stations: not guessed from the only line a file has");
  assert.equal(linePlacement("7777N", [{ name: "one", lines: { "4100N": files[1].lines["4100N"] } }], (x, y) => [x, y]), null);
});
