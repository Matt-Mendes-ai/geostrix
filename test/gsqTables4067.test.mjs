// TASKS.csv #4067 (the GSQ harvest, #4061) — drillhole-table text variants, tested on SYNTHETIC files only (the real GSQ tables are not in the repository):
// an SL3 table saved as comma-delimited CSV with a UTF-8 BOM; a UTF-16 table; a header-less quoted set; MGA / AMG / AGD66 coordinate columns
// side by side; a local-grid azimuth beside the map grid's.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeTableBytes, parseTableText } from "../src/lib/tabular.js";
import { sl3ToTable, isSl3 } from "../src/lib/sl3Table.js";
import { addMissingHeader } from "../src/lib/headerlessText.js";
import { gridCoordinateColumns, gridElevation } from "../src/lib/gridColumns.js";
import { guessMapping, guessTarget } from "../src/lib/layersImport.js";
import { detectAzimuthRef } from "../src/lib/azimuthRef.js";
import { judgeCoordMapping } from "../src/lib/coordSets.js";

const utf16 = (s, le = true, bom = true) => { const b = new Uint8Array((s.length + (bom ? 1 : 0)) * 2); const v = new DataView(b.buffer); let o = 0; if (bom) { v.setUint16(0, 0xfeff, le); o = 2; } for (let i = 0; i < s.length; i++) v.setUint16(o + 2 * i, s.charCodeAt(i), le); return b; };

test("#4067 a UTF-16 table (either byte order, with its mark) is read, not as 'ÿþ' and NULs; a UTF-8 BOM is still dropped", () => {
  const text = "Hole_ID\tmFrom\tmTo\nA1\t0\t1\nA2\t1\t2\n";
  for (const le of [true, false]) {
    const d = decodeTableBytes(utf16(text, le));
    assert.equal(d.encoding, le ? "utf-16le" : "utf-16be");
    assert.equal(d.text, text);
    const t = parseTableText(d.text);
    assert.deepEqual(t.headers, ["Hole_ID", "mFrom", "mTo"]); assert.equal(t.rows.length, 2);
  }
  const b8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("a,b\n1,2\n")]);
  assert.deepEqual(decodeTableBytes(b8), { text: "a,b\n1,2\n", encoding: "utf-8" });
  assert.equal(decodeTableBytes(new TextEncoder().encode("plain,text\n1,2\n")).encoding, "utf-8");
});

const SL3_CSV = [
  "H0002,Version,4,,,", "H0100,Tenement_no,EPM1,,,", "H0501,Geodetic_datum,GDA94,,,", "H0502,Projection_zone,55,,,",
  'H1000,"Hole_id ","MGA_E*","MGA_N *",Elevation,"Au ppm',
  'x",Drill_Code', // the quoted name runs over two lines, as in the real H1000 rows
  "H1001,(units of measure),metres,metres,metres,ppm,NA",
  "H1004,(accuracy),1,1,1,0,0",
  "D,BP1,460210.31,7740481.61,321.07,0.8,RC", "D,BP2,460300.5,7740500.25,320.1,12.5,DD", "EOF,,,,,,",
].join("\r\n");

test("#4067 an SL3 table saved as a comma CSV: read like the tab one (names on H1000, units, rows, the header block's datum)", () => {
  assert.ok(isSl3(SL3_CSV));
  const r = sl3ToTable(SL3_CSV);
  assert.ok(r);
  assert.equal(r.names[0], "Hole_id"); assert.equal(r.names[1], "MGA_E"); assert.equal(r.names[2], "MGA_N"); // the template's '*' and spaces gone
  assert.ok(r.names.includes("Elevation"));
  assert.match(r.note, /SL3 table: 2 rows/); // the short note (#4070)
  assert.match(r.note, /Coordinates: GDA94, zone 55/); // the value, not the record's label
  const t = parseTableText(SL3_CSV);
  assert.equal(t.rows.length, 2); assert.equal(t.rows[0].Hole_id, "BP1"); assert.equal(t.rows[1].MGA_E, 460300.5);
  assert.match(t.headers.join("|"), /MGA_E\|MGA_N/);
  // the units row labelled '(units of measure)' gives the assay column its unit
  assert.ok(r.names.some((n) => /ppm\)$/.test(n)), r.names.join("|"));
  // an ordinary comma CSV is not one
  assert.equal(isSl3("a,b\n1,2\n"), false);
  assert.equal(isSl3("H1,Hole\nD,1\n"), false, "'H1' is not a record code (three digits at least)");
});

test("#4067 a table with no header row: Column 1..n put in front; a real header, depths or years as labels are left alone", () => {
  const collar = '"SERC/D-20"\t"STSTH"\t437428.41\t7581256.48\t279.02\t341.00\t\t"10783"\t\t\t"RC"\n';
  const h = addMissingHeader(collar);
  assert.equal(h.columns, 11);
  assert.ok(h.text.startsWith("Column 1\tColumn 2\tColumn 3"));
  const t = parseTableText(collar);
  assert.equal(t.rows.length, 1, "the one hole is a row, not the column names");
  assert.equal(t.headers[0], "Column 1"); assert.equal(t.rows[0]["Column 3"], 437428.41);
  assert.match(t.note, /no header row/);
  const survey = '"A-1"\t"S"\t0.00\t270.00\t-59.75\t1.00\t"CollSight"\r\n"A-1"\t"S"\t20.00\t271.21\t-63.00\t1.00\t"Unknown"\r\n';
  const ts = parseTableText(survey);
  assert.equal(ts.rows.length, 2); assert.equal(ts.rows[1]["Column 4"], 271.21, "a CRLF file: the header is joined with its own line end");
  // not header-less
  assert.equal(addMissingHeader("Hole_ID,From,To,Au\nA1,0,1,0.5\nA1,1,2,0.7\n"), null);
  assert.equal(addMissingHeader("Hole,400,410,420,430\nA,0.1,0.2,0.3,0.4\nB,0.2,0.3,0.4,0.5\n"), null, "wavelengths in order are labels");
  assert.equal(addMissingHeader("Metric,2019,2020,2021\nAu,1.2,3.4,5.1\n"), null, "so are years");
  assert.equal(addMissingHeader("1,2,3,4\n5,6,7,8\n"), null, "all numbers: nothing says it is not a header");
  assert.equal(addMissingHeader("a,b\n1,2\n"), null, "fewer than four columns");
  // an SL3 table is never given one
  assert.ok(!/no header row/.test(parseTableText(SL3_CSV).note));
});

test("#4067 MGA, AMG and local coordinate columns side by side: three sets, the current datum offered first; AGD66 / AMG84 named in the header", () => {
  const side = ["Hole ID", "E MGA", "N MGA", "AMG E", "AMG N", "Loc E", "Loc N", "Grid", "Rl m", "Azi MGA", "Azi Mag", "Azi Local", "Dip", "EOH m"];
  const g = gridCoordinateColumns(side);
  assert.deepEqual(g.map((x) => [x.prefix, x.x, x.y]), [["mga", "E MGA", "N MGA"], ["amg", "AMG E", "AMG N"], ["loc", "Loc E", "Loc N"]]);
  assert.equal(gridElevation(side), "", "'Rl m' is not a grid-named elevation: the guesser's own elevation rule takes it");
  assert.equal(guessTarget(side), "collars");
  const m = guessMapping("collars", side);
  assert.equal(m.x, "E MGA"); assert.equal(m.y, "N MGA"); assert.equal(m.hole_id, "Hole ID"); assert.equal(m.z, "Rl m");
  // never mixed: the other sets are named for the dialog's note
  const j = judgeCoordMapping(side, m);
  assert.deepEqual(j.others.map((s) => s.key).sort(), ["AMG", "LOC"]); assert.equal(j.mixed, null);
  // the datum in brackets, or glued to the axis, names the grid
  assert.deepEqual(gridCoordinateColumns(["Hole_ID", "Easting (AGD66)", "Northing (AGD66)", "RL", "Depth"]).map((x) => [x.prefix, x.x, x.y]), [["agd66", "Easting (AGD66)", "Northing (AGD66)"]]);
  const amg = ["Hole-ID", "EastingAMG84", "NorthingAMG84", "Height (MSL)", "Depth", "Azimuth", "Dip"];
  assert.equal(guessTarget(amg), "collars");
  assert.deepEqual([guessMapping("collars", amg).x, guessMapping("collars", amg).y, guessMapping("collars", amg).z], ["EastingAMG84", "NorthingAMG84", "Height (MSL)"]);
  // a unit in brackets is still a unit, and a lone 'E' / 'N' with no grid word never pairs
  assert.equal(gridCoordinateColumns(["Hole", "Depth (m)", "E mail", "N notes"]).length, 0);
  assert.equal(gridCoordinateColumns(["Hole", "Easting (m)", "Northing (m)"]).length, 0, "plain names stay with the plain-name guesser");
});

test("#4067 a survey with a local-grid and a map-grid azimuth: the map grid's is read, the local one listed; 'survey_dep' is the depth", () => {
  const h = ["hole_id", "survey_dep", "Dip", "Local_Grid", "Local_Azim", "UTM_Azimut"];
  const rows = [{ hole_id: "A", survey_dep: 0, Dip: -70, Local_Grid: "MGA94-55", Local_Azim: 7, UTM_Azimut: 7 }, { hole_id: "A", survey_dep: 30, Dip: -68.4, Local_Grid: "MGA94-55", Local_Azim: 6.2, UTM_Azimut: 6.2 }];
  const d = detectAzimuthRef(h, rows);
  assert.equal(d.ref, "grid"); assert.equal(d.azimuthCol, "UTM_Azimut"); assert.deepEqual(d.also, [{ col: "Local_Azim", ref: "local" }]);
  assert.equal(guessMapping("survey", h).depth, "survey_dep");
  const c = detectAzimuthRef(["Hole ID", "Azi MGA", "Azi Mag", "Azi Local", "Dip"], [{ "Hole ID": "A", "Azi MGA": 312, "Azi Mag": 303, "Azi Local": "", Dip: -60 }, { "Hole ID": "B", "Azi MGA": 100, "Azi Mag": 91, "Azi Local": "", Dip: -60 }]);
  assert.equal(c.azimuthCol, "Azi MGA"); assert.deepEqual(c.also.map((x) => x.ref), ["magnetic"], "an empty local column is not offered");
  // a local azimuth on its own is not a north this reads
  assert.equal(detectAzimuthRef(["hole_id", "depth", "Azimuth", "Local_Azim", "dip"], [{ hole_id: "A", depth: 1, Azimuth: 1, Local_Azim: 2, dip: -60 }]), null);
  // the spellings Azim / Azimut name a north too
  assert.equal(detectAzimuthRef(["hole_id", "depth", "Azimut_MAG", "dip"], [{ hole_id: "A", depth: 1, Azimut_MAG: 5, dip: -60 }]).ref, "magnetic");
});

test("#4067 wiring: the header-less read and the UTF-16 note are in the table reader, each with its messages in every language", () => {
  const t = readFileSync(new URL("../src/lib/tabular.js", import.meta.url), "utf8");
  assert.ok(t.includes("addMissingHeader(text)") && t.includes('headerless ? tr("This table has no header row'));
  assert.ok(t.includes('encoding === "utf-16le" || encoding === "utf-16be"'));
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(j["{v}Read as UTF-16 text (the file starts with a UTF-16 byte-order mark)."], lang);
    assert.ok(j["This table has no header row (its first row is data): its {n} columns are named Column 1, Column 2 and so on. Say what each one is when you map the columns."], lang);
  }
});
