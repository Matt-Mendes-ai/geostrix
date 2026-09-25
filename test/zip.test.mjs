// TASKS.csv #351 — capped ZIP / OMF decompression (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { inflateCapped } from "../src/lib/inflate.js";
import { readZipEntries } from "../src/lib/shapefile.js";

// Minimal ZIP writer: entries [{name, data, method (0|8), declared?}] -> Uint8Array.
function makeZip(entries) {
  const parts = [], central = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const comp = e.method === 8 ? zlib.deflateRawSync(e.data) : Buffer.from(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(e.method, 8);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(e.declared ?? e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(e.method, 10);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(e.declared ?? e.data.length, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, eocd]));
}

test("#351 inflateCapped aborts past the cap", async () => {
  const comp = zlib.deflateRawSync(Buffer.alloc(8 * 1024 * 1024)); // 8 MB of zeros -> ~8 KB
  assert.ok(comp.length < 20000);
  await assert.rejects(inflateCapped(comp, "deflate-raw", 1024 * 1024, "test"), /more than 1 MB/);
  const ok = await inflateCapped(zlib.deflateRawSync(Buffer.from("hello")), "deflate-raw", 1024, "t");
  assert.equal(Buffer.from(ok).toString(), "hello");
});

test("#351 readZipEntries: normal entries, unwanted entries skipped, oversize declarations and bad offsets refused", async () => {
  const z = makeZip([
    { name: "a.prj", data: Buffer.from("PROJCS[x]"), method: 8 },
    { name: "a.dbf", data: Buffer.from("dbfdata"), method: 0 },
    { name: "bomb.bin", data: Buffer.alloc(1024 * 1024), method: 8 },
  ]);
  const e = await readZipEntries(z);
  assert.equal(Buffer.from(e["a.prj"]).toString(), "PROJCS[x]");
  assert.equal(Buffer.from(e["a.dbf"]).toString(), "dbfdata");
  assert.equal(e["bomb.bin"], null); // listed, never decompressed
  const lying = makeZip([{ name: "big.shp", data: Buffer.from("x"), method: 8, declared: 2 ** 31 }]);
  await assert.rejects(readZipEntries(lying), /over the 512 MB limit/);
  const bad = makeZip([{ name: "a.shp", data: Buffer.from("abc"), method: 0 }]);
  new DataView(bad.buffer).setUint32(bad.length - 22 - 46 - 5 + 42, 10 ** 8, true); // local header offset far outside the file
  await assert.rejects(readZipEntries(bad), /outside the file/);
});

import { buildShapefileZip, parseShapefileZip } from "../src/lib/shapefile.js";
test("#351 regression: GeoStrix's own shapefile zip (and a DEFLATE-recompressed copy) still import", async () => {
  const features = [{ geometry: [[463333, 6178148]], attributes: { hole_id: "H1" } }, { geometry: [[463400, 6178200]], attributes: { hole_id: "H2" } }];
  const zip = buildShapefileZip({ features, geomType: "point", epsg: 3156, baseName: "collars" });
  const bytes = zip instanceof Uint8Array ? zip : new Uint8Array(await (zip.arrayBuffer ? zip.arrayBuffer() : zip));
  const p = await parseShapefileZip(bytes);
  assert.equal(p.features?.length ?? p.rows?.length ?? p.geometries?.length, 2);
  // Re-pack every entry DEFLATE-compressed, as QGIS/ArcGIS exports are.
  const entries = await readZipEntries(bytes, /.*/);
  const re = makeZip(Object.entries(entries).map(([name, data]) => ({ name, data: Buffer.from(data), method: 8 })));
  const p2 = await parseShapefileZip(re);
  assert.equal(p2.features?.length ?? p2.rows?.length ?? p2.geometries?.length, 2);
});
