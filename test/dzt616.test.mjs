// TASKS.csv #616 — GSSI .DZT reader, .DZG GPS track, and the first processing steps, on files written here byte by byte
// from the published header layout
import test from "node:test";
import assert from "node:assert/strict";
import { readDztHeader, parseDzt, parseDzg, scanPositions, velocityFromEpsr, depthOfTime } from "../src/lib/dzt.js";
import { cutTimeZero, firstBreak, dewow, removeBackground, agc, powerGain, radargramPixels } from "../src/lib/gprProcess.js";

// a DZT: nchan channels, `scans` scans of nsamp samples, sample(c, k, i) -> signed amplitude
function makeDzt({ nchan = 1, nsamp = 64, scans = 10, bits = 16, sps = 32, spm = 20, range = 50, position = 2, epsr = 9, antenna = "3200 MLF", sample }) {
  const bytes = bits / 8, buf = new ArrayBuffer(1024 * nchan + scans * nchan * nsamp * bytes), dv = new DataView(buf);
  for (let c = 0; c < nchan; c++) {
    const o = 1024 * c;
    dv.setUint16(o, 0x00ff, true); dv.setUint16(o + 2, 1024, true); dv.setUint16(o + 4, nsamp, true); dv.setUint16(o + 6, bits, true);
    dv.setInt16(o + 8, bits === 8 ? 0x80 : bits === 16 ? 0x8000 - 65536 : 0, true);
    dv.setFloat32(o + 10, sps, true); dv.setFloat32(o + 14, spm, true); dv.setFloat32(o + 18, 0, true); dv.setFloat32(o + 22, position, true); dv.setFloat32(o + 26, range, true);
    // 2024-05-17 13:42:10 as an RFDate
    dv.setUint32(o + 32, (5) | (42 << 5) | (13 << 11) | (17 << 16) | (5 << 21) | ((2024 - 1980) << 25), true);
    dv.setUint16(o + 52, nchan, true); dv.setFloat32(o + 54, epsr, true);
    for (let i = 0; i < antenna.length; i++) dv.setUint8(o + 98 + i, antenna.charCodeAt(i));
  }
  let p = 1024 * nchan;
  for (let k = 0; k < scans; k++) for (let c = 0; c < nchan; c++) for (let i = 0; i < nsamp; i++, p += bytes) {
    const v = Math.round(sample(c, k, i));
    if (bits === 8) dv.setUint8(p, v + 0x80); else if (bits === 16) dv.setUint16(p, v + 0x8000, true); else dv.setInt32(p, v, true);
  }
  return buf;
}

test("#616 the header: samples, bits, range, scans per metre, dielectric, antenna, date", () => {
  const h = readDztHeader(makeDzt({ sample: () => 0 }));
  assert.equal(h.nsamp, 64); assert.equal(h.bits, 16); assert.equal(h.nchan, 1); assert.equal(h.dataOffset, 1024);
  assert.equal(h.range, 50); assert.equal(h.spm, 20); assert.equal(h.sps, 32); assert.equal(h.epsr, 9);
  assert.equal(h.antenna, "3200 MLF"); assert.equal(h.created, "2024-05-17T13:42:10");
  assert.equal(h.antennaMHz, null, "a model number is not a frequency");
  assert.equal(readDztHeader(makeDzt({ antenna: "3207 100MHz", sample: () => 0 })).antennaMHz, 100);
  assert.throws(() => readDztHeader(new ArrayBuffer(2000)), /tag/);
  assert.throws(() => readDztHeader(new ArrayBuffer(100)), /shorter/);
});

test("#616 samples around the zero offset, 8 / 16 / 32 bits; the two scan-header samples zeroed; two channels de-interleaved", () => {
  for (const bits of [8, 16, 32]) {
    const d = parseDzt(makeDzt({ bits, scans: 3, sample: (c, k, i) => (i < 2 ? 99 : (k + 1) * (i - 30)) }));
    assert.equal(d.nscans, 3);
    assert.equal(d.channels[0][0], 0, "scan-header sample");
    assert.equal(d.channels[0][1 * 64 + 40], 2 * 10, `${bits} bits: scan 1, sample 40`);
    assert.equal(d.channels[0][2 * 64 + 5], 3 * -25);
  }
  const two = parseDzt(makeDzt({ nchan: 2, scans: 4, sample: (c, k, i) => (c ? -1 : 1) * (k * 100 + i) }));
  assert.equal(two.channels.length, 2);
  assert.equal(two.channels[0][3 * 64 + 7], 307); assert.equal(two.channels[1][3 * 64 + 7], -307);
  const d = parseDzt(makeDzt({ sample: () => 0 }));
  assert.ok(Math.abs(d.dt - 50 / 63) < 1e-9); assert.equal(d.distance, 0.05); assert.equal(d.seconds, 1 / 32);
  assert.equal(parseDzt(makeDzt({ spm: 0, sample: () => 0 })).distance, null, "time-based: no survey wheel");
});

test("#616 velocity and depth from the dielectric constant", () => {
  assert.ok(Math.abs(velocityFromEpsr(9) - 0.0999308) < 1e-6);
  assert.ok(Math.abs(depthOfTime(40, 0.1) - 2) < 1e-12);
});

test("#616 the DZG track: $GSSIS scan, then the GGA fix", () => {
  const dzg = [
    "$GSSIS,0,0.000", "$GPGGA,154525.00,5545.1234,N,12930.5000,W,1,08,0.9,640.2,M,-16.0,M,,*4A",
    "$GSSIS,50,1.562", "$GNGGA,154526.56,5545.1300,N,12930.4800,W,2,09,0.8,641.0,M,-16.0,M,,*41",
    "$GSSIS,100,3.125", "$GPGGA,154528.12,,,,,0,00,,,M,,M,,*66", // no fix: dropped
  ].join("\r\n");
  const t = parseDzg(dzg);
  assert.equal(t.length, 2);
  assert.equal(t[0].scan, 0); assert.ok(Math.abs(t[0].lat - (55 + 45.1234 / 60)) < 1e-12); assert.ok(Math.abs(t[0].lon + (129 + 30.5 / 60)) < 1e-12);
  assert.equal(t[1].alt, 641);
  const pos = scanPositions([{ scan: 0, x: 0, y: 0, z: 10 }, { scan: 10, x: 100, y: 50, z: 20 }], 15);
  assert.equal(pos.x[5], 50); assert.equal(pos.y[5], 25); assert.equal(pos.z[5], 15); assert.equal(pos.x[14], 100, "held past the last fix");
});

test("#616 processing: a point target's hyperbola survives dewow, background removal and AGC; flat banding does not", () => {
  const nsamp = 128, scans = 81, dt = 0.5, v = 0.1, x0 = 40, z0 = 1.5, dx = 0.05;
  // a flat band at sample 20 on every trace (direct wave), a slow wow, and a hyperbola from a point at scan 40, 1.5 m deep
  const tHyp = (k) => (2 * Math.hypot((k - x0) * dx, z0)) / v; // ns
  const buf = makeDzt({ nsamp, scans, range: dt * (nsamp - 1), spm: 1 / dx, sample: (c, k, i) => 3000 * Math.exp(-(((i - 20) / 2) ** 2)) + 800 * (i / nsamp) + 2000 * Math.exp(-(((i * dt - tHyp(k)) / 1.2) ** 2)) });
  const d = parseDzt(buf);
  let a = d.channels[0];
  assert.ok(firstBreak(a, scans, nsamp) >= 17 && firstBreak(a, scans, nsamp) <= 20);
  a = dewow(a, scans, nsamp, 15);
  a = removeBackground(a, scans, nsamp);
  const peakAt = (data, k) => { let best = 0, bi = 0; for (let i = 2; i < nsamp; i++) if (Math.abs(data[k * nsamp + i]) > best) { best = Math.abs(data[k * nsamp + i]); bi = i; } return bi; };
  assert.ok(Math.abs(peakAt(a, 40) * dt - tHyp(40)) <= 1, "apex at 30 ns");
  assert.ok(Math.abs(peakAt(a, 70) * dt - tHyp(70)) <= 1, "a flank further down");
  let band = 0; for (let k = 0; k < scans; k++) band = Math.max(band, Math.abs(a[k * nsamp + 20])); assert.ok(band < 50, "the flat band is gone");
  const g = agc(a, scans, nsamp, 25);
  assert.ok(Math.abs(peakAt(g, 70) * dt - tHyp(70)) <= 1);
  const pg = powerGain(a, scans, nsamp, 1);
  assert.ok(Math.abs(pg[40 * nsamp + 63] / a[40 * nsamp + 63] - 1) < 1e-6, "1 at mid-window");
  const cut = cutTimeZero(a, scans, nsamp, 20);
  assert.equal(cut.nsamp, nsamp - 20); assert.equal(cut.data[5 * cut.nsamp + 3], a[5 * nsamp + 23]);
  const img = radargramPixels(a, scans, nsamp, { maxWidth: 40 });
  assert.equal(img.width, 40); assert.equal(img.height, nsamp); assert.equal(img.pixels.length, 40 * nsamp * 4);
  const img2 = radargramPixels(a, scans, nsamp, { colors: "bwr" });
  assert.equal(img2.width, scans);
});
