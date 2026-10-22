// TASKS.csv #826 — Res2DInv .dat import: electrode positions per array, mid-point x-locations, the general array with IP
// and resistances, refusals, and the hand-off to the DC/IP panel's own column guess and row parser
import test from "node:test";
import assert from "node:assert/strict";
import { parseRes2dinv, geometricFactor } from "../src/lib/res2dinv.js";
import { guessDcipColumns, parseDcipRows } from "../src/lib/dcip.js";

const els = (r) => [r.A, r.B, r.M, r.N].map((v) => (v === "*" ? null : Number(v)));

test("#826 Wenner and dipole-dipole: the electrodes where the manual puts them", () => {
  const w = parseRes2dinv("Line W\n5.0\n1\n3\n0\n0\n0 5 100.5\n5 5 110\n0 10 120\n0\n0\n0\n0\n");
  assert.equal(w.rows.length, 3);
  assert.deepEqual(els(w.rows[0]), [0, 15, 5, 10]); // C1 P1 P2 C2 at x, x+a, x+2a, x+3a
  assert.deepEqual(els(w.rows[2]), [0, 30, 10, 20]);
  assert.equal(w.rows[1].Rho, "110");
  const dd = parseRes2dinv("Line DD\n10\n3\n2\n0\n0\n0 10 2 55\n20 10 3 60\n");
  assert.deepEqual(els(dd.rows[0]), [10, 0, 30, 40]); // C2 C1 P1 P2 at x, x+a, x+a+na, x+2a+na
  assert.deepEqual(els(dd.rows[1]), [30, 20, 60, 70]);
  assert.match(dd.note, /dipole-dipole, unit spacing 10 m, 2 of 2 readings/);
});

test("#826 Wenner-Schlumberger with mid-point x-locations, and pole-dipole forward / reverse", () => {
  // mid-point 50, a 10, n 2: C1 P1 P2 C2 spans 2na + a = 50 m -> 25 .. 75
  const ws = parseRes2dinv("WS\n10\n7\n1\n1\n0\n50 10 2 80\n");
  assert.deepEqual(els(ws.rows[0]), [25, 75, 45, 55]);
  const pd = parseRes2dinv("PD\n5\n6\n2\n0\n0\n100 5 2 40\n100 5 -2 41\n");
  assert.deepEqual(els(pd.rows[0]), [100, null, 110, 115]);
  assert.deepEqual(els(pd.rows[1]), [100, null, 90, 85]);
  assert.match(pd.note, /2 with a remote electrode/);
});

test("#826 general array: explicit electrodes, chargeability, resistances turned into apparent resistivity", () => {
  const txt = [
    "General array test", "1.0", "11", "0", "Type of measurement (0=app.resistivity,1=resistance)", "1", "3", "2", "1",
    "Chargeability", "mV/V", "0.12, 0.26",
    "4 0 0 1 0 2 0 3 0 0.5 12.3", // a Wenner, resistance 0.5 ohm
    "3 10 0 12 0 13 0 0.2 8.1",   // pole-dipole
    "4 0 0 5 0 2 0 3 0 1.0 9.9",
  ].join("\n");
  const g = parseRes2dinv(txt);
  assert.deepEqual(g.headers, ["A", "B", "M", "N", "Rho", "IP"]);
  assert.deepEqual(els(g.rows[0]), [0, 1, 2, 3]);
  const K = geometricFactor([0, 1, 2, 3]); // C1 0, C2 1, P1 2, P2 3
  assert.ok(Math.abs(Number(g.rows[0].Rho) - 0.5 * K) < 1e-9);
  assert.deepEqual(els(g.rows[1]), [10, null, 12, 13]);
  assert.equal(g.rows[1].IP, "8.1");
  assert.ok(g.res2dinv.resistance && g.res2dinv.ip);
  assert.match(g.note, /resistances converted/);
  // Wenner alpha K = 2 pi a
  assert.ok(Math.abs(geometricFactor([0, 30, 10, 20]) - 2 * Math.PI * 10) < 1e-9);
});

test("#826 the panel's column guess and row parser take the Res2DInv table as it is", () => {
  const dd = parseRes2dinv("Line DD\n10\n3\n2\n0\n1\nChargeability\nmsec\n0.1 0.2\n0 10 2 55 3.2\n20 10 3 60 4.1\n");
  const m = guessDcipColumns(dd.headers);
  assert.deepEqual([m.a, m.b, m.m, m.n, m.rho, m.ip], ["A", "B", "M", "N", "Rho", "IP"]);
  const p = parseDcipRows(dd.rows, m);
  assert.equal(p.readings.length, 2);
  assert.deepEqual(p.readings[0], [10, 0, 30, 40]);
  assert.deepEqual(p.rho, [55, 60]);
  assert.match(dd.note, /Chargeability is in msec, not mV\/V/);
});

test("#826 not a Res2DInv file -> null; ones it cannot read -> a reason", () => {
  assert.equal(parseRes2dinv("A,B,M,N,rho\n0,30,10,20,100\n"), null);
  assert.equal(parseRes2dinv("title\nnot a number\n3\n1\n0\n0\n"), null);
  assert.throws(() => parseRes2dinv("EQ\n10\n8\n1\n0\n0\n0 10 2 5 50\n"), /equatorial/);
  assert.throws(() => parseRes2dinv("bad\n10\n3\nx\ny\nz\n"), /header could not be read/);
});
