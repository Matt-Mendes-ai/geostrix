// TASKS.csv #4076 — Zonge's averaged files, read into GeoStrix's own structures (side 2, from side 1's #4068 round-2 harvest: SA SARIG, Victoria GSV,
// NZ NZP&M and Greenland GEUS files; tests use made-up files of the same shapes only).
//   - CR .avg (complex-resistivity IP, CRAVGW v1.x: "$" parameters then a CSV table; CRAVG 7.x: a whitespace table under "skp Tx Rx PltPt NSp Freq …"):
//     one reading per electrode set, from its 0 Hz row (the apparent resistivity, and the 3-point decoupled phase in mrad), into the DC / IP line;
//   - CSAMT .avg (csavgw: one "$ Rx.Stn" block per station, a frequency table with ARes.mag and Z.phz in mrad): one sounding per station, into the MT
//     soundings (impedance rebuilt from rho and phase, SI);
//   - TEM .amr (TEMAVGW: a Maxwell-like table whose header starts with LOOP, "*" for an unknown position) with its .chn delays: into the TEM lines.
// The raw files (.raw: GDP readings before averaging), .mde (parameters only) and .zdb (TEMAVGW's database) are refused in words, naming the file to open.
import { t as tr } from "./i18n.js";

const num = (s) => { const v = Number(String(s ?? "").trim()); return Number.isFinite(v) ? v : NaN; };

// the "$ Key.Name = value" parameters (spaces around "=" optional, quotes dropped)
export function zongeParams(text) {
  const out = {};
  for (const l of String(text).split(/\r\n|\r|\n/)) {
    const m = l.match(/^\s*\$\s*([A-Za-z][\w.%#]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in out)) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}
// "1 m/Stn#" -> 1; "200.0m" -> 200
const leadingNumber = (s) => { const m = String(s ?? "").match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/); return m ? Number(m[0]) : NaN; };

// what a Zonge text file is, from its first lines: "cr" | "csamt" | "tem-avg" | "tem-amr" | "chn" | "mde" | null
export function zongeKind(text) {
  const head = String(text).slice(0, 4000);
  if (/^\s*\\{1,2}\s*CR data from CRAVG|^\s*\\{1,2}\s*CRAVG\s*\d/im.test(head)) return "cr";
  if (/^\s*\\{1,2}\s*CSAMT data from csavg/im.test(head)) return "csamt";
  if (/^\s*TEM data from TEMAVG/im.test(head) && /^\s*LOOP\s+LINE\s+STN\b/im.test(head)) return "tem-amr";
  if (/^\s*\\{1,2}\s*TEM data from TEMAVG/im.test(head)) return "tem-avg";
  if (/^\s*Zonge GDP delay times/im.test(head)) return "chn";
  if (/^\s*\$\s*Survey\.Type\s*=/im.test(head) && !/\n\s*[A-Za-z][\w.]*\s*,/.test(head)) return "mde";
  return null;
}

// a Zonge raw GDP file: the readings before CRAVG / CSAVG / TEMAVG averaged them (a count on the first line, then "CR  0846 2012-…", "TEM …")
export const isZongeRaw = (text, name = "") => /\.raw$/i.test(name) && /^\s*\d+\s*[\r\n]+\s*(CR|TEM|CSAMT|NSAMT|TD|TDIP|MT)\s+\d/i.test(String(text).slice(0, 400));

// what to say when a Zonge file reaches a pane that does not read it (pane: "dcip" | "mt" | "tem"); null when the file is for this pane, or not Zonge
export function zongeRefusal(text, name, pane) {
  const kind = zongeKind(text);
  if (isZongeRaw(text, name)) return tr("{name} is a Zonge raw file: open the averaged .avg of the same line.", { name });
  if (kind === "mde") return tr("{name} holds Zonge parameters only: open the .avg or .amr.", { name });
  if (/\.zdb$/i.test(name) && (kind === "tem-avg" || kind === "cr" || kind === "csamt")) return tr("{name} is a Zonge database: open the .avg or .amr.", { name });
  if (kind === "chn") return tr("{name} holds a Zonge TEM .amr's gate times: open the .amr with it.", { name });
  const where = { cr: "dcip", csamt: "mt", "tem-amr": "tem", "tem-avg": "tem" }[kind];
  if (!where || where === pane) return null;
  if (kind === "tem-avg") return tr("{name} is a Zonge TEM average: open the line's .amr in TEM line data.", { name });
  return { dcip: tr("{name} is a Zonge CR (IP) average: open it in IP / Resistivity.", { name }), mt: tr("{name} is a Zonge CSAMT average: open it in MT / AMT.", { name }), tem: tr("{name} is Zonge TEM line data: open it in TEM line data (EM).", { name }) }[where];
}

// -- a Zonge station file: "station easting northing elevation" (tab or space separated, no header) -> Map(station -> { x, y, z }) ---------------------------
export function zongeStations(text) {
  const out = new Map();
  for (const l of String(text).split(/\r\n|\r|\n/)) {
    const c = l.trim().split(/[\s,]+/);
    if (c.length < 3) continue;
    const [s, x, y, z] = c.map(num);
    if (Number.isFinite(s) && Number.isFinite(x) && Number.isFinite(y)) out.set(s, { x, y, z: Number.isFinite(z) ? z : null });
  }
  return out;
}

// -- CSAMT .avg -> soundings shaped as parseEdi's (lib/edi.js), so the MT / AMT pane draws them: one per "$Rx.Stn" block ------------------------------------
// Apparent resistivity (ARes.mag) and impedance phase (Z.phz, mrad) per frequency, from a scalar Ex / Hy receiver: the impedance is rebuilt from them in SI
// (|Z| = sqrt(rho 2 pi f mu0)), so soundingCurves gives back the file's rho and phase. A frequency whose magnitude or phase weight is 0 is left out of that
// quantity. Positions: the station file's (by station number) or the block's $Rx.Center, as x / y in the project's CRS (the file names none).
const MU0 = 4e-7 * Math.PI;
// a station's position from a station file: the station itself, or interpolated between the two it lies between (a receiver's number is its dipole's
// centre, between the surveyed stations); none outside the file's stations
export function stationAt(stations, s) {
  if (!stations || !Number.isFinite(s)) return null;
  if (stations.has(s)) return stations.get(s);
  const keys = [...stations.keys()].sort((a, b) => a - b);
  for (let k = 1; k < keys.length; k++) {
    const a = keys[k - 1], b = keys[k];
    if (a < s && s < b) {
      const t = (s - a) / (b - a), p = stations.get(a), q = stations.get(b), lerp = (u, v) => (Number.isFinite(u) && Number.isFinite(v) ? u + t * (v - u) : null);
      return { x: lerp(p.x, q.x), y: lerp(p.y, q.y), z: lerp(p.z, q.z) };
    }
  }
  return null;
}
export function csAvgToSoundings(text, name = "file.avg", stations = null) {
  const lines = String(text).split(/\r\n|\r|\n/), params = {}, out = [];
  let skipped = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*\$\s*([A-Za-z][\w.%#]*)\s*=\s*(.*?)\s*$/);
    if (m) { params[m[1]] = m[2].replace(/^"(.*)"$/, "$1"); continue; }
    if (!/^\s*Z\.mwgt\s*,/.test(lines[i]) && !(/(^|,)\s*Freq\s*,/.test(lines[i]) && /ARes\.mag/.test(lines[i]))) continue;
    const H = lines[i].split(",").map((h) => h.trim()), at = (k) => H.indexOf(k);
    if (at("Freq") < 0 || at("ARes.mag") < 0 || at("Z.phz") < 0) throw new Error(tr("{name}: a CSAMT average with no Freq, ARes.mag or Z.phz column.", { name }));
    const freqs = [], rho = [], phs = [];
    for (i = i + 1; i < lines.length && /^\s*[-\d.]/.test(lines[i]); i++) {
      const r = lines[i].split(",").map((v) => v.trim()), f = num(r[at("Freq")]);
      if (!(f > 0)) continue;
      const mw = at("Z.mwgt") >= 0 ? num(r[at("Z.mwgt")]) : 1, pw = at("Z.pwgt") >= 0 ? num(r[at("Z.pwgt")]) : 1;
      const rv = num(r[at("ARes.mag")]), pv = num(r[at("Z.phz")]) / 1000; // phase mrad -> rad
      if (!(mw > 0) || !(pw > 0) || !(rv > 0) || !Number.isFinite(pv)) { skipped++; continue; } // a rejected (weight 0) or empty frequency is left out
      freqs.push(f); rho.push(rv); phs.push(pv);
    }
    i--;
    const stn = num(params["Rx.Stn"] ?? params["Rx.GdpStn"]), line = String(params["Line.Name"] || params["Line.Number"] || "").replace(/\s+/g, "");
    const at0 = stationAt(stations, stn), centre = String(params["Rx.Center"] || "").split(",").map(num);
    const pos = at0 || (centre.length >= 2 && centre.every(Number.isFinite) ? { x: centre[0], y: centre[1], z: Number.isFinite(centre[2]) ? centre[2] : null } : null);
    const re = [], im = [];
    freqs.forEach((f, k) => { const mag = Math.sqrt(rho[k] * 2 * Math.PI * f * MU0); re.push(mag * Math.cos(phs[k])); im.push(mag * Math.sin(phs[k])); });
    out.push({ id: `${/[NSEW]$/i.test(line) ? line : `${line}N`}${Number.isFinite(stn) ? stn : out.length + 1}`, prospect: params["Job.Number"] ? `CSAMT ${params["Job.Number"]}` : "CSAMT",
      lat: NaN, lon: NaN, xy: pos ? { x: pos.x, y: pos.y } : null, elev: pos?.z ?? null, elevUnits: "M", freqs, z: { xy: { re, im } }, fileRho: rho, filePhs: phs.map((p) => (p * 180) / Math.PI),
      units: "SI", unitsFrom: "csamt", warnings: [], from: at0 ? "stn" : pos ? "center" : null });
  }
  if (!out.length) throw new Error(tr("{name}: a CSAMT average with no station table.", { name }));
  return { soundings: out, skipped };
}

// -- CR .avg -> the DC / IP line's table: { headers, rows, lineName, readings, note, warnings } ---------------------------------------------------------
// The table has the columns the DC / IP reader knows (C1X C2X P1X P2X Res Phz: Phz makes it an IP PHASE in mrad, never a chargeability, #4059).
const HEADERS = ["C1X", "C2X", "P1X", "P2X", "Res", "Phz"];
export function crAvgToTable(text, name = "file.avg") {
  const lines = String(text).split(/\r\n|\r|\n/);
  const p = zongeParams(text), warnings = [];
  const csvAt = lines.findIndex((l) => /^\s*Tx\.X1\s*,/.test(l));
  const wsAt = lines.findIndex((l) => /^\s*skp[\s,]+Tx[\s,]+Rx[\s,]+PltPt\b/i.test(l)); // CRAVG 7.x, or the same columns comma-separated (CRAVGW's o.avg)
  let out = [], picked = "0 Hz";
  if (csvAt >= 0) { // CRAVGW v1.x
    const H = lines[csvAt].split(",").map((h) => h.trim()), at = (k) => H.indexOf(k);
    const need = ["Tx.X1", "Tx.X2", "Rx.X1", "Rx.X2", "Rx.Freq", "ARes.mag", "IP.mag"];
    const missing = need.filter((k) => at(k) < 0);
    if (missing.length) throw new Error(tr("{name}: a CR average with no {cols} column.", { name, cols: missing.join(", ") }));
    const scale = leadingNumber(p["Stn.UnitScale"]) || 1;
    const rows = lines.slice(csvAt + 1).map((l) => l.split(",").map((v) => v.trim())).filter((r) => r.length >= H.length - 1 && Number.isFinite(num(r[at("Tx.X1")])));
    let use = rows.filter((r) => num(r[at("Rx.Freq")]) === 0);
    if (!use.length && at("Tx.Freq") >= 0) { use = rows.filter((r) => num(r[at("Rx.Freq")]) === num(r[at("Tx.Freq")])); picked = "Tx"; }
    out = use.map((r) => [num(r[at("Tx.X1")]) * scale, num(r[at("Tx.X2")]) * scale, num(r[at("Rx.X1")]) * scale, num(r[at("Rx.X2")]) * scale, num(r[at("ARes.mag")]), num(r[at("IP.mag")])]);
  } else if (wsAt >= 0) { // CRAVG 7.x: Tx and Rx are each dipole's first station; ASPACE gives the dipole length
    const cells = (l) => l.trim().split(/\s*,\s*|\s+/).filter((v) => v !== "");
    const H = cells(lines[wsAt]), at = (k) => H.findIndex((h) => h.toLowerCase() === k.toLowerCase());
    const a = leadingNumber(p.ASPACE);
    if (!(a > 0)) throw new Error(tr("{name}: a CR average with no dipole length ($ ASPACE).", { name }));
    const rows = lines.slice(wsAt + 1).map(cells).filter((r) => r.length >= H.length && Number.isFinite(num(r[at("Tx")])) && Number.isFinite(num(r[at("Freq")])));
    let off = 0;
    const use = rows.filter((r) => num(r[at("Freq")]) === 0 && num(r[at("skp")]) !== 0);
    out = use.map((r) => {
      const tx = num(r[at("Tx")]), rx = num(r[at("Rx")]), plt = num(r[at("PltPt")]);
      if (Number.isFinite(plt) && Math.abs((tx + rx) / 2 + a / 2 - plt) > 0.01 * a) off++;
      return [tx, tx + a, rx, rx + a, num(r[at("Resistivity")]), num(r[at("Phase")])];
    });
    if (off) warnings.push(tr("{n} reading(s) plot off their dipoles' middle: check the electrodes.", { n: off }));
  } else {
    throw new Error(tr("{name}: a CR average in a layout GeoStrix does not know.", { name }));
  }
  const kept = out.filter((r) => r.every(Number.isFinite));
  if (!kept.length) throw new Error(tr("{name}: no CR reading with a 0 Hz row.", { name }));
  return {
    headers: HEADERS, rows: kept.map((r) => Object.fromEntries(HEADERS.map((h, i) => [h, String(r[i])]))), // row objects, as parseTableFile gives
    lineName: p["Line.Name"] || null, readings: kept.length, warnings,
    note: picked === "0 Hz" ? tr("Zonge CR average: rho and the 3-point phase (mrad) at 0 Hz.") : tr("Zonge CR average: rho and phase (mrad) at the transmitter frequency."),
  };
}
