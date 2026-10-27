// TASKS.csv #945 — the MapInfo interchange reader (.MIF + .MID). The fixtures' MIF sources (test/fixtures/mapinfo/src) are
// the files GDAL turned into the TAB fixtures, so the MIF reader must give what the TAB reader gives on the same data.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseMapInfoTab } from "../src/lib/mapinfoTab.js";
import { parseMapInfoMif } from "../src/lib/mapinfoMif.js";

const FX = new URL("./fixtures/mapinfo/", import.meta.url);
const bytes = (f) => new Uint8Array(fs.readFileSync(new URL(f, FX)));
const tab = (base) => parseMapInfoTab({ tab: fs.readFileSync(new URL(`${base}.tab`, FX), "latin1"), map: bytes(`${base}.map`), id: bytes(`${base}.id`), dat: bytes(`${base}.dat`), name: base });
const mif = (base) => parseMapInfoMif({ mif: bytes(`src/${base}.mif`), mid: bytes(`src/${base}.mid`), name: base });
const byName = (layer, n) => layer.features.filter((f) => f.attributes.Name === n);
const close = (a, b, tol) => a.length === b.length && a.every((ring, i) => ring.length === b[i].length && ring.every((q, k) => Math.abs(q[0] - b[i][k][0]) <= tol && Math.abs(q[1] - b[i][k][1]) <= tol));

test("#945 the mixed UTM 10N MIF reads as its TAB does: layers, EPSG, attributes, every geometry", () => {
  const a = mif("utm10_mixed"), b = tab("utm10_mixed");
  assert.deepEqual(a.layers.map((l) => [l.name, l.geomType, l.epsg, l.features.length]), b.layers.map((l) => [l.name, l.geomType, l.epsg, l.features.length]));
  assert.deepEqual(a.skipped, { noGeometry: 1, deleted: 0, unsupported: 0, corrupt: 0 });
  assert.deepEqual(a.layers[0].fields.map((f) => f.type), b.layers[0].fields.map((f) => f.type));
  for (let li = 0; li < a.layers.length; li++) {
    const la = a.layers[li], lb = b.layers[li];
    for (const fa of la.features) {
      const fb = byName(lb, fa.attributes.Name);
      assert.ok(fb.length, `${fa.attributes.Name} missing from the TAB`);
      assert.deepEqual({ ...fa.attributes, Day: fa.attributes.Day ?? null }, fb[0].attributes, fa.attributes.Name);
      // the TAB stores integer coordinates (here 1 cm, rounded): generated shapes (ellipse, rounded rectangle, arc) agree to that
      const tol = la.isText ? 0.05 : 0.011;
      assert.ok(fb.some((g) => close(fa.parts, g.parts, tol)), `${fa.attributes.Name}: ${JSON.stringify(fa.parts).slice(0, 120)}`);
    }
  }
  assert.equal(a.layers.find((l) => l.isText).features[0].attributes._text, "45/120");
});

test("#945 WGS84 points: WindowsLatin1 accents decoded, EPSG 4326; no .MID gives the geometry with empty attributes", () => {
  const { layers } = mif("wgs84_points");
  assert.equal(layers.length, 1);
  assert.equal(layers[0].epsg, 4326);
  assert.deepEqual(layers[0].features.map((f) => [f.geometry[0], f.attributes]), [[[-128.5, 56.25], { Name: "Ruisseau Galène", Dip: 35 }], [[-128.75, 56.125], { Name: "Bedding", Dip: 80 }]]);
  const bare = parseMapInfoMif({ mif: bytes("src/wgs84_points.mif"), name: "x" });
  assert.deepEqual(bare.layers[0].features[1].attributes, { Name: null, Dip: null });
});

test("#945 tab delimiter, quoted delimiters, a collection is skipped, a file with no Data section is refused", () => {
  const text = ['Version 450', 'Delimiter "\\t"', 'Columns 2', '  Name Char(10)', '  Note Char(20)', 'Data', '', 'Point 1 2', 'Collection 2', 'Multipoint 1', '5 5', 'Pline 2', '0 0', '1 1', 'Point 3 4', '    Symbol (35,0,12)'].join("\n").replace('"\\t"', '"\t"');
  const r = parseMapInfoMif({ mif: text, mid: 'A\t"x\t""y"""\nB\tz\nC\tw\n', name: "t" });
  assert.deepEqual(r.layers[0].features.map((f) => [f.geometry[0], f.attributes]), [[[1, 2], { Name: "A", Note: 'x\t"y"' }], [[3, 4], { Name: "C", Note: "w" }]]);
  assert.equal(r.skipped.unsupported, 1);
  assert.equal(r.layers[0].epsg, null);
  assert.throws(() => parseMapInfoMif({ mif: "Version 300\nColumns 0\n", name: "bad" }), /no Data section/);
});
