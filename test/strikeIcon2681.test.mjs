// TASKS.csv #2681 (split from #2090) — the outcrop export to Google Earth: a .kmz with a strike-and-dip symbol icon (drawn here, packed
// beside the KML), so each measurement's heading turns a dip symbol, not Google Earth's default pushpin.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync, crc32 } from "node:zlib";
import { strikeSymbolPng, strikeSymbolPixels, STRIKE_ICON_PATH } from "../src/lib/strikeIcon.js";
import { featuresToKml, surfaceStructureFeatures } from "../src/lib/overlayExport.js";
import { buildZip } from "../src/lib/shapefile.js";

test("the icon is a valid 64 px RGBA PNG: a strike line north-south, a dip tick east, transparent elsewhere", () => {
  const b = Buffer.from(strikeSymbolPng(64));
  assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [];
  for (let i = 8; i < b.length;) {
    const n = b.readUInt32BE(i), type = b.subarray(i + 4, i + 8), data = b.subarray(i + 8, i + 8 + n);
    if (typeof crc32 === "function") assert.equal(crc32(Buffer.concat([type, data])), b.readUInt32BE(i + 8 + n), type.toString());
    chunks.push([type.toString(), data]); i += 12 + n;
  }
  assert.deepEqual(chunks.map((c) => c[0]), ["IHDR", "IDAT", "IEND"]);
  const ihdr = chunks[0][1];
  assert.deepEqual([ihdr.readUInt32BE(0), ihdr.readUInt32BE(4), ihdr[8], ihdr[9]], [64, 64, 8, 6]);
  const raw = inflateSync(chunks[1][1]); // the zlib stream (with its Adler-32) inflates
  assert.equal(raw.length, 64 * (64 * 4 + 1));
  const px = (x, y) => [...raw.subarray(y * 257 + 1 + x * 4, y * 257 + 5 + x * 4)];
  assert.deepEqual(px(32, 8), [255, 255, 255, 255]); // the strike line, north of the centre
  assert.deepEqual(px(32, 56), [255, 255, 255, 255]); // and south
  assert.deepEqual(px(46, 32), [255, 255, 255, 255]); // the tick, east (down dip once turned by the strike)
  assert.deepEqual(px(18, 32), [0, 0, 0, 0]); // nothing to the west
  assert.deepEqual(px(0, 0), [0, 0, 0, 0]);
  const p = strikeSymbolPixels(64);
  assert.equal(p.rgba.length, 64 * 64 * 4);
});

test("the KML points at the icon in the shared style and in each heading's own style (with its colour)", () => {
  const set = { rows: [{ x: 500000, y: 6000000, z: 950, dip: 40, dipDir: 120, strike: 30, type: "bedding", cls: "bedding" }] };
  const f = surfaceStructureFeatures(set, 26910);
  const kml = featuresToKml(f, { toLonLat: (x, y) => [x / 1e4, y / 1e5], colorOf: () => "#336699", headingOf: (ft) => ft.attributes.strike_rhr_true, iconHref: STRIKE_ICON_PATH });
  assert.match(kml, /<Style id="s0">.*<IconStyle><color>ff996633<\/color><Icon><href>files\/strike\.png<\/href><\/Icon><\/IconStyle>/);
  assert.match(kml, /<Placemark>.*<Style><IconStyle><color>ff996633<\/color><heading>[\d.]+<\/heading><Icon><href>files\/strike\.png<\/href><\/Icon><\/IconStyle><\/Style>/);
  const plain = featuresToKml(f, { toLonLat: (x, y) => [x / 1e4, y / 1e5], headingOf: () => 30 }); // without an icon: as before
  assert.doesNotMatch(plain, /<Icon>/);
  assert.match(plain, /<Style><IconStyle><heading>30<\/heading><\/IconStyle><\/Style>/);
  const zip = Buffer.from(buildZip([{ name: "doc.kml", data: new TextEncoder().encode(kml) }, { name: STRIKE_ICON_PATH, data: strikeSymbolPng(64) }]));
  assert.ok(zip.includes(Buffer.from("doc.kml")) && zip.includes(Buffer.from("files/strike.png")));
});

test("Surface Geology's outcrop export writes the .kmz", () => {
  const src = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(src, /iconHref: STRIKE_ICON_PATH \/\* #2681 \*\//);
  assert.match(src, /buildZip\(\[\{ name: "doc\.kml", data: new TextEncoder\(\)\.encode\(kml\) \}, \{ name: STRIKE_ICON_PATH, data: strikeSymbolPng\(64\) \}\]\)/);
  assert.match(src, /suggestedName: `\$\{base\}\.kmz`, filters: \[\{ name: "KMZ", extensions: \["kmz"\] \}\]/);
  assert.match(src, /tr\("KMZ \(Google Earth, with strike symbols\)"\)/);
});
