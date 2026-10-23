// TASKS.csv #616 — GSSI .DZT ground-penetrating-radar files (RADAN / SIR-3000 / SIR-4000 / UtilityScan / StructureScan),
// read from GSSI's published header description (SIR-3000 manual, "DZT file format"); no code from readgssi (AGPL)
// or other readers. Pure: no DOM.
//
// Layout: one 1024-byte header per channel, then the scans. Little-endian.
//   0 rh_tag (0x00ff), 2 rh_data (offset to the data: < 1024 means rh_data x 1024, else 1024 x channels), 4 rh_nsamp
//   (samples per scan), 6 rh_bits (8 / 16 / 32), 8 rh_zero (binary offset: 0x80 / 0x8000), 10 rhf_sps (scans per
//   second), 14 rhf_spm (scans per metre; 0 = time-based, no survey wheel), 18 rhf_mpm (metres per mark), 22
//   rhf_position (time zero, ns), 26 rhf_range (time window, ns), 30 rh_npass, 32 / 36 creation / modification date
//   (bit fields), 52 rh_nchan, 54 rhf_epsr (dielectric constant), 58 rhf_top, 62 rhf_depth (m), 98 rh_antname (14
//   chars), 113 rh_version:3 / rh_system:5.
// Data: 8 / 16-bit samples are unsigned around rh_zero, 32-bit are signed; scans interleave the channels
// (scan 0 ch 0, scan 0 ch 1, ...). The first two samples of every scan carry the system's own scan header, not
// radar data: they are set to 0.

const C_M_PER_NS = 0.299792458;

const str = (dv, off, n) => { let s = ""; for (let i = 0; i < n; i++) { const c = dv.getUint8(off + i); if (!c) break; s += String.fromCharCode(c); } return s.trim(); };
// RFDate: sec2:5 min:6 hour:5 day:5 month:4 year:7 (since 1980), low bits first
function rfDate(u) {
  if (!u) return null;
  const sec = (u & 31) * 2, min = (u >>> 5) & 63, hour = (u >>> 11) & 31, day = (u >>> 16) & 31, month = (u >>> 21) & 15, year = 1980 + ((u >>> 25) & 127);
  if (!month || month > 12 || !day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function readDztHeader(buf) {
  const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0);
  if (dv.byteLength < 1024) throw new Error("Not a GSSI .DZT file: shorter than its 1024-byte header.");
  const tag = dv.getUint16(0, true);
  if ((tag & 0xff) !== 0xff) throw new Error("Not a GSSI .DZT file (the header tag is not 0x..ff).");
  const h = {
    tag, rhData: dv.getUint16(2, true), nsamp: dv.getUint16(4, true), bits: dv.getUint16(6, true), zero: dv.getUint16(8, true),
    sps: dv.getFloat32(10, true), spm: dv.getFloat32(14, true), mpm: dv.getFloat32(18, true), position: dv.getFloat32(22, true), range: dv.getFloat32(26, true),
    created: rfDate(dv.getUint32(32, true)), nchan: dv.getUint16(52, true) || 1, epsr: dv.getFloat32(54, true), top: dv.getFloat32(58, true), depth: dv.getFloat32(62, true),
    antenna: str(dv, 98, 14), version: dv.getUint8(113) & 7,
  };
  if (![8, 16, 32].includes(h.bits)) throw new Error(`Unsupported .DZT sample size: ${h.bits} bits (8, 16 or 32 expected).`);
  if (!(h.nsamp > 2)) throw new Error("The .DZT header gives no samples per scan.");
  if (h.nchan > 8) throw new Error(`The .DZT header claims ${h.nchan} channels.`);
  h.dataOffset = h.rhData < 1024 ? 1024 * h.rhData : 1024 * h.nchan;
  if (h.dataOffset < 1024 * h.nchan) h.dataOffset = 1024 * h.nchan;
  if (!(h.epsr > 0) || h.epsr > 100) h.epsr = null;
  if (!(h.range > 0)) throw new Error("The .DZT header gives no time window (range, ns).");
  h.antennaMHz = (() => { const m = /(\d{2,4})\s*MHz/i.exec(h.antenna); return m ? Number(m[1]) : null; })(); // only a frequency written as such: GSSI model numbers ("3207", "50400S") are not frequencies
  return h;
}

// The whole file: { header, channels: [Float32Array (nscans x nsamp, scan-major: scan k at k * nsamp)], nscans, dt (ns per
// sample), distance (m per scan, or null when time-based), seconds (s per scan, or null) }
export function parseDzt(buf) {
  const ab = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const h = readDztHeader(ab);
  const bytes = h.bits / 8, scanBytes = h.nsamp * bytes * h.nchan;
  const nscans = Math.floor((ab.byteLength - h.dataOffset) / scanBytes);
  if (nscans < 1) throw new Error("The .DZT file holds no complete scan after its header.");
  const dv = new DataView(ab, h.dataOffset, nscans * scanBytes);
  const channels = Array.from({ length: h.nchan }, () => new Float32Array(nscans * h.nsamp));
  const zero = h.bits === 32 ? 0 : (h.zero || (h.bits === 8 ? 0x80 : 0x8000));
  let p = 0;
  for (let k = 0; k < nscans; k++) {
    for (let c = 0; c < h.nchan; c++) {
      const out = channels[c], o = k * h.nsamp;
      for (let i = 0; i < h.nsamp; i++, p += bytes) {
        const v = h.bits === 8 ? dv.getUint8(p) - zero : h.bits === 16 ? dv.getUint16(p, true) - zero : dv.getInt32(p, true);
        out[o + i] = i < 2 ? 0 : v;
      }
    }
  }
  return {
    header: h, channels, nscans, nsamp: h.nsamp,
    dt: h.range / (h.nsamp - 1),
    distance: h.spm > 0 ? 1 / h.spm : null,
    seconds: h.sps > 0 ? 1 / h.sps : null,
  };
}

// Radar velocity in m/ns from the relative dielectric constant, and the depth of a two-way time (ns)
export const velocityFromEpsr = (epsr) => C_M_PER_NS / Math.sqrt(epsr);
export const depthOfTime = (tNs, v) => (v * tNs) / 2;

// ---- the companion .DZG GPS file: GSSI "$GSSIS,<scan>,<seconds>" lines, each followed by the receiver's NMEA $..GGA
// fix. -> [{ scan, lat, lon, alt (m above the geoid, or null) }] in scan order.
function nmeaDeg(v, hemi) {
  if (!v) return NaN;
  const d = v.indexOf(".") - 2;
  const deg = Number(v.slice(0, d)) + Number(v.slice(d)) / 60;
  return /[SW]/i.test(hemi) ? -deg : deg;
}
export function parseDzg(text) {
  const out = [];
  let scan = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const l = raw.trim();
    if (/^\$GSSIS/i.test(l)) { const n = Number(l.split(",")[1]); scan = Number.isFinite(n) ? n : null; continue; }
    if (scan != null && /^\$..GGA/i.test(l)) {
      const f = l.split("*")[0].split(",");
      const lat = nmeaDeg(f[2], f[3]), lon = nmeaDeg(f[4], f[5]), q = Number(f[6]), alt = f[9] === "" ? null : Number(f[9]);
      if (Number.isFinite(lat) && Number.isFinite(lon) && q > 0) out.push({ scan, lat, lon, alt: Number.isFinite(alt) ? alt : null });
      scan = null;
    }
  }
  out.sort((a, b) => a.scan - b.scan);
  return out.filter((p, i) => i === 0 || p.scan !== out[i - 1].scan);
}

// A position for every scan (0..nscans-1) from fixes at some scans: linear between fixes, held at the ends.
// fixes: [{ scan, x, y, z? }] in scan order. -> { x, y, z (Float64Array; NaN when no fix has z) }
export function scanPositions(fixes, nscans) {
  const x = new Float64Array(nscans), y = new Float64Array(nscans), z = new Float64Array(nscans).fill(NaN);
  if (!fixes.length) return null;
  let j = 0;
  for (let k = 0; k < nscans; k++) {
    while (j < fixes.length - 2 && fixes[j + 1].scan <= k) j++;
    const a = fixes[j], b = fixes[Math.min(j + 1, fixes.length - 1)];
    const t = b.scan > a.scan ? Math.max(0, Math.min(1, (k - a.scan) / (b.scan - a.scan))) : 0;
    x[k] = a.x + (b.x - a.x) * t; y[k] = a.y + (b.y - a.y) * t;
    if (a.z != null && b.z != null) z[k] = a.z + (b.z - a.z) * t;
  }
  return { x, y, z };
}
