// TASKS.csv #627 — a multi-layer shapefile .zip decompresses only the layer being imported.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildZip, shapefileZipFiles, parseShapefileZip, listZipNames } from "../src/lib/shapefile.js";

const layer = (baseName, x) => shapefileZipFiles({ features: [{ geometry: [[x, 2, 0]], attributes: { NAME: baseName } }], geomType: "point", epsg: 3005, baseName });

// Marks one entry as DEFLATE although its bytes aren't: reading it throws, so a test passes only if it's never inflated.
function poisonEntry(zip, name) {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const enc = new TextEncoder().encode(name);
  let hits = 0;
  for (let i = 0; i + 4 < zip.length; i++) {
    const sig = dv.getUint32(i, true);
    const isLocal = sig === 0x04034b50, isCentral = sig === 0x02014b50;
    if (!isLocal && !isCentral) continue;
    const nameAt = i + (isLocal ? 30 : 46);
    const nameLen = dv.getUint16(i + (isLocal ? 26 : 28), true);
    if (nameLen !== enc.length || !enc.every((b, k) => zip[nameAt + k] === b)) continue;
    dv.setUint16(i + (isLocal ? 8 : 10), 8, true);
    hits++;
  }
  assert.equal(hits, 2, `patched local + central record of ${name}`);
  return zip;
}

test("#627 importing one layer never decompresses the others", async () => {
  const zip = poisonEntry(buildZip([...layer("geology", 10), ...layer("rivers", 20)]), "rivers.dbf");
  const names = await listZipNames(zip);
  assert.ok(names.includes("rivers.dbf") && names.includes("geology.shp"));
  const g = await parseShapefileZip(zip, "geology");
  assert.deepEqual(g.layerNames.sort(), ["geology", "rivers"]);
  assert.equal(g.layerName, "geology");
  assert.equal(g.features[0].attributes.NAME, "geology");
  assert.ok(g.prjWkt, "its own .prj still read");
  await assert.rejects(parseShapefileZip(zip, "rivers"), "the poisoned layer itself is still read (and fails) when chosen");
});

test("#627 layer names with regex characters are matched literally", async () => {
  const zip = buildZip([...layer("a.b(1)", 1), ...layer("aXb(1)", 2)]);
  const p = await parseShapefileZip(zip, "a.b(1)");
  assert.equal(p.features[0].attributes.NAME, "a.b(1)");
  assert.equal(p.features[0].geometry[0][0], 1);
});
