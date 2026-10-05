// TASKS.csv #605 — Excel workbook import: the dependency-free .xlsx reader, the sheet-name type hints and the
// point (depth-only) mag-sus readings found in a real BC ARIS drillhole workbook.
import test from "node:test";
import assert from "node:assert/strict";
import { buildZip } from "../src/lib/shapefile.js";
import { isXlsxName, readXlsxSheets, xlsxToCsvFiles } from "../src/lib/xlsx.js";
import { guessTargetFor, guessMapping, schemaSatisfied, targetFromName } from "../src/lib/layers.js";
import { normNumericInterval } from "../src/lib/viewer/importHelpers.js";

const enc = (s) => new TextEncoder().encode(s);
const sheetXml = (rows) => `<?xml version="1.0"?><worksheet xmlns="x"><sheetData>${rows}</sheetData></worksheet>`;

function workbook() {
  const files = [
    { name: "xl/workbook.xml", data: enc(`<workbook xmlns:r="r"><sheets>
      <sheet name="DH Collar" sheetId="1" r:id="rId1"/>
      <sheet name="Mag Susc" sheetId="2" r:id="rId2"/>
      <sheet name="Empty &amp; Notes" sheetId="3" r:id="rId3" state="hidden"/>
    </sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(`<Relationships>
      <Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/>
      <Relationship Id="rId2" Type="ws" Target="/xl/worksheets/sheet2.xml"/>
      <Relationship Id="rId3" Type="ws" Target="worksheets/sheet3.xml"/>
    </Relationships>`) },
    { name: "xl/sharedStrings.xml", data: enc(`<sst><si><t>Hole_ID</t></si><si><t>Easting</t></si><si><t>Northing</t></si>
      <si><t>Elevation</t></si><si><r><t>WJ</t></r><r><t xml:space="preserve">-01</t></r></si><si><t>Depth</t></si>
      <si><t>Mag_SI</t></si><si><t>A &lt;b&gt; &amp; "c"</t></si></sst>`) },
    // Collar: shared strings, a formula with a cached value, a sparse row (C2 missing -> ""), an inline string.
    { name: "xl/worksheets/sheet1.xml", data: enc(sheetXml(`
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>
      <row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2"><v>612345.5</v></c><c r="D2"><f>1000+2</f><v>1002</v></c></row>
      <row r="4"><c r="A4" t="inlineStr"><is><t>WJ-02</t></is></c><c r="B4"><v>612400</v></c><c r="C4"><v>5800100</v></c><c r="D4" t="b"><v>1</v></c></row>`)) },
    { name: "xl/worksheets/sheet2.xml", data: enc(sheetXml(`
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>5</v></c><c r="C1" t="s"><v>6</v></c></row>
      <row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2"><v>12.5</v></c><c r="C2"><v>0.0031</v></c></row>
      <row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3"><v>15</v></c><c r="C3" t="e"><v>#N/A</v></c></row>`)) },
    { name: "xl/worksheets/sheet3.xml", data: enc(sheetXml(`<row r="1"><c r="A1" t="s"><v>7</v></c></row>`)) },
  ];
  return buildZip(files);
}

test("#605 isXlsxName", () => {
  assert.ok(isXlsxName("Drilling.XLSX"));
  assert.ok(!isXlsxName("Drilling.xls"));
  assert.ok(!isXlsxName("x.csv"));
});

test("#605 readXlsxSheets: shared/rich/inline strings, formulas, booleans, errors, sparse cells, entities, hidden", async () => {
  const sheets = await readXlsxSheets(workbook());
  assert.deepEqual(sheets.map((s) => s.name), ["DH Collar", "Mag Susc", "Empty & Notes"]);
  assert.equal(sheets[2].hidden, true);
  const c = sheets[0].rows;
  assert.deepEqual(c[0], ["Hole_ID", "Easting", "Northing", "Elevation"]);
  assert.deepEqual(c[1], ["WJ-01", "612345.5", "", "1002"]); // rich text runs joined; C2 missing; formula cached value
  assert.deepEqual(c[2], []); // row 3 absent in the XML
  assert.deepEqual(c[3], ["WJ-02", "612400", "5800100", "TRUE"]);
  assert.equal(sheets[1].rows[2][2], ""); // #N/A error cell -> blank, not the error text
  assert.equal(sheets[2].rows[0][0], 'A <b> & "c"');
});

test("#605 xlsxToCsvFiles: one CSV per sheet with data, blank rows dropped, header-only sheets skipped", async () => {
  const out = await xlsxToCsvFiles(workbook(), "Drilling_Woodjam.xlsx");
  assert.deepEqual(out.map((o) => o.name), ["Drilling_Woodjam - DH Collar.csv", "Drilling_Woodjam - Mag Susc.csv"]);
  assert.equal(out[0].rows, 2);
  const lines = out[0].text.trim().split(/\r?\n/);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Hole_ID,Easting,Northing,Elevation$/);
});

test("#605 readXlsxSheets refuses a zip that is not a workbook", async () => {
  await assert.rejects(readXlsxSheets(buildZip([{ name: "a.txt", data: enc("hi") }])), /Not an Excel workbook/);
});

test("#605 sheet-name hints win only when that type's required columns map", () => {
  assert.equal(targetFromName("Drilling - Specific Gravity.csv"), "sg");
  assert.equal(targetFromName("Drilling - Vein.csv"), "vein");
  assert.equal(targetFromName("Drilling - DH Survey.csv"), "survey");
  assert.equal(targetFromName("assays_2024.csv"), null);
  // Generic From/To/Value columns read as litho on their own; the "Specific Gravity" sheet name makes them SG.
  assert.equal(guessTargetFor(["Hole_ID", "From", "To", "Value"], "assays.csv"), "litho");
  assert.equal(guessTargetFor(["Hole_ID", "From", "To", "Value"], "Book - Specific Gravity.csv"), "sg");
  // A "Vein" name whose value column is not a vein alias ("Code") is declined, not forced.
  assert.equal(guessTargetFor(["Hole_ID", "From", "To", "Code"], "Book - Vein.csv"), "litho");
  // The hint is ignored when its columns cannot be mapped (a "Survey" name on a collar table).
  assert.equal(guessTargetFor(["Hole_ID", "Easting", "Northing", "Elevation"], "Book - Survey notes.csv"), "collars");
});

test("#605 mag sus point readings: Depth instead of From/To, placed at that depth", () => {
  const headers = ["Hole_ID", "Depth", "Mag_SI"];
  const target = guessTargetFor(headers, "Book - Mag Susc.csv");
  assert.equal(target, "magsusc");
  const mapping = guessMapping(target, headers);
  assert.equal(mapping.depth, "Depth");
  assert.equal(mapping.value, "Mag_SI");
  assert.ok(schemaSatisfied(target, mapping));
  assert.ok(!schemaSatisfied(target, { ...mapping, depth: null }));
  const row = normNumericInterval({ Hole_ID: "WJ-01", Depth: "12.5", Mag_SI: "0.0031" }, mapping, []);
  assert.deepEqual([row.hole_id, row.from, row.to, row.value], ["WJ-01", 12.5, 12.5, 0.0031]);
  // Interval mag sus is unchanged.
  const iv = normNumericInterval({ h: "A", f: "1", t: "2", v: "5" }, { hole_id: "h", from: "f", to: "t", value: "v" }, []);
  assert.deepEqual([iv.from, iv.to, iv.value], [1, 2, 5]);
});

test("#605 replaceRowsByHole keepRows: a later file of the same drop adds to its rows; earlier imports are still replaced", async () => {
  const { replaceRowsByHole } = await import("../src/lib/layers.js");
  const old = [{ hole_id: "A", from: 0, to: 5, value: "old" }];
  const alt = [{ hole_id: "A", from: 0, to: 10, value: "ser" }, { hole_id: "B", from: 0, to: 4, value: "chl" }];
  const keep = new WeakSet();
  let rows = replaceRowsByHole(old, alt, keep).rows; // first sheet of the drop replaces the earlier import of A
  alt.forEach((r) => keep.add(r));
  assert.deepEqual(rows.map((r) => r.value), ["ser", "chl"]);
  const bx = [{ hole_id: "A", from: 3, to: 4, value: "bx" }];
  const res = replaceRowsByHole(rows, bx, keep); // Breccia sheet, same drop
  assert.deepEqual(res.rows.map((r) => r.value), ["ser", "chl", "bx"]);
  assert.deepEqual(res.replacedHoles, []);
  assert.deepEqual(replaceRowsByHole(rows, bx).rows.map((r) => r.value), ["chl", "bx"]); // no keep set: #336 unchanged
});

test("#600 groupShapefileParts: loose .shp/.dbf/.prj pair by basename; unmatched sidecars reported", async () => {
  const { groupShapefileParts } = await import("../src/lib/viewer/importHelpers.js");
  const f = (n) => new File(["x"], n);
  const list = [f("Collar Locations _All.shp"), f("Collar Locations _All.DBF"), f("Collar Locations _All.prj"), f("Collar Locations _All.shx"),
    f("Other.shp"), f("orphan.dbf"), f("assays.csv"), f("Collar Locations _All.shp.xml")];
  const { files, unmatched } = groupShapefileParts(list);
  assert.deepEqual(files.map((x) => x.name), ["Collar Locations _All.shp", "Other.shp", "assays.csv"]);
  assert.deepEqual(unmatched.map((x) => x.name), ["orphan.dbf"]);
  assert.deepEqual(Object.keys(files[0].shpParts).sort(), ["dbf", "prj"]);
  assert.equal(files[1].shpParts, undefined);
});

test("#600 pickRankedCollarRows: lowest rank wins per hole; no rank column leaves rows alone; diff counts holes once", async () => {
  const { pickRankedCollarRows, diffCollarImport } = await import("../src/lib/layers.js");
  const raw = [
    { hole_id: "DH24-119", rank: 1, depth: 700, x: 1 }, { hole_id: "DH24-119", rank: 0, depth: 700, x: 2 },
    { hole_id: "DH24-119", rank: 6, depth: 118.9, x: 3 }, { hole_id: "A", rank: "", depth: 50, x: 9 }, { hole_id: "A", rank: 2, depth: 60, x: 8 },
    { hole_id: "B", rank: 1, depth: 10, x: 5 },
  ];
  const r = pickRankedCollarRows(raw, "hole_id", Object.keys(raw[0]));
  assert.equal(r.rankColumn, "rank");
  assert.deepEqual(r.rows.map((x) => [x.hole_id, x.x]), [["DH24-119", 2], ["A", 8], ["B", 5]]); // blank rank loses to a numeric one
  assert.equal(r.dropped, 3);
  assert.deepEqual(r.holes, ["DH24-119", "A"]);
  const noRank = raw.map(({ rank, ...x }) => x);
  assert.equal(pickRankedCollarRows(noRank, "hole_id", Object.keys(noRank[0])).rows, noRank);
  const d = diffCollarImport([], [{ hole_id: "A", x: 1 }, { hole_id: "A", x: 2 }, { hole_id: "B", x: 3 }]);
  assert.deepEqual(d.newHoles, ["A", "B"]);
  assert.deepEqual(d.duplicatesInFile, ["A"]);
});
