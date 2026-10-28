// TASKS.csv #1078 / #1079 (review #1016, security) — a small crafted MapInfo table or workbook can no longer blow up
// into millions of vertices / cells; real limits still read.
import test from "node:test";
import assert from "node:assert/strict";
import { parseMapInfoTab } from "../src/lib/mapinfoTab.js";
import { xlsxToCsvFiles } from "../src/lib/xlsx.js";
import { buildZip } from "../src/lib/shapefile.js";

// the review's crafted .MAP: many 25-byte polyline objects, each claiming len / 4 vertices from ONE coordinate block whose
// "next" pointer is itself
function craft(lenKB) {
  const BS = 512, len = lenKB * 1024, nBlocks = len / BS;
  const buf = new ArrayBuffer(len), dv = new DataView(buf);
  dv.setInt32(0x100, 42424242, true); dv.setInt16(0x104, 300, true); dv.setInt16(0x106, BS, true);
  dv.setUint8(0x161, 1); dv.setFloat64(0x170, 1, true); dv.setFloat64(0x178, 1, true);
  const coordBase = (nBlocks - 1) * BS;
  dv.setUint8(coordBase, 3); dv.setInt16(coordBase + 2, BS - 8, true); dv.setInt32(coordBase + 4, coordBase, true);
  const offs = []; let r = 0;
  for (let b = 1; b < nBlocks - 1; b++) {
    const base = b * BS; dv.setUint8(base, 2);
    for (let off = base + 20; off + 25 <= base + BS; off += 25) {
      r++; dv.setUint8(off, 0x07); dv.setInt32(off + 1, r, true); dv.setInt32(off + 5, coordBase + 8, true); dv.setInt32(off + 9, len, true);
      offs.push(off);
    }
  }
  const id = new Uint8Array(offs.length * 4); const idv = new DataView(id.buffer); offs.forEach((o, i) => idv.setInt32(i * 4, o, true));
  return { map: new Uint8Array(buf), id };
}
const tab = "!table\n!version 300\n!charset WindowsLatin1\n\nDefinition Table\n  Type NATIVE Charset \"WindowsLatin1\"\n  Fields 1\n    ID Integer ;\n";

test("#1078 a self-chained coordinate block shared by every object is refused at once (was 9.6 M vertices / 869 MB at 32 KB)", () => {
  const { map, id } = craft(32);
  const t0 = performance.now();
  assert.throws(() => parseMapInfoTab({ tab, map, id, name: "bomb" }), /corrupt/);
  assert.ok(performance.now() - t0 < 2000);
});

const enc = (s) => new TextEncoder().encode(s);
function workbook(ref) {
  const row = Number(/\d+$/.exec(ref)[0]);
  const sheet = `<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>hole_id</t></is></c></row><row r="${row}"><c r="${ref}" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>`;
  return buildZip([
    { name: "xl/workbook.xml", data: enc('<workbook><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>') },
    { name: "xl/_rels/workbook.xml.rels", data: enc('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>') },
    { name: "xl/worksheets/sheet1.xml", data: enc(sheet) },
  ]);
}

test("#1079 a cell beyond column XFD or row 1,048,576 is refused; the limits themselves still read", async () => {
  for (const ref of ["AAAAAA2", "XFE2", "A1048577"]) await assert.rejects(xlsxToCsvFiles(workbook(ref), "t.xlsx"), /beyond Excel's limits/, ref);
  for (const ref of ["XFD2", "XFD1048576"]) {
    const t0 = performance.now();
    const [s] = await xlsxToCsvFiles(workbook(ref), "t.xlsx");
    assert.equal(s.rows, 1, ref);
    assert.ok(performance.now() - t0 < 3000, ref);
  }
});
