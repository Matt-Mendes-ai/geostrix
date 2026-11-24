// TASKS.csv #4060 (found by side 2 reading a Queensland open-file drillhole submission) — the Geological Survey of Queensland's SL3 'H / D' text tables were not
// read: H header rows, H1000 / H1001 the column names, a units row, D data rows, EOF. Read into an ordinary table, units in the headers, an inline certified
// reference standard marked as a standard. Every file here is made up, with the shape of the real ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSl3, sl3ToTable } from "../src/lib/sl3Table.js";
import { parseTableText } from "../src/lib/tabular.js";
import { qcColumns, qcFields } from "../src/lib/assayQcColumns.js";
import { sampleTypeClass } from "../src/lib/qaqc.js";
import { guessDcipColumns, parseDcipRows } from "../src/lib/dcip.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// a row padded with trailing tabs to the table's width
const W = 30;
const row = (...f) => f.concat(Array(Math.max(0, W - f.length)).fill("")).join("\t");
const block = (extra = []) => [
  row("H0002", "Version", "3"), row("H0003", "Date_generated", "8/10/2013"), row("H0005", "State", "QLD"), row("H0100", "Tenement_no or Combined_rept_no", "EPM00000"),
  row("H0101", "Tenement_holder", "Example Pty Ltd"), row("H151", "100K_map_sheet_number", "0000"), row("H0202", "Data_format", "SL3"), row("H0203", "Number_of_data_records", "3"),
  row("H0501", "Geodetic_datum", "GDA94"), row("H0503", "Projection", "Universal Transverse Mercator (UTM)"), row("H0531", "Projection_zone", "54"), row("H0802", "Assay_description", '"48 element, four-acid ICP-MS+REE"'),
  ...extra,
];
const sl3 = (lines) => lines.join("\r\n") + "\r\n";

// layout A: the names on H1000, a D row = 'D', an empty field, then the values (a collar table with its survey columns)
const collars = sl3([
  ...block(),
  row("H1000", "Data_field_names", "Project", "SiteID", "Prospect", "SiteType", "EOHDepth", "Collar_mE", "Collar_mN", "CollarRL", "CollarGrid", "SurveyDip_0m", "SurveyAzi_0m", "SurveyGrid"),
  row("D", "", "Proj", "DH-13-001", "", "DD", "300", "450000", "7550000", "250", "MGA94_54", "-61.8", "267.5", "Mag"),
  row("D", "", "Proj", "DH-13-002", "", "DD", "250", "450400", "7550200", "252", "MGA94_54", "-60", "90", "Mag"),
  row("D", "", "Proj", "DH-13-003", "", "DD", "180", "450800", "7550400", "255", "MGA94_54", "-70", "180", "Mag"),
  row("EOF"),
]);
// layout B: the names on H1001 (labelled Units), the UNITS in the first D row, two inline standards, below-detection values
const geochem = sl3([
  ...block(),
  row("H1001", "Units", "Type", "HOLEID", "Standard ID", "SampleID", "Depth From", "Depth To", "Length", "Au", "Ag", "Al", "Cu"),
  row("D", "", "Core", "", "", "", "", "", "", "ppm", "ppm", "%", "ppm"),
  row("D", "", "Core", "DH-13-001", "", "900001", "83", "83.55", "0.55", "0.01", "0.05", "4.28", "120"),
  row("D", "", "Core", "DH-13-001", "", "900002", "83.55", "84.4", "0.85", "<0.01", "0.03", "4.1", "85"),
  row("D", "", "Core", "DH-13-001", "OREAS-68a", "900050", "Standard", "", "", "1.23", "4.5", "8.2", "2850"),
  row("D", "", "Core", "DH-13-002", "", "900003", "10", "11", "1", "0.02", ">100", "3.9", "300"),
  row("D", "", "Core", "DH-13-002", "OREAS-68a", "900051", "Standard", "", "", "1.2", "4.4", "8.1", "2830"),
  row("EOF"),
]);
// a point table with the units on a record labelled Units (H1001), a hole column named 'Hole ID'
const sg = sl3([
  ...block(),
  row("H1000", "Data_field_names", "HOLE_ID", "Depth", "Specific Gravity"),
  row("H1001", "Units", "", "", "g/cc"),
  row("D", "", "DH-13-001", "83.2", "2.71"), row("D", "", "DH-13-001", "90.1", "2.80"),
  row("EOF"),
]);
// an IP submission: H1000 / H1001 hold the .dat's first lines split on tabs, the column names are on H1002
const ip = sl3([
  ...block(),
  row("H1000", "Data_field_names", "", "IP DATA FROM", ": 989-Example-IP.mdb", "(TQIPdb  V2.10)", "22/11/2012"),
  row("H1001", "Data_Info", "", "LINE:", "44100N", "ARRAY:DPDP", "DIPOLE:100.0"),
  row("H1002", "Units", "C1X", "C2X", "P1X", "P2X", "RxDipole", "PltPt", "Nlevel", "I", "Vp", "Res", "Phz", "SD", "Nstack"),
  ...[0, 1, 2, 3].map((s) => row("D", "", String(48600 + s * 100 + 200), String(48600 + s * 100), String(48600 + s * 100 + 300), String(48600 + s * 100 + 400), "100", String(48800 + s * 100), "1", "3.2", "11.286", String(5.32 + s), String(1.36 + s / 10), "0.065", "4")),
  row("EOF"),
]);
// two columns with one name (a pXRF file's 'Type'), a text column with a double quote in it
const pxrf = sl3([
  ...block(),
  row("H1000", "Data_field_names", "Type", "LOCATION", "Type", "Depth(m)", "As", "As Error", "Comments"),
  row("H1001", "Units", "", "", "", "m", "ppm", "ppm", ""),
  row("D", "", "Core", "DH-13-001", "Reading", "83.2", "12", "3", 'fine 5" core'),
  row("EOF"),
]);

test("detection: a record code in the first field and D rows; a plain table is not SL3", () => {
  assert.equal(isSl3(collars), true); assert.equal(isSl3("a,b,c\n1,2,3\n"), false); assert.equal(isSl3("H1000\tx\ty\n1\t2\t3\n"), false, "no D rows");
  assert.equal(sl3ToTable("Hole,From,To\nA,0,1\n"), null);
  assert.equal(sl3ToTable(sl3([row("H0002", "Version", "3"), row("D", "", "1", "2")])), null, "no names record: left to the ordinary reader");
});

test("layout A: the names on H1000, the data from the third field, the padding trimmed, EOF left out", () => {
  const t = parseTableText(collars);
  assert.deepEqual(t.headers, ["Project", "SiteID", "Prospect", "SiteType", "EOHDepth", "Collar_mE", "Collar_mN", "CollarRL", "CollarGrid", "SurveyDip_0m", "SurveyAzi_0m", "SurveyGrid"]);
  assert.equal(t.rows.length, 3); assert.equal(t.rows[0].SiteID, "DH-13-001"); assert.equal(t.rows[0].Collar_mE, 450000); assert.equal(t.rows[1].SurveyAzi_0m, 90);
  assert.match(t.note, /Read as a Queensland SL3 table \(3 rows, 12 columns; the column names are on record H1000\)/);
  assert.match(t.note, /Coordinates: GDA94, zone 54 \(from the header block\)/);
  assert.match(t.note, /The azimuths are magnetic \(column SurveyGrid\): choose the declination when you map the survey\./);
});

test("layout B: the names on H1001, the units from the first D row as 'Au (ppm)', values with < and > kept, the standards marked", () => {
  const r = sl3ToTable(geochem);
  assert.deepEqual(r.names, ["Type", "HOLEID", "Standard ID", "SampleID", "Depth From", "Depth To", "Length", "Au (ppm)", "Ag (ppm)", "Al (%)", "Cu (ppm)"]);
  assert.deepEqual(r.units, { Au: "ppm", Ag: "ppm", Al: "%", Cu: "ppm" }); assert.equal(r.qc, 2);
  const t = parseTableText(geochem);
  assert.equal(t.rows.length, 5, "the units row is not a sample");
  assert.equal(t.rows[1]["Au (ppm)"], "<0.01"); assert.equal(t.rows[3]["Ag (ppm)"], ">100"); assert.equal(t.rows[0]["Cu (ppm)"], 120);
  assert.match(t.note, /2 inline certified reference standard\(s\) \(OREAS-68a\) are marked as standards, not samples\./);
  assert.match(t.note, /the units too/);
  // the type of a standard row says so; the sample rows keep their medium; the QC columns are found as the assay import finds them
  assert.equal(t.rows[2].Type, "Standard"); assert.equal(t.rows[0].Type, "Core");
  const cols = qcColumns(t.headers, t.rows);
  assert.equal(cols.qc_code, "Standard ID"); assert.equal(cols.sample_type, "Type"); assert.equal(cols.sample_id, "SampleID");
  assert.equal(sampleTypeClass(qcFields(t.rows[2], cols).sample_type), "standard"); assert.equal(qcFields(t.rows[2], cols).qc_code, "OREAS-68a");
  assert.equal(qcFields(t.rows[0], cols).sample_type, "Core"); assert.equal(qcFields(t.rows[0], cols).qc_code, undefined);
});

test("with no type column, a 'Sample type' column is added for the standards", () => {
  const text = sl3([...block(), row("H1000", "Data_field_names", "HoleID", "Standard ID", "From", "To", "Au"), row("D", "", "A", "", "0", "1", "0.1"), row("D", "", "A", "CRM-1", "Standard", "", "1.2"), row("EOF")]);
  const t = parseTableText(text);
  assert.deepEqual(t.headers, ["HoleID", "Standard ID", "From", "To", "Au", "Sample type"]);
  assert.deepEqual(t.rows.map((r) => r["Sample type"] ?? ""), ["", "Standard"]);
});

test("units on a record labelled Units, duplicate names, a double quote in a cell", () => {
  const t = parseTableText(sg);
  assert.deepEqual(t.headers, ["HOLE_ID", "Depth", "Specific Gravity (g/cc)"]); assert.equal(t.rows.length, 2); assert.equal(t.rows[1]["Specific Gravity (g/cc)"], 2.8);
  const p = parseTableText(pxrf);
  assert.deepEqual(p.headers, ["Type", "LOCATION", "Type (2)", "Depth(m)", "As (ppm)", "As Error (ppm)", "Comments"]);
  assert.equal(p.rows[0].Comments, 'fine 5" core'); assert.equal(p.rows[0]["As (ppm)"], 12);
});

test("an IP submission in SL3: the names are on H1002, not on the H1000 / H1001 text, and the line reads as a DC/IP line", () => {
  const t = parseTableText(ip);
  assert.deepEqual(t.headers.slice(0, 4), ["C1X", "C2X", "P1X", "P2X"]); assert.equal(t.rows.length, 4);
  const m = guessDcipColumns(t.headers), p = parseDcipRows(t.rows, m);
  assert.deepEqual([m.a, m.b, m.m, m.n, m.rho, m.ip], ["C1X", "C2X", "P1X", "P2X", "Res", "Phz"]);
  assert.equal(p.readings.length, 4); assert.equal(p.ipKind, "phase");
});

test("wired: the table reader converts first and adds the notes; keys in every language", () => {
  const s = read("../src/lib/tabular.js");
  assert.match(s, /const sl3 = sl3ToTable\(text\);/); assert.match(s, /note: \[note, sl3, pre, sp\]/);
  for (const k of ["Read as a Queensland SL3 table ({n} rows, {m} columns; the column names are on record H{h}{u}).", ", the units too", "Coordinates: {v} (from the header block).", "zone {z}",
    "The azimuths are magnetic (column {c}): choose the declination when you map the survey.", "The azimuths are on the grid or true north (column {c}), not magnetic.",
    "{n} inline certified reference standard(s) ({names}) are marked as standards, not samples."])
    for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 40)}`);
});
