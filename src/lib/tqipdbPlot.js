// TASKS.csv #4077 (the round-2 harvest, #4068) — two more IP line files that carry no electrode columns of their own:
//   - Zonge TQIPdb "plot point" tables: "IP DATA FROM : name.mdb (TQIPdb V2.10) ..." / "LINE: 6173900N ARRAY:PLDP DIPOLE:50.0 UNITS:M ..." and then
//     Line PltPt Nlevel Res Mx, one row per reading. Only the plot point and the n-level are given: the electrodes are rebuilt from the array.
//   - TS2DIP ".ipd" files (Zonge's 2D processing): a CSV  Splt,Zplt,SRx1,SRx2,STx1,STx2,ARobs,ARerr,IPobs,IPerr,ARmod,IPmod  whose two comment lines come AFTER
//     the header and say the array and the IP unit ("//Array=Dipole-Dipole, DipoleLength=100 ... IPUnits=mrad").
// Both return what parseDcipWhitespaceText / electrodeFile return, so the DC / IP pane reads them like any other line file. Pure.
import { t as tr } from "./i18n.js";

const num = (v) => { if (v == null || String(v).trim() === "") return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const lines = (text) => String(text || "").split(/\r\n|\r|\n/);

// ---- Zonge TQIPdb plot-point table ----
const PLOT_HEADER = /^\s*Line\s+PltPt\s+Nlevel\s+Res\s+(M\w*)\s*$/i;
export const isTqipdbPlot = (text) => lines(String(text || "").slice(0, 4000)).some((l) => PLOT_HEADER.test(l));

// The first data token of the table: the line's number ('6174400'), used by lineTagOf when the header block is cut short.
export function tqipdbLineName(text) {
  const ls = lines(String(text || "").slice(0, 6000)), hi = ls.findIndex((l) => PLOT_HEADER.test(l));
  if (hi < 0) return null;
  const t = ls.slice(hi + 1).map((l) => l.trim().split(/\s+/)).find((p) => p.length === 5 && /^\d+$/.test(p[0]));
  return t ? t[0] : null;
}

// poleSide: where the current pole stood — "low" (at the lower coordinate, the receivers marching towards higher ones) or "high". The table does not say (a real
// survey's own raw dumps show both on different lines), so the caller chooses; "low" is the default and the note says so.
// A pole-dipole plot point is the middle of the pole and the near potential electrode: pole = plot -+ n.a/2, M = pole +- n.a, N = M +- a (a = the dipole).
export function parseTqipdbPlot(text, { poleSide = "low" } = {}) {
  const ls = lines(text), hi = ls.findIndex((l) => PLOT_HEADER.test(l));
  if (hi < 0) return null;
  const head = ls.slice(0, hi).join("\n");
  const arr = /ARRAY\s*:\s*([A-Za-z-]+)/i.exec(head)?.[1] || null;
  if (arr && !/^P-?L-?D-?P$|^P-?DP$|^PLDP$/i.test(arr)) return { headers: [], rows: [], note: "", error: tr("This is a TQIPdb plot-point table of a {array} survey: only pole-dipole plot points can be turned back into electrode positions.", { array: arr }) };
  const mxName = PLOT_HEADER.exec(ls[hi])[1];
  const data = [];
  for (const l of ls.slice(hi + 1)) {
    const t = l.trim().split(/\s+/);
    if (t.length !== 5 || !/^\d+$/.test(t[0])) continue;
    const p = num(t[1]), n = num(t[2]), res = num(t[3]), mx = num(t[4]);
    if (p == null || !(n >= 1) || !(res > 0)) continue;
    data.push({ p, n, res, mx });
  }
  if (!data.length) return null;
  // the dipole: the header's, else the plot points of one n-level are one dipole apart
  let a = num(/DIPOLE\s*:\s*([\d.]+)/i.exec(head)?.[1]);
  if (!(a > 0)) {
    const lvl = [...new Set(data.filter((d) => d.n === 1).map((d) => d.p))].sort((x, y) => x - y);
    let step = Infinity;
    for (let i = 1; i < lvl.length; i++) { const d = lvl[i] - lvl[i - 1]; if (d > 1e-6 && d < step) step = d; }
    if (!Number.isFinite(step)) return null;
    a = step;
  }
  const sgn = poleSide === "high" ? -1 : 1;
  const rows = data.map((d) => {
    const A = d.p - sgn * d.n * a / 2, M = A + sgn * d.n * a, N = M + sgn * a;
    return { A: +A.toFixed(3), B: "", M: +M.toFixed(3), N: +N.toFixed(3), Res: d.res, [mxName]: d.mx == null ? "" : d.mx };
  });
  const dupe = data.length - new Set(data.map((d) => `${d.p}|${d.n}`)).size;
  const note = tr("TQIPdb plot-point table: {n} readings, pole-dipole with a {a} m dipole{v}. The table gives plot points and n-levels, not electrodes: the current pole is taken at the {side} end of each array. If the survey ran the other way the readings are mirrored; the raw dump of the line gives the electrode positions.", { n: data.length.toLocaleString(), a, v: arr ? "" : tr(" (the array is not stated: read as pole-dipole)"), side: poleSide === "high" ? tr("higher-coordinate") : tr("lower-coordinate") }) + (dupe ? " " + tr("{n} repeated plot points.", { n: dupe }) : "");
  return { headers: ["A", "B", "M", "N", "Res", mxName], rows, note };
}

// ---- TS2DIP .ipd ----
const IPD_HEADER = /^\s*"?Splt"?\s*,\s*"?Zplt"?\s*,\s*"?SRx1"?\s*,\s*"?SRx2"?\s*,\s*"?STx1"?\s*,\s*"?STx2"?\s*,/i;
export const isTs2dip = (text) => lines(String(text || "").slice(0, 2000)).some((l) => IPD_HEADER.test(l));

// -> null | { lines: [{ name, headers, rows, pts: null, readings, stacked: 0, note }] }. The potential per reading is the observed one (ARobs, IPobs); the modelled columns are the contractor's own fit and are left out.
export function parseTs2dip(text, base = "line") {
  const ls = lines(text), hi = ls.findIndex((l) => IPD_HEADER.test(l));
  if (hi < 0) return null;
  const cols = ls[hi].split(",").map((c) => c.trim().replace(/^"|"$/g, "").toLowerCase());
  const at = (k) => cols.indexOf(k);
  const ia = at("stx1"), ib = at("stx2"), im = at("srx1"), inn = at("srx2"), ir = at("arobs"), iq = at("ipobs");
  if (ia < 0 || im < 0 || ir < 0) return null;
  const meta = ls.filter((l) => /^"?\/\//.test(l.trim())).join(" ");
  const unit = /IPUnits\s*=\s*([A-Za-z\/%]+)/i.exec(meta)?.[1] || "";
  const phase = /^mrad$/i.test(unit), arrayName = /Array\s*=\s*([A-Za-z-]+)/i.exec(meta)?.[1] || "";
  const ipHead = iq < 0 ? null : phase ? "IP phase" : "Chargeability";
  const rows = [];
  for (const l of ls.slice(hi + 1)) {
    if (!l.trim() || /^"?\/\//.test(l.trim())) continue;
    const t = l.split(",").map((x) => x.trim());
    if (t.length < cols.length) continue;
    const a = num(t[ia]), b = ib >= 0 ? num(t[ib]) : null, m = num(t[im]), n = inn >= 0 ? num(t[inn]) : null, rho = num(t[ir]);
    if (a == null || m == null || !(rho > 0)) continue;
    rows.push({ A: a, B: b ?? "", M: m, N: n ?? "", "Apparent resistivity": rho, ...(ipHead ? { [ipHead]: num(t[iq]) ?? "" } : {}) });
  }
  if (!rows.length) return null;
  return { lines: [{ name: base, headers: ["A", "B", "M", "N", "Apparent resistivity", ...(ipHead ? [ipHead] : [])], rows, pts: null, readings: rows.length, stacked: 0,
    note: tr("TS2DIP file{v}: {n} readings (the observed values; the contractor's model columns are not read){u}.", { v: arrayName ? ` (${arrayName.toLowerCase()})` : "", n: rows.length.toLocaleString(), u: phase ? tr(", IP as phase in mrad") : unit ? tr(", IP in {unit}", { unit }) : "" }) }] };
}
