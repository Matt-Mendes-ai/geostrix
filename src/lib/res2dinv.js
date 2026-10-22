// TASKS.csv #826 — Res2DInv .dat files (Loke's format: the usual way resistivity / IP lines are exchanged), read into
// the same { headers, rows, note } table the DC/IP panel already takes from CSV and contractor files (#600), so the
// rest of the import (column guess, placing the line, inverting) is unchanged. A pole electrode is "*".
//
// Layout (by line, after the survey name): unit electrode spacing; array code; then
//   standard arrays: number of data, x-location type (0 = first electrode, 1 = mid-point of the array), IP flag;
//     data rows "x a rho" (Wenner, pole-pole) or "x a n rho" (the others) [+ chargeability]
//   general array (11): sub-array type, a "Type of measurement (0=app. resistivity, 1=resistance)" line and its value,
//     number of data, x-location type, IP flag; data rows "k x1 z1 ... xk zk value" [+ chargeability], k electrodes
//     in the order C1 C2 P1 P2 (k = 3: C1 P1 P2, a pole-dipole; k = 2: C1 P1, a pole-pole)
//   IP flag 1: three lines follow - "Chargeability", its unit, the delay / integration times.
// Electrode positions per array (x = first electrode), as in the Res2DInv manual:
//   1 Wenner alpha C1 P1 P2 C2 at x, x+a, x+2a, x+3a      2 pole-pole C1 P1 at x, x+a
//   3 dipole-dipole C2 C1 P1 P2 at x, x+a, x+a+na, x+2a+na 4 Wenner beta C2 C1 P1 P2 at x, x+a, x+2a, x+3a
//   5 Wenner gamma C1 P1 C2 P2 at x, x+a, x+2a, x+3a       6 pole-dipole C1 P1 P2 at x, x+na, x+na+a (n < 0: reverse)
//   7 Wenner-Schlumberger C1 P1 P2 C2 at x, x+na, x+na+a, x+2na+a
// Equatorial dipole-dipole (8) and cross-borehole files are refused with a reason. Resistances (measurement type 1)
// become apparent resistivities with the geometric factor K = 2 pi / (1/AM - 1/BM - 1/AN + 1/BN).
// Returns { headers, rows, note } or null when the text is not a Res2DInv file; throws for one it cannot read.
import { t as tr } from "./i18n.js";

const ARRAYS = { 1: "Wenner alpha", 2: "pole-pole", 3: "dipole-dipole", 4: "Wenner beta", 5: "Wenner gamma", 6: "pole-dipole", 7: "Wenner-Schlumberger", 8: "equatorial dipole-dipole", 11: "general array" };
const isNum = (s) => /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(String(s).trim());
const firstNum = (line) => { const t = String(line).trim().split(/[\s,]+/)[0]; return isNum(t) ? Number(t) : null; };

// electrodes [A, B, M, N] (null = at infinity) of a standard-array reading
function standardElectrodes(code, x, a, n) {
  switch (code) {
    case 1: return [x, x + 3 * a, x + a, x + 2 * a];
    case 2: return [x, null, x + a, null];
    case 3: return [x + a, x, x + a + n * a, x + 2 * a + n * a];
    case 4: return [x + a, x, x + 2 * a, x + 3 * a];
    case 5: return [x, x + 2 * a, x + a, x + 3 * a];
    case 6: { const s = n < 0 ? -1 : 1; return [x, null, x + n * a, x + n * a + s * a]; }
    case 7: return [x, x + 2 * n * a + a, x + n * a, x + n * a + a];
    default: return null;
  }
}

export function geometricFactor([A, B, M, N]) {
  const inv = (p, q) => (p == null || q == null ? 0 : 1 / Math.abs(p - q));
  const g = inv(A, M) - inv(B, M) - inv(A, N) + inv(B, N);
  return g ? (2 * Math.PI) / g : NaN;
}

export function parseRes2dinv(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim());
  // the survey name, the unit spacing (a number) and a known array code (an integer)
  if (lines.length < 6) return null;
  const spacing = firstNum(lines[1]), code = firstNum(lines[2]);
  if (!(spacing > 0) || !Number.isInteger(code) || !ARRAYS[code]) return null;
  if (code === 8) throw new Error(tr("This Res2DInv file is an equatorial dipole-dipole survey, which GeoStrix cannot place on one line yet."));
  let i = 3;
  const nextInt = () => { while (i < lines.length && firstNum(lines[i]) == null) i++; return i < lines.length ? firstNum(lines[i++]) : null; };
  let measType = 0;
  if (code === 11) { nextInt(); measType = nextInt(); } // sub-array type; then the measurement-type line and its value
  const nData = nextInt(), xloc = nextInt(), ipFlag = nextInt();
  if (!(nData > 0) || xloc == null || ipFlag == null) throw new Error(tr("This Res2DInv file's header could not be read (number of data, x-location type, IP flag)."));
  let ipUnit = null;
  if (ipFlag === 1) { ipUnit = lines[i + 1] || ""; i += 3; } // "Chargeability", the unit, delay / integration times
  const rows = [];
  let skipped = 0, poles = 0;
  for (; i < lines.length && rows.length + skipped < nData; i++) {
    const t = lines[i].split(/[\s,]+/).filter(Boolean);
    if (!t.length) continue;
    if (!t.every(isNum)) { skipped++; continue; }
    const v = t.map(Number);
    let el, rho, ip = null;
    if (code === 11) {
      const k = v[0];
      if (![2, 3, 4].includes(k) || v.length < 1 + 2 * k + 1) { skipped++; continue; }
      const xs = Array.from({ length: k }, (_, j) => v[1 + 2 * j]);
      el = k === 4 ? [xs[0], xs[1], xs[2], xs[3]] : k === 3 ? [xs[0], null, xs[1], xs[2]] : [xs[0], null, xs[1], null];
      rho = v[1 + 2 * k];
      if (ipFlag === 1) ip = v[2 + 2 * k] ?? null;
    } else {
      const twoParam = code === 1 || code === 2 || code === 4 || code === 5;
      const need = twoParam ? 3 : 4;
      if (v.length < need) { skipped++; continue; }
      const [x0, a] = v, n = twoParam ? 1 : v[2];
      el = standardElectrodes(code, 0, a, n);
      if (!el) { skipped++; continue; }
      // x is the array's first electrode as listed above (C1, or C2 for dipole-dipole / Wenner beta - placed at 0 by
      // standardElectrodes), or the mid-point of the array (x-location type 1)
      const real = el.filter((e) => e != null), shift = xloc === 1 ? x0 - (Math.min(...real) + Math.max(...real)) / 2 : x0;
      el = el.map((e) => (e == null ? null : e + shift));
      rho = v[need - 1];
      if (ipFlag === 1) ip = v[need] ?? null;
    }
    if (measType === 1) rho *= geometricFactor(el);
    if (el.includes(null)) poles++;
    const f = (e) => (e == null ? "*" : String(+e.toFixed(4)));
    rows.push({ A: f(el[0]), B: f(el[1]), M: f(el[2]), N: f(el[3]), Rho: String(rho), ...(ipFlag === 1 ? { IP: ip == null ? "" : String(ip) } : {}) });
  }
  const headers = ["A", "B", "M", "N", "Rho", ...(ipFlag === 1 ? ["IP"] : [])];
  const unitNote = ipFlag === 1 && ipUnit && !/mv\/?v/i.test(ipUnit) ? tr(" Chargeability is in {unit}, not mV/V: check it before inverting.", { unit: ipUnit }) : "";
  return { headers, rows, res2dinv: { title: lines[0], array: ARRAYS[code], spacing, ip: ipFlag === 1, resistance: measType === 1 },
    note: tr("Res2DInv file \"{title}\": {array}, unit spacing {spacing} m, {n} of {total} readings{ip}{res}{poles}{skipped}.", {
      title: lines[0].slice(0, 80), array: ARRAYS[code], spacing, n: rows.length, total: nData,
      ip: ipFlag === 1 ? tr(" with chargeability") : "", res: measType === 1 ? tr(" (resistances converted to apparent resistivity)") : "",
      poles: poles ? tr(", {k} with a remote electrode", { k: poles }) : "", skipped: skipped ? tr(", {k} line(s) not read", { k: skipped }) : "",
    }) + unitNote };
}
