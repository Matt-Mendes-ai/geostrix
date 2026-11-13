// TASKS.csv #3075 (#2900 (8), WA review) — a collar file's ENDDATE ('14-Nov-18') was kept as text with hundreds of values, so never offered to
// filter or colour holes by. A date column is stored as ISO dates and its year becomes a field of its own. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dateColumnReader, withDateFields } from "../src/lib/dateColumns.js";
import { collarAttrChoices } from "../src/lib/holeFilter.js";

const read = (vals) => { const r = dateColumnReader(vals); return r && !r.ambiguous ? vals.map((v) => r.toIso(v)) : r; };

test("the date forms of collar files read as ISO dates", () => {
  assert.deepEqual(read(["14-Nov-18", "02-Dec-18", "30-Jan-19"]), ["2018-11-14", "2018-12-02", "2019-01-30"]);
  assert.deepEqual(read(["14 November 2018", "3 SEPT 2019"]), ["2018-11-14", "2019-09-03"]);
  assert.deepEqual(read(["Nov 14, 2018", "September 3, 2019"]), ["2018-11-14", "2019-09-03"]);
  assert.deepEqual(read(["2018-11-14", "2019/01/02", "2019-01-02T10:15:00"]), ["2018-11-14", "2019-01-02", "2019-01-02"]);
  assert.deepEqual(read(["14-Nov-98", "14-Nov-49"]), ["1998-11-14", "2049-11-14"], "a two-digit year is 1950-2049");
});

test("numeric dates: the column decides day / month; a column that cannot is kept as written", () => {
  assert.deepEqual(read(["14/11/2018", "03/04/2018"]), ["2018-11-14", "2018-04-03"]); // a day over 12: day first
  assert.deepEqual(read(["11/14/2018", "03/04/2018"]), ["2018-11-14", "2018-03-04"]); // a month-day: month first
  assert.deepEqual(dateColumnReader(["03/04/2018", "05/06/2018"]), { ambiguous: true });
  assert.equal(dateColumnReader(["14/11/2018", "11/14/2018"]), null, "both ways round: not dates");
});

test("codes, years, impossible dates and a single value are not date columns; blanks are skipped", () => {
  for (const v of [["RC", "DD"], ["2018", "2019"], ["31-Feb-18", "30-Feb-18"], ["14-Nov-18"], ["14-Nov-18", "pending", "TBC"]]) assert.equal(dateColumnReader(v), null, v.join(","));
  assert.deepEqual(read(["14-Nov-18", "", "  ", "1-Dec-18"]).filter(Boolean), ["2018-11-14", "2018-12-01"]);
  assert.ok(dateColumnReader(["14-Nov-18", "1-Dec-18", "2-Dec-18", "3-Dec-18", "4-Dec-18", "5-Dec-18", "6-Dec-18", "7-Dec-18", "8-Dec-18", "9-Dec-18", "n/a"]), "90 % of the cells");
});

test("a collar's attrs take the ISO date and a year field, which the hole filter offers", () => {
  const rd = new Map([["ENDDATE", dateColumnReader(["14-Nov-18", "2-Jan-19"])]]);
  assert.deepEqual(withDateFields({ ENDDATE: "14-Nov-18", Prospect: "A" }, rd), { ENDDATE: "2018-11-14", Prospect: "A", "ENDDATE year": "2018" });
  assert.deepEqual(withDateFields({ ENDDATE: "unknown" }, rd), { ENDDATE: "unknown" }, "a cell that does not read stays as written");
  assert.deepEqual(withDateFields({ ENDDATE: "14-Nov-18", "ENDDATE year": "FY19" }, rd), { ENDDATE: "2018-11-14", "ENDDATE year": "FY19" }, "the file's own field is not overwritten");
  // 200 holes drilled over two years: the dates are too many to offer, the year is offered
  const days = Array.from({ length: 200 }, (_, i) => new Date(Date.UTC(2018, 0, 1 + i * 3)));
  const txt = (d) => `${d.getUTCDate()}-${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(2)}`;
  const r2 = new Map([["ENDDATE", dateColumnReader(days.map(txt))]]);
  const collars = days.map((d, i) => ({ hole_id: `H${i}`, attrs: withDateFields({ ENDDATE: txt(d) }, r2) }));
  const ch = collarAttrChoices(collars);
  assert.deepEqual(ch.map((c) => c.key), ["ENDDATE year"]);
  assert.deepEqual(ch[0].values, ["2018", "2019"]);
});

test("the collar import reads the date columns and says so", () => {
  const s = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(s, /\.\.\.withHoleType\(withDates\(surfaceAttrs\(r, attrCols\)\), r\)/);
  assert.match(s, /tr\("\{fileName\}: \{cols\} read as dates/);
  assert.match(s, /tr\("\{fileName\}: \{cols\} kept as written: every date there could be day\/month or month\/day\."/);
});
