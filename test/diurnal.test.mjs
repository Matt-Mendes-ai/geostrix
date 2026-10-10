// TASKS.csv #610 — diurnal correction of ground mag from base-station files.
import test from "node:test";
import assert from "node:assert/strict";
import { parseClock, gemHeaderInfo, parseBaseStation, diurnalCorrect, suggestClockShift, diurnalSummaryText } from "../src/lib/diurnal.js";
import { parseXYZ } from "../src/lib/geosoft.js";

const BASE = `/Gem Systems GSM-19 4021347 v7.0 31 V 2018 A e3.v7
/ID 1 file 01survey.b   19 VI 21
/datum  54000.00
/= time:time:ID
/= diurnal:real
/= signal:real
/
10:00:00.0  57100.00 99
10:01:00.0  57110.00 99
10:02:00.0  57090.00 99
10:03:00.0  57100.00 99
10:04:00.0  57000.00 30
`;
const ROVER = `/Gem Systems GSM-19WV 5026975 v7.0 6 V 2019 M ewv6flu..v7o
/ID 1 file 01survey.wmv 19 VI 21
/UTC-07
/X Y elev rawmag sq cormag sat time
line  6412.1
 0607366.62  6357597.20  001499  56700.00 99  000000.00 08 10:00:30.0
 0607366.32  6357596.99  001499  56700.00 99  000000.00 08 10:01:00.0
 0607366.24  6357596.33  001499  56700.00 99  000000.00 07 10:05:00.0
`;

test("#610 clock times and GEM headers", () => {
  assert.equal(parseClock("10:46:26.0"), 10 * 3600 + 46 * 60 + 26);
  assert.equal(parseClock("07:55"), 7 * 3600 + 55 * 60);
  assert.equal(parseClock("57117.85"), null);
  assert.deepEqual({ ...gemHeaderInfo(ROVER), instrument: undefined }, { date: "2021-06-19", utcOffsetH: -7, instrument: undefined });
  const { rows } = parseXYZ(ROVER);
  assert.equal(rows[0].time, 36030); // was 10 (parseFloat of "10:00:30.0")
});

test("#610 base file: readings sorted, low signal quality dropped, median level", () => {
  const b = parseBaseStation(BASE, { name: "Base3" });
  assert.equal(b.samples.length, 4); assert.equal(b.lowQuality, 1);
  assert.equal(b.date, "2021-06-19"); assert.equal(b.median, 57100);
  assert.throws(() => parseBaseStation("/nothing\nfoo bar\n", { name: "x.tbl" }), /no base-station readings/);
});

test("#610 correction = raw − (base(t) − datum), outside coverage left out", () => {
  const b = parseBaseStation(BASE, { name: "Base3" });
  const { rows } = parseXYZ(ROVER);
  const r = diurnalCorrect(rows.map((x) => x.time), rows.map((x) => x.rawmag), [b]);
  assert.equal(r.datum, 57100);
  assert.equal(r.corrected[0], 56695); // base 57105 at 10:00:30 -> +5 nT drift removed
  assert.equal(r.corrected[1], 56690); // base 57110 at 10:01:00
  assert.equal(r.corrected[2], null); // 10:05 is after the last good base reading
  assert.equal(r.used, 2); assert.equal(r.outside, 1);
  assert.match(diurnalSummaryText(r, 3), /2 of 3 .*1 outside the base coverage/);
  // an explicit datum shifts the level only
  assert.equal(diurnalCorrect([36030], [56700], [b], { datum: 57000 }).corrected[0], 56595);
});

test("#610 two bases: their deviations are averaged, not their levels", () => {
  const b1 = parseBaseStation(BASE, { name: "B1" });
  const b2 = parseBaseStation(BASE.replace(/ (5\d{4}\.\d\d) 99/g, (m, v) => ` ${(Number(v) - 100).toFixed(2)} 99`), { name: "B2" }); // same drift, 100 nT lower
  const r = diurnalCorrect([36030], [56700], [b1, b2]);
  assert.equal(r.corrected[0], 56695); // deviation +5 from both, not polluted by the 100 nT level difference
  assert.equal(r.datum, 57050);
});

test("#610 gaps over a minute are not interpolated; a clock offset is suggested, not applied", () => {
  const b = parseBaseStation("10:00:00 57100\n10:10:00 57120\n", { name: "gappy" });
  const r = diurnalCorrect([36300], [56700], [b]);
  assert.equal(r.corrected[0], null); assert.equal(r.gaps, 1);
  assert.equal(diurnalCorrect([36300], [56700], [b], { maxGapSec: 900 }).corrected[0], 56700); // base 57110 = its median
  assert.deepEqual(suggestClockShift([36300 + 7 * 3600], [b]), { hours: -7, covered: 1, of: 1 });
  assert.equal(suggestClockShift([36300], [b]), null);
});
