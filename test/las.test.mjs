// TASKS.csv #492 — LAS 1.2 / 2.0 downhole logs (CWLS spec) to an import table.
import test from "node:test";
import assert from "node:assert/strict";
import { parseLAS } from "../src/lib/las.js";

const UNWRAPPED = `~VERSION INFORMATION
 VERS.                 2.0 :   CWLS LOG ASCII STANDARD -VERSION 2.0
 WRAP.                  NO :   ONE LINE PER DEPTH STEP
~WELL INFORMATION
#MNEM.UNIT       DATA                       DESCRIPTION
 STRT.M          100.0000                  :START DEPTH
 STOP.M          100.3000                  :STOP DEPTH
 STEP.M            0.1000                  :STEP
 NULL.          -999.25                    :NULL VALUE
 WELL.          DDH-21-007                 :WELL
 DATE.          2021-06-19 12:30           :LOG DATE (has a colon)
~CURVE INFORMATION
 DEPT.M                      :  1  DEPTH
 GR  .GAPI                   :  2  GAMMA RAY
 MAGSUS.SI                   :  3  MAGNETIC SUSCEPTIBILITY
 RHOB.G/C3                   :  4  BULK DENSITY
~PARAMETER INFORMATION
 BHT .DEGC      35.5000                    :BOTTOM HOLE TEMPERATURE
~A  DEPTH     GR      MAGSUS   RHOB
100.0000   45.2   0.0012   2.71
100.1000   47.9   -999.25  2.70
100.2000   51.0   0.0035   -999.25
100.3000   49.5   0.0020   2.69
`;

test("#492 LAS 2.0, unwrapped: well -> hole id, curves -> columns, NULL -> blank", () => {
  const r = parseLAS(UNWRAPPED, "ddh7.las");
  assert.deepEqual(r.headers, ["hole_id", "depth", "GR", "MAGSUS", "RHOB"]);
  assert.equal(r.rows.length, 4);
  assert.deepEqual(r.rows[0], { hole_id: "DDH-21-007", depth: 100, GR: 45.2, MAGSUS: 0.0012, RHOB: 2.71 });
  assert.equal(r.rows[1].MAGSUS, ""); assert.equal(r.rows[2].RHOB, "");
  assert.equal(r.nullValue, -999.25); assert.equal(r.wrapped, false);
  assert.match(r.note, /GR \(GAPI\), MAGSUS \(SI\), RHOB \(G\/C3\)/); assert.match(r.note, /2 value\(s\) left blank/);
});

test("#492 wrapped records (WRAP. YES), feet depths converted, file name as hole id when WELL is blank", () => {
  const wrapped = `~V
 VERS. 2.0 :
 WRAP. YES :
~W
 STRT.FT 1000.0 :
 NULL. -999.25 :
 WELL.  :
~C
 DEPT.FT :
 C1.API :
 C2.API :
 C3.OHMM :
 C4.OHMM :
~A
1000.0
 10 20
 30 40
1000.5
 11 -999.25
 31 41
`;
  const r = parseLAS(wrapped, "Hole_9.las");
  assert.equal(r.wrapped, true);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0], { hole_id: "Hole_9", depth: 304.8, C1: 10, C2: 20, C3: 30, C4: 40 });
  assert.equal(r.rows[1].depth, +(1000.5 * 0.3048).toFixed(4)); assert.equal(r.rows[1].C2, "");
  assert.match(r.note, /converted from feet/);
});

test("#492 no NULL declared: the common markers read as missing, and said so; repeated mnemonics kept apart", () => {
  const r = parseLAS(`~V\n VERS. 1.2 :\n~W\n WELL. X1 :\n~C\n DEPT.M :\n GR.API :\n GR.API :\n~A\n5 1 -9999\n6 2 3\n`, "x.las");
  assert.deepEqual(r.headers, ["hole_id", "depth", "GR", "GR_2"]);
  assert.equal(r.rows[0].GR_2, ""); assert.match(r.note, /No NULL value declared/);
});

test("#492 refused with a reason: LAS 3.0, no ~A, depth only", () => {
  assert.throws(() => parseLAS(`~V\n VERS. 3.0 :\n~A\n1 2\n`, "a.las"), /LAS 3\.0.*LAS 2\.0/);
  assert.throws(() => parseLAS(`~V\n VERS. 2.0 :\n~C\n DEPT.M :\n GR.API :\n`, "b.las"), /no ~A/);
  assert.throws(() => parseLAS(`~V\n VERS. 2.0 :\n~C\n DEPT.M :\n~A\n1\n2\n`, "c.las"), /at least one more/);
});
