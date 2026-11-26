// TASKS.csv #4083 — a tab-delimited 'H / D' table whose D rows start their values in the SECOND field ('D', the hole id, ...) names its columns from the second field too ('H1000', 'HOLEID', ...): the
// converter read the names from the third (the shape of the GSQ template, where a D row is a 'D', an empty field, then the values) and dropped the hole id from the header, so the collar table of NZP&M's
// mr5333 (DH_Collar.txt) and SARIG's mesac3052 (DrillCollars) had no Hole ID column to map. Synthetic tables of both shapes; the real files are not in the repository.
import test from "node:test";
import assert from "node:assert/strict";
import { sl3ToTable } from "../src/lib/sl3Table.js";
import { parseTableText } from "../src/lib/tabular.js";
import { guessTargetFor, guessMapping, schemaSatisfied } from "../src/lib/layersImport.js";

const tab = (...rows) => rows.map((r) => r.join("\t")).join("\n") + "\n";
const pad = (r, n) => r.concat(Array(Math.max(0, n - r.length)).fill(""));

// NZP&M's shape: the names from the second field, a units row labelled by nothing, a resolution row (H1004), the D rows 'D', the hole id, ...; padded with tabs; an EOF row
const NZ_NAMES = ["HOLEID", "PROJECTCODE", "MGPG_X", "MGPG_Y", "MGPG_Z", "NZMG_X", "NZMG_Y", "NZMG_Z", "DEPTH", "OBJECTCATEGORY", "STARTDATE"];
const NZ = tab(
  ["H0001", "Date_generated", "26.04.2016"], ["H0102", "Project_name", "Made Up Project"],
  pad(["H1000", ...NZ_NAMES], 12), pad(["H1001", "", "", "metres", "metres", "metres", "metres", "metres", "metres", "metres"], 12), pad(["H1004", "", "", "0.001", "0.001", "0.001", "0.01", "0.01", "0.001", "0.1"], 12),
  pad(["D", "RCH0001", "MGP", "69949.85", "14101.79", "554.24", "2309839.833", "5535112.709", "554.24", "154", "RCH_surface", "6-Apr-94"], 12),
  pad(["D", "RCH0002", "MGP", "69997.91", "14248.89", "522.09", "2309765.92", "5535248.665", "522.09", "112", "RCH_surface", "7-Apr-94"], 12),
  pad(["EOF"], 12),
);
// SARIG's shape: names on H1000 from the second field, the units on H1001 labelled 'Text' / 'Metres' / 'degrees', the D rows 'D', the hole id, ...
const SA = tab(
  ["H0002", "Version  4"], ["H0003", "Date_generated", "01-Jun-20"],
  ["H1000", "Hole_ID", "EastMGA", "NorthMGA", "Alt_AHD", "Depth", "Dip", "Azi"], ["H1001", "Text", "Metres", "Metres", "Metres", "Metres", "degrees", "degrees"],
  ["D", "RC18AAA001", "348835", "7098865", "420", "225", "-70", "35"], ["D", "RC18AAA002", "348900", "7098900", "421", "180", "-60", "90"], ["EOF"],
);
// the GSQ template's shape (a D row is 'D', an empty field, then the values): unchanged
const GSQ = tab(
  ["H0100", "Tenement", "EPM00000"],
  ["H1000", "", "HOLE_ID", "MGA_E", "MGA_N", "MGA_RL", "TD"], ["H1001", "Units", "", "m", "m", "m", "m"],
  ["D", "", "GSQ0001", "400000", "7000000", "100", "150"], ["D", "", "GSQ0002", "400100", "7000100", "102", "90"], ["EOF"],
);

test("#4083 NZP&M's tab collar table keeps its hole id as the first column, aligned with its values", () => {
  const t = sl3ToTable(NZ);
  assert.deepEqual(t.names.slice(0, 4), ["HOLEID", "PROJECTCODE", "MGPG_X", "MGPG_Y"]);
  assert.equal(t.names.length, NZ_NAMES.length);
  const r = parseTableText(NZ);
  assert.equal(r.headers[0], "HOLEID");
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].HOLEID, "RCH0001"); assert.equal(r.rows[1].HOLEID, "RCH0002");
  assert.equal(String(r.rows[0].MGPG_X), "69949.85"); assert.equal(String(r.rows[0].DEPTH), "154");
});

test("#4083 SARIG's tab collar table keeps Hole_ID; its units row does not become a data row or shift the columns", () => {
  const r = parseTableText(SA);
  assert.deepEqual(r.headers, ["Hole_ID", "EastMGA", "NorthMGA", "Alt_AHD", "Depth", "Dip", "Azi"]);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].Hole_ID, "RC18AAA001"); assert.equal(String(r.rows[0].EastMGA), "348835"); assert.equal(String(r.rows[1].Azi), "90");
});

test("#4083 the GSQ template's shape (the values from the third field) reads as before", () => {
  const r = parseTableText(GSQ);
  assert.equal(r.headers[0], "HOLE_ID");
  const rl = r.headers.find((h) => /MGA_RL/.test(h)); assert.equal(r.rows[0].HOLE_ID, "GSQ0001"); assert.equal(String(r.rows[1][rl]), "102");
  assert.match(r.headers.join(","), /MGA_E \(m\)|MGA_E/);
});

test("#4083 both collar tables are now guessed as collars with the hole id mapped (the drag-drop route: the reader, the file name, the headers, the rows)", () => {
  for (const [text, name] of [[NZ, "MP00000_DH_Collar.txt"], [SA, "EL0000_DrillCollars Edited.txt"]]) {
    const r = parseTableText(text);
    assert.equal(guessTargetFor(r.headers, name, r.rows), "collars", name);
    const m = guessMapping("collars", r.headers);
    assert.ok(m.hole_id && m.x && m.y, `${name}: hole id ${m.hole_id}, x ${m.x}, y ${m.y}`);
    assert.ok(schemaSatisfied("collars", m) || !m.z, `${name}: the required fields are mapped (the elevation may be the user's pick)`);
  }
});
