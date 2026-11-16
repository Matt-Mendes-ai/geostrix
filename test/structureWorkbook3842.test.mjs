// TASKS.csv #3842 (Scottie Gold surface geology review) — 'Import structure measurements' read a rock-sample workbook (.xlsx) as text, and the Strike / Dip values the samples
// already carried in the project had no door to the structures. Synthetic workbook and samples only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildZip } from "../src/lib/shapefile.js";
import { binaryKind, readStructureWorkbook, structureRowsFromSamples } from "../src/lib/structureTable.js";
import { guessStructureColumns, parseStructureRows } from "../src/lib/mapStructures.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const hasKeys = (keys) => { for (const k of keys) for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 50)}`); };
const enc = (s) => new TextEncoder().encode(s);
const str = (r, c, t) => `<c r="${c}${r}" t="inlineStr"><is><t>${t}</t></is></c>`, num = (r, c, v) => `<c r="${c}${r}"><v>${v}</v></c>`;

function workbook() {
  const head = `<row r="1">${["Sample ID", "Easting", "Northing", "Strike", "Dip", "Type", "Zone"].map((h, i) => str(1, "ABCDEFG"[i], h)).join("")}</row>`;
  const data = [["A1", 431000, 6231000, 273, 81, "Vein", "Steep"], ["A2", 431050, 6231020, 120, 40, "Shear", "Low Tide"], ["A3", 431100, 6231050, "", "", "", "Steep"]]
    .map((r, k) => `<row r="${k + 2}">${r.map((v, i) => (v === "" ? "" : typeof v === "number" ? num(k + 2, "ABCDEFG"[i], v) : str(k + 2, "ABCDEFG"[i], v))).join("")}</row>`).join("");
  return buildZip([
    { name: "xl/workbook.xml", data: enc(`<workbook xmlns:r="r"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(`<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>`) },
    { name: "xl/worksheets/sheet1.xml", data: enc(`<worksheet xmlns="x"><sheetData>${head}${data}</sheetData></worksheet>`) },
  ]);
}

test("#3842 binaryKind names a workbook, an old workbook, a zip, a pdf and a binary file; a text table is null", () => {
  const wb = workbook();
  assert.equal(binaryKind(wb, "Rocks.xlsx"), "xlsx"); assert.equal(binaryKind(wb, "rocks.zip"), "zip");
  assert.equal(binaryKind(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), "old.xls"), "xls");
  assert.equal(binaryKind(enc("%PDF-1.7\n"), "x.pdf"), "pdf");
  assert.equal(binaryKind(Uint8Array.from([65, 66, 0, 67]), "x.dat"), "binary");
  assert.equal(binaryKind(enc("Easting,Northing,Dip,Strike\n1,2,3,4\n"), "a.csv"), null);
  assert.equal(binaryKind(enc("Easting\tNorthing\n"), "a.txt"), null);
});

test("#3842 the workbook is read like the sample import reads it, and the same column guess and parse give the measurements", async () => {
  const file = new File([workbook()], "Rocks.xlsx");
  const t = await readStructureWorkbook(file);
  assert.equal(t.rows.length, 3); assert.deepEqual(t.headers.slice(0, 5), ["Sample ID", "Easting", "Northing", "Strike", "Dip"]);
  const cols = guessStructureColumns(t.headers);
  assert.equal(cols.x, "Easting"); assert.equal(cols.dip, "Dip"); assert.equal(cols.strike, "Strike"); assert.equal(cols.type, "Type");
  const out = parseStructureRows(t.rows, cols, {});
  assert.equal(out.rows.length, 2); // the third row has no measurement
  assert.equal(out.rows[0].dip, 81);
});

test("#3842 samples that carry a Strike and a Dip are offered as structures, with their own fields kept", () => {
  const samples = [
    { sample_id: "AA1", x: 431000, y: 6231000, z: 1300, attrs: { Strike: "273", Dip: "81", Type: "Vein", Zone: "Steep" } },
    { sample_id: "AA2", x: 431050, y: 6231020, z: 1310, attrs: { Strike: 120, Dip: 40, Type: "Shear", Zone: "Low Tide" } },
    { sample_id: "AA3", x: 431100, y: 6231050, attrs: { Zone: "Steep" } }, // no measurement
    { sample_id: "AA4", x: 431200, y: 6231050, attrs: { Strike: "", Dip: "", Zone: "Steep" } },
    { sample_id: "AA5", x: NaN, y: 1, attrs: { Strike: 10, Dip: 10 } }, // no place
  ];
  const r = structureRowsFromSamples(samples);
  assert.equal(r.n, 2); assert.equal(r.cols.x, "Easting"); assert.equal(r.cols.station, "Station"); assert.equal(r.cols.dip, "Dip"); assert.equal(r.cols.strike, "Strike"); assert.equal(r.cols.type, "Type");
  assert.deepEqual(r.rows[0], { Station: "AA1", Easting: 431000, Northing: 6231000, Elevation: 1300, Strike: "273", Dip: "81", Type: "Vein", Zone: "Steep" });
  const out = parseStructureRows(r.rows, r.cols, {});
  assert.equal(out.rows.length, 2); assert.equal(out.rows[0].dip, 81);
  assert.equal(structureRowsFromSamples([{ sample_id: "x", x: 1, y: 1, attrs: { Zone: "A" } }]), null);
  assert.equal(structureRowsFromSamples([]), null); assert.equal(structureRowsFromSamples(null), null);
  assert.equal(structureRowsFromSamples([{ sample_id: "x", x: 1, y: 1, attrs: { Dip: 30 } }]), null); // a dip with no bearing is not a plane
});

test("#3842 wired: the import takes .xlsx, names other binary files, and the samples have their button", () => {
  const p = read("../src/components/SurfaceMappingPanel.jsx");
  assert.match(p, /accept="\.csv,\.txt,\.xlsx,\.tab/);
  assert.match(p, /const kind = binaryKind\(new Uint8Array\(buf, 0, Math\.min\(buf\.byteLength, 4096\)\), file\.name\);/);
  assert.match(p, /wb = await readStructureWorkbook\(file\)/);
  assert.match(p, /const sampleStructs = useMemo\(\(\) => structureRowsFromSamples\(surfaceSamples\), \[surfaceSamples\]\);/);
  assert.match(p, /\{sampleStructs && !pendingStruct && \(/);
  hasKeys(["{name} could not be read as a workbook: {why}", "{name} has no sheet with a header row and data.", "{name} is an old Excel workbook (.xls), which GeoStrix does not read. Save it as .xlsx or .csv from Excel and import that.",
    "{name} is not a text table ({kind}). Measurements are read from a .csv or .xlsx table, or a MapInfo point table.", "Formats: .csv, .xlsx, MapInfo .tab / .mif",
    "The samples already in the project that carry a Strike and a Dip: check the columns, then they are added as outcrop measurements at their sample positions.", "Add the {n} sample(s) with a strike and dip as structures"]);
});
