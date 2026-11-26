// TASKS.csv #4079 — Crone SURFACE PEM profiles (<FMT> 210) and their .STP step-response files (<FMT> 230): a ground EM line survey, read into the same structure
// as the other receiver-text files (lib/maxwellTem.js parseTemReceiver), so EM > TEM line data takes them like a Maxwell .tem. The borehole reader (lib/downholeEm.js)
// refused them as "not a hole": a surface file has stations along a profile, where a hole's has depths.
// What the file holds (Crone PEM format, tags in the head, then the readings):
//   <FMT> 210 | 230   <UNI> nanoTesla/sec   <CUR> amps   <TXS> loop x y units (the loop's size)   <Lnn> x y z units ... (the transmitter loop's corners, up to 99)
//   <Pnn> x y z units stn ... (each station's position and its station number; the units 0 = m, 1 = ft; W and S stations are negative)
//   the title lines (company, property, the LINE, the grid, the date), an instrument line ('S-COIL Metric ...' on a surface file, 'Borehole Metric ...' in a hole),
//   the time block (seconds), a '$' line, then one record per station / component / reading: '<stn>[NSEW] <XYZ>R<n> ...', a flags line (D7 ... / D4 ...), the values (the
//   first is the primary field, then one per gate).
// Repeated readings of a station and component are stacked (their mean), as in the Maxwell reader. Pure.
import { placeLine } from "./maxwellTem.js";
import { arrMin, arrMax } from "./arrayStats.js"; // no Math.min / max spread (#371)

const NUM = (s) => { const v = Number(s); return Number.isFinite(v) ? v : NaN; };
const split = (text) => String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
const FT = 0.3048;

const fmtOf = (head) => { const m = /^\s*<FMT>\s*(\d+)/m.exec(head); return m ? Number(m[1]) : null; };
// the numbers of a tag line before its '~' comment
const tagNumbers = (line) => line.replace(/^\s*<[^>]+>/, "").replace(/~.*$/, "").trim().split(/\s+/).map(NUM);

// a Crone surface file: the PEM / STP tags, and a profile's <Pnn> lines (five numbers: x y z units stn) or an instrument line that is not a borehole probe's
export function isCronePemSurface(text) {
  const head = String(text || "").slice(0, 40000);
  if (!(/^\s*<FMT>\s*(210|230)\b/m.test(head) && /<UNI>/.test(head))) return false;
  const p0 = /^\s*<P00>(.*)$/m.exec(head);
  const p1 = /^\s*<P01>(.*)$/m.exec(head);
  if (p1) { const v = tagNumbers("<P01>" + p1[1]); if (v.length >= 4 && (v[3] === 2 || v[3] === 3)) return false; } // a segment (azimuth, dip, length): a hole's path
  if (/^\s*Borehole\b/im.test(head) || /^\s*[A-Z-]*\s*Borehole\s+(Metric|Imperial)\b/im.test(head)) return false;
  if (p0 && tagNumbers("<P00>" + p0[1]).length >= 5) return true; // x y z units stn
  return /^\s*(Surface|S-COIL|SURFACE|[A-Za-z-]*COIL)\b[^\n]*\b(Metric|Imperial)\b/im.test(head);
}

// -> the structure parseTemReceiver gives, plus loop: [{ x, y, z }] (metres) | null and loopSize: [x, y] (metres) | null
export function parseCronePemSurface(text, fileName = "") {
  const all = split(text);
  const head = all.slice(0, 400).join("\n");
  const fmt = fmtOf(head), stp = fmt === 230;
  const tagLine = (name) => { const l = all.find((x) => new RegExp(`^\\s*<${name}>`).test(x)); return l ? l.replace(/^\s*<[^>]+>/, "").replace(/~.*$/, "").trim() : ""; };
  const uni = tagLine("UNI");
  const units = stp ? "nT" : /nano/i.test(uni) ? "nT/s" : /pico/i.test(uni) ? "pT/s" : /micro/i.test(uni) ? "µT/s" : uni || null;
  // the loop and the stations' positions
  const loop = [], posByStn = new Map();
  for (const l of all) {
    const m = /^\s*<([LP])(\d\d)>/.exec(l);
    if (!m) { if (/^\s*\$\s*$/.test(l)) break; continue; }
    const v = tagNumbers(l);
    if (v.length < 2 || !Number.isFinite(v[0]) || !Number.isFinite(v[1])) continue;
    const f = v[3] === 1 ? FT : 1; // units: 0 = metres, 1 = feet
    if (m[1] === "L") loop.push({ x: v[0] * f, y: v[1] * f, z: (Number.isFinite(v[2]) ? v[2] : 0) * f });
    else if (v.length >= 5 && Number.isFinite(v[4])) posByStn.set(Math.round(v[4] * 100) / 100, { x: v[0] * f, y: v[1] * f, z: (Number.isFinite(v[2]) ? v[2] : NaN) * f });
  }
  const txs = tagNumbers("<TXS>" + tagLine("TXS")), txf = txs[2] === 1 ? FT : 1;
  const loopSize = txs.length >= 2 && Number.isFinite(txs[0]) && Number.isFinite(txs[1]) ? [txs[0] * txf, txs[1] * txf] : null;
  const dollar = all.findIndex((l) => /^\s*\$\s*$/.test(l));
  if (dollar < 0) throw new Error("no '$' line before the readings");
  // the time block (seconds): the all-number lines just above the '$' line
  let a = dollar - 1;
  while (a >= 0 && !all[a].trim()) a--;
  const block = [];
  while (a >= 0 && all[a].trim() && /^[\s\d.eE+\-]+$/.test(all[a])) { block.unshift(...all[a].trim().split(/\s+/).map(NUM)); a--; }
  // the title lines: company, property, the line, the grid, the date
  const titles = [];
  for (let k = 0; k < dollar; k++) { const l = all[k]; if (!l.trim() || /^\s*[<~]/.test(l)) continue; titles.push(l.trim()); if (titles.length >= 3) break; }
  const stem = String(fileName).replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  const lineName = (titles[2] && /[A-Za-z0-9]/.test(titles[2]) ? titles[2] : stem.replace(/(AV|Av|av)$/, "")) || "1";
  // the records
  const by = new Map(), stations = [], compOrder = [];
  let nch = 0, skipped = 0, rows = 0;
  let i = dollar + 1;
  while (i < all.length) {
    const hd = all[i].trim();
    if (!hd) { i++; continue; }
    const m = /^(-?\d+(?:\.\d+)?)\s*([NSEWnsew])?\s+([XYZ])R?(\d*)\b/i.exec(hd);
    if (!m) { i++; continue; }
    let stn = NUM(m[1]);
    if (/[SWsw]/.test(m[2] || "") && stn > 0) stn = -stn; // a southing or westing is written positive with its letter
    const comp = m[3].toUpperCase();
    i++;
    if (/^[A-Za-z]\d?\s/.test((all[i] || "").trim()) || /^D\d/.test((all[i] || "").trim())) i++; // the flags line
    const v = [];
    while (i < all.length && all[i].trim() && /^[\s\d.eE+\-]+$/.test(all[i])) { v.push(...all[i].trim().split(/\s+/).map(NUM)); i++; }
    if (v.length < 2 || !Number.isFinite(stn)) { skipped++; continue; }
    if (!nch) nch = v.length - 1;
    if (v.length - 1 !== nch) { skipped++; continue; }
    let s = by.get(stn);
    if (!s) { s = { line: lineName, x: NaN, y: NaN, elev: NaN, station: stn, acc: {}, reads: {} }; by.set(stn, s); stations.push(s); }
    if (!compOrder.includes(comp)) compOrder.push(comp);
    const acc = s.acc[comp] || (s.acc[comp] = { sum: new Array(nch).fill(0), n: new Array(nch).fill(0) });
    s.reads[comp] = (s.reads[comp] || 0) + 1;
    for (let g = 0; g < nch; g++) { const x = v[g + 1]; if (Number.isFinite(x)) { acc.sum[g] += x; acc.n[g]++; } } // v[0] is the primary field
    rows++;
  }
  if (!nch || !stations.length) throw new Error("no readings were found after the '$' line");
  for (const s of stations) { s.comps = {}; for (const [c, q] of Object.entries(s.acc)) s.comps[c] = Float64Array.from(q.sum, (t, k) => (q.n[k] ? t / q.n[k] : NaN)); delete s.acc; }
  // positions: the file's <Pnn> (a station number each), else the stations placed along their line (the loop decides which way)
  let positions = "file", positionNote = null;
  const missing = stations.filter((s) => !posByStn.has(Math.round(s.station * 100) / 100));
  for (const s of stations) { const p = posByStn.get(Math.round(s.station * 100) / 100); if (p) { s.x = p.x; s.y = p.y; s.elev = p.z; } }
  if (missing.length) {
    positions = missing.length === stations.length ? "line" : "file";
    const r = placeLine(lineName, missing.map((s) => s.station), loop.length >= 3 ? loop.map((p) => [p.x, p.y]) : null);
    missing.forEach((s, k) => { s.x = r ? r.points[k].x : NaN; s.y = r ? r.points[k].y : NaN; });
    if (r) positionNote = { axes: [r.axis], how: [r.how] };
  }
  const gates = Array.from({ length: nch }, (_, k) => `CH${k + 1}`);
  const rank = (c) => "ZXY".indexOf(c);
  const components = [...compOrder].sort((p, q) => rank(p) - rank(q) || compOrder.indexOf(p) - compOrder.indexOf(q)); // Z first: the decay and the 1D inversion read it
  const times = block.length >= nch ? block.slice(block.length - nch).map((s) => +(s * 1000).toPrecision(6)) : null; // ms
  const family = stp ? "Crone STP" : "Crone PEM";
  return {
    header: { LINE: lineName, FORMAT: String(fmt), ...(units ? { UNITS: units } : {}) }, title: titles[0] || "", family, sourceLabel: `${family} (fixed loop)`, columns: ["EAST", "NORTH", "ELEV", "STN", "C", ...gates],
    config: "fixed loop", times, gates, components, assumedComponent: false, adcLeftOut: 0, stations, units, rows, positions, positionNote, hasTimes: !!times, widths: null,
    timesListed: block.length, skipped, hasStation: true, stepResponse: stp,
    loop: loop.length >= 3 ? loop : null, loopSize,
  };
}

// the radius of the circle with the loop's area (shoelace over its corners), in metres, or null: a fixed loop as the ground central loop of the 1D inversion
export function loopEquivalentRadius(loop) {
  if (!loop || loop.length < 3) return null;
  let a = 0;
  for (let i = 0; i < loop.length; i++) { const p = loop[i], q = loop[(i + 1) % loop.length]; a += p.x * q.y - q.x * p.y; }
  const area = Math.abs(a) / 2;
  return area > 0 ? Math.sqrt(area / Math.PI) : null;
}

// a loop's extent for a note: its corners' span in x and y (metres), or null
export function loopSpan(loop) {
  if (!loop || loop.length < 3) return null;
  const xs = loop.map((p) => p.x), ys = loop.map((p) => p.y);
  return [arrMax(xs) - arrMin(xs), arrMax(ys) - arrMin(ys)];
}
