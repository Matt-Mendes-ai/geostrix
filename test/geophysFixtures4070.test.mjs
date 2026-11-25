// TASKS.csv #4070 (side 2) — the synthetic TEM, MT and FDEM fixtures (test/fixtures/geophys4070, made up by make.mjs) match their generator and read
// with GeoStrix's own readers, so the live checks of those panes have data that loads.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { temWorkbench, mtEdi, fdemDualem, dhemMaxwell } from "./fixtures/geophys4070/make.mjs";
import { readTemText, channelMatrix, tauAll, linesOf } from "../src/lib/temLines.js";
import { parseEdi, soundingCurves } from "../src/lib/edi.js";
import { isFdemCsv, fdemFromCsv } from "../src/lib/fdem.js";
import { readDownholeEm, matchEmHoles } from "../src/lib/downholeEm.js";

const fx = (name) => readFileSync(new URL(`./fixtures/geophys4070/${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the files on disk are what make.mjs writes", () => {
  assert.equal(fx("tem_lines_SYNTHETIC.xyz"), temWorkbench());
  for (let k = 0; k < 5; k++) assert.equal(fx(`mt_SYNTHETIC_${k + 1}.edi`), mtEdi(k));
  assert.equal(fx("fdem_dualem_SYNTHETIC.csv"), fdemDualem());
  assert.equal(fx("dhem_maxwell_SYNTHETIC.tem"), dhemMaxwell().replace(/\r\n/g, "\n")); // written CRLF, as the files are; git may store it LF
});

test("TEM lines: a Workbench export in MGA 51, 3 lines of 41 stations, 16 gates, tau 0.3 ms to 1.6 ms over the conductor", () => {
  const t = readTemText(fx("tem_lines_SYNTHETIC.xyz"), "tem_lines_SYNTHETIC.xyz");
  assert.equal(t.source, "Aarhus Workbench / SkyTEM .xyz"); assert.equal(t.epsg, 28351); assert.equal(t.n, 123);
  assert.deepEqual(linesOf(t).map((l) => l.key), ["1000", "1010", "1020"]);
  const g = t.groups[0], times = t.gateTimes(g);
  assert.equal(times.length, 16);
  const { tau } = tauAll(channelMatrix(t, g), times);
  assert.ok(Math.abs(Math.max(...tau) - 1.6) < 0.02 && Math.abs(Math.min(...tau) - 0.3) < 0.01);
});

test("MT: five SI soundings with no warnings, 0.005 degrees apart; resistive at high frequency, conductive at low", () => {
  for (let k = 1; k <= 5; k++) {
    const e = parseEdi(fx(`mt_SYNTHETIC_${k}.edi`), `mt_SYNTHETIC_${k}.edi`);
    assert.equal(e.units, "SI"); assert.deepEqual(e.warnings, []); assert.equal(e.id, `SYN0${k}`);
    assert.ok(Math.abs(e.lon - (122.545 + 0.005 * (k - 1))) < 1e-6 && Math.abs(e.lat + 31.07) < 1e-6);
    const c = soundingCurves(e), hiF = c.freqs.indexOf(Math.max(...c.freqs)), loF = c.freqs.indexOf(Math.min(...c.freqs));
    assert.ok(c.rho.xy[hiF] > 200 && c.rho.xy[loF] < 20, `station ${k}: ${c.rho.xy[hiF]} / ${c.rho.xy[loF]}`);
  }
});

test("FDEM: a DUALEM CSV, six coil pairs, 80 readings with positions and the DEM elevation", () => {
  const txt = fx("fdem_dualem_SYNTHETIC.csv");
  assert.ok(isFdemCsv(txt));
  const f = fdemFromCsv(txt, "fdem_dualem_SYNTHETIC.csv");
  assert.equal(f.instrument, "DUALEM");
  assert.deepEqual(f.coils.map((c) => `${c.geom} ${c.sep}`), ["HCP 1", "PRP 1.1", "HCP 2", "PRP 2.1", "HCP 4", "PRP 4.1"]);
  assert.equal(f.data.length, 80); assert.equal(f.readings.zFrom, "dem_elevation_m"); assert.ok(f.readings.x);
});

test("borehole EM: a Maxwell table for a made-up hole, A / U / V at 30 stations, 10 gates; it matches no project hole by name", () => {
  const r = readDownholeEm(fx("dhem_maxwell_SYNTHETIC.tem"), "dhem_maxwell_SYNTHETIC.tem");
  assert.equal(r.kind, "maxwell"); assert.equal(r.units, "nT/s"); assert.equal(r.nch, 10); assert.deepEqual(r.warnings, []);
  assert.equal(r.holes.length, 1); assert.equal(r.holes[0].id, "DH-SYN-01");
  for (const c of ["A", "U", "V"]) assert.equal(r.holes[0].comps[c].length, 30, c);
  assert.equal(matchEmHoles(["DH-SYN-01"], ["DH-23-001", "DH-23-002"])[0].hole, null);
});
