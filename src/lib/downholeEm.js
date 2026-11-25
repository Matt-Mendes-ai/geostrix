// TASKS.csv #4064 (side 2's #4061 harvest: real downhole EM in 15 Queensland open-file reports; unblocks #3804's refusal) — a downhole (borehole) EM reader.
// What is read, into ONE structure (hole, depth along the hole, component, gate times, one reading per gate, the loop and collar where the file gives them):
//  - Maxwell-style tables (Maxwell "TEM File Created by MAXWELL", SMARTem V / SMARTem24 "Atlantis" receiver exports, Crone-to-Maxwell "DOWNHOLE PEM SURVEY"
//    tables): a column line with CH1 … CHn, a depth column (STN / STATION) or, in the files that have none, the receiver's own position, a component column
//    (COMPONENT, or C), gate times on /TIMES (centre) + /TIMESWIDTH, or /TIMESSTART + /TIMESEND, or in a Crone .CHN file named by the header.
//  - Crone PEM (<FMT> 210): the readings of each station, the time block in seconds, the loop and the hole's path in the tags.
// No plate modelling: this only reads, matches the holes and draws. Pure: no UI. The parsers keep no file in memory beyond the averaged stations.

import { parseTemReceiver } from "./maxwellTem.js"; // the one receiver-text parser (Maxwell / SMARTem / Crone tables), shared with the ground TEM reader

const NUM = (s) => { const v = Number(s); return Number.isFinite(v) ? v : NaN; };
const lines = (text) => String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");

// -- what a file is ---------------------------------------------------------------------------------------------------------------------------------
// "maxwell" (a table with CH columns and a downhole header), "pem" (<FMT> 210), "chn" (a Crone channel-time file), or null. head: the first part of the file.
export function downholeEmKind(head, name = "") {
  const h = String(head || "").slice(0, 8000);
  if (/^\s*<FMT>\s*210\b/m.test(h) && /<UNI>/.test(h)) return /^\s*Surface\s+(Metric|Imperial)\b/im.test(h) ? "pem-surface" : "pem"; // the instrument line says Borehole or Surface
  if (/^\s*Crone\b[^\n]*msec time base/im.test(h) && /DELAY\s+WIDTH/i.test(h)) return "chn";
  const downhole = /\bCONFIG:\s*DOWN\s*HOLE\b|\bCONFIG:\s*DOWNHOLE\b/i.test(h) || /\b(DOWN ?HOLE|BORE ?HOLE) PEM SURVEY\b/i.test(h);
  if (downhole && /^\s*(STN|STATION|EAST)\b[^\n]*\bCH1\b/im.test(h.replace(/\n/g, "\n"))) return "maxwell";
  if (downhole && /\bCH1\b/.test(h)) return "maxwell";
  return null;
}

// -- header keys (the words the shared receiver parser read: header.KEY) ---------------------------------------------------------------------------------
const num0 = (v) => { const n = NUM(v); return Number.isFinite(n) ? n : null; };
function loopOf(keys) {
  const pts = [];
  for (let i = 1; i <= 8; i++) { const x = num0(keys[`LV${i}X`]), y = num0(keys[`LV${i}Y`]), z = num0(keys[`LV${i}Z`]); if (x != null && y != null) pts.push({ x, y, z: z ?? 0 }); }
  return pts.length >= 3 ? pts : null;
}
const unitsOf = (s) => { const m = /\(([^)]+)\)/.exec(String(s || "")); return m ? m[1] : String(s || "").replace(/[()]/g, ""); };
// a Crone .CHN (delay and width per gate, ms) -> { centres, widths }
export function parseChn(text) {
  const out = { centres: [], widths: [] };
  let on = false;
  for (const l of lines(text)) {
    if (/^\s*DELAY\s+WIDTH/i.test(l)) { on = true; continue; }
    if (!on) continue;
    const t = l.trim().split(/\s+/);
    if (t.length >= 2 && Number.isFinite(NUM(t[0])) && Number.isFinite(NUM(t[1]))) { out.centres.push(NUM(t[0]) + NUM(t[1]) / 2); out.widths.push(NUM(t[1])); }
  }
  return out.centres.length ? out : null;
}

// -- the station table of one hole and component ----------------------------------------------------------------------------------------------------
// readings repeat (RDNG, several stacks, an up and a down pass): kept as the mean per depth, with how many went into it
function stationAccumulator() {
  const m = new Map(); // depth key -> { d, sum[], cnt[], x, y, z }
  return {
    add(depth, vals, pos, reads = 1) {
      const key = Math.round(depth * 1000);
      let s = m.get(key);
      if (!s) m.set(key, (s = { d: depth, sum: new Float64Array(vals.length), cnt: new Int32Array(vals.length), reads: 0, x: null, y: null, z: null }));
      for (let i = 0; i < vals.length; i++) if (vals[i] === vals[i]) { s.sum[i] += vals[i]; s.cnt[i]++; }
      s.reads += reads;
      if (pos && s.x == null && Number.isFinite(pos.x) && Number.isFinite(pos.y)) { s.x = pos.x; s.y = pos.y; s.z = Number.isFinite(pos.z) ? pos.z : null; }
    },
    stations() {
      return [...m.values()].sort((a, b) => a.d - b.d).map((s) => ({ depth: s.d, values: Array.from(s.sum, (v, i) => (s.cnt[i] ? v / s.cnt[i] : NaN)), reads: s.reads, x: s.x, y: s.y, z: s.z }));
    },
  };
}
const COMP = (c) => { const u = String(c || "").trim().toUpperCase(); return /^[AUVXYZ]/.test(u) ? u[0] : ""; };

// holes: Map(id -> { id, comps: Map(comp -> accumulator) , collar, dip, azimuth })
function holeOf(holes, id) {
  let h = holes.get(id);
  if (!h) holes.set(id, (h = { id, comps: new Map(), collar: null, dip: null, azimuth: null }));
  return h;
}
function finish({ kind, format, file, units, holes, times, nch, loop, warnings, skipped, timesNote }) {
  const out = [];
  for (const h of holes.values()) {
    const comps = {};
    for (const [c, acc] of h.comps) { const st = acc.stations(); if (st.length) comps[c] = st; }
    if (Object.keys(comps).length) out.push({ id: h.id, comps, collar: h.collar, dip: h.dip, azimuth: h.azimuth, loop: h.loop || loop || null });
  }
  return { kind, format, file, units: units || "", holes: out, times, nch, warnings, skipped, timesNote: timesNote || "" };
}

// -- Maxwell-style tables ---------------------------------------------------------------------------------------------------------------------------
// companions: { "NAME.CHN": text } — the channel-time file a Crone-to-Maxwell export names in CHANNELFILE
export function parseMaxwellDhem(text, fileName = "", companions = {}) {
  const warnings = [];
  const stem = String(fileName).replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  // the ONE receiver-text parser (lib/maxwellTem.js, also the ground TEM reader): its stations are rows of one hole here, its 'line' is the hole
  const idFromHeader = (h) => [h.HOLE, h.BOREHOLE, h.LINE && !/^MULTI$/i.test(h.LINE) ? h.LINE : null, h.SETTINGSFILENAME].find((v) => v && String(v).length) || stem;
  let r;
  try { r = parseTemReceiver(text, { placeLines: false, lineDefault: idFromHeader }); }
  catch (e) { throw new Error(/column header/i.test(e.message) ? "no column line with CH1 … CHn was found" : "no readings were found under the column line"); }
  if (!r.components.length || r.assumedComponent) throw new Error("no component column (COMPONENT or C)");
  const keys = r.header, nch = r.gates.length;
  const collar = num0(keys.XCOLLAR) != null && num0(keys.YCOLLAR) != null ? { x: num0(keys.XCOLLAR), y: num0(keys.YCOLLAR), z: num0(keys.ZCOLLAR) ?? 0 } : null;
  const units = r.units ? unitsOf(r.units) : "", loop = loopOf(keys);
  // gate times: the file's own (/TIMES, or /TIMESSTART + /TIMESEND), else a Crone .CHN named by the header
  let times = r.times ? { centres: r.times, widths: r.widths, source: "the file" } : null, timesNote = "";
  if (!times && r.timesListed && r.timesListed !== nch) warnings.push(`the file lists ${r.timesListed} gate times for ${nch} channels: the gate times are not used`);
  if (!times && keys.CHANNELFILE) {
    const want = String(keys.CHANNELFILE).toUpperCase();
    const hit = Object.keys(companions || {}).find((n) => n.toUpperCase() === want);
    const chn = hit ? parseChn(companions[hit]) : null;
    if (chn && chn.centres.length === nch) { times = { ...chn, source: "the .CHN file" }; }
    else if (chn) warnings.push(`${keys.CHANNELFILE} has ${chn.centres.length} gates, the readings have ${nch}: the gate times are not used`);
    else timesNote = `The gate times are in ${keys.CHANNELFILE}: open it with the file.`;
  }
  if (times && times.centres.length !== nch) { warnings.push(`the file lists ${times.centres.length} gate times for ${nch} channels: the gate times are not used`); times = null; }
  const holes = new Map();
  let noDepth = false, used = 0, skipped = r.skipped;
  const holeMeta = (id) => { const h = holeOf(holes, id); if (!h.collar && collar) h.collar = collar; if (h.dip == null && num0(keys.DIP) != null) h.dip = num0(keys.DIP); if (h.azimuth == null && num0(keys.AZIMUTH) != null) h.azimuth = num0(keys.AZIMUTH); return h; };
  for (const st of r.stations) {
    const pos = Number.isFinite(st.x) && Number.isFinite(st.y) ? { x: st.x, y: st.y, z: st.elev } : null;
    let depth = r.hasStation ? st.station : NaN;
    if (!Number.isFinite(depth) && pos && collar) { depth = Math.hypot(pos.x - collar.x, pos.y - collar.y, (Number.isFinite(pos.z) ? pos.z : collar.z) - collar.z); noDepth = true; }
    if (!Number.isFinite(depth)) { skipped += Object.values(st.reads).reduce((p, q) => p + q, 0); continue; }
    const h = holeMeta(st.line);
    for (const [c0, vals] of Object.entries(st.comps)) {
      const comp = COMP(c0);
      if (!comp) { skipped += st.reads[c0]; continue; }
      let acc = h.comps.get(comp);
      if (!acc) h.comps.set(comp, (acc = stationAccumulator()));
      acc.add(depth, Array.from(vals), pos, st.reads[c0]);
      used += st.reads[c0];
    }
  }
  if (noDepth) warnings.push("the file has no station (depth) column: the depth is the distance from the collar to the receiver's position");
  if (r.adcLeftOut) warnings.push(`${r.adcLeftOut} readings of a second ADC were left out (one ADC per component is kept)`);
  if (!used) throw new Error("no readings were found under the column line");
  return finish({ kind: "maxwell", format: formatName(r.title, keys), file: stem, units, holes, times, nch, loop, warnings, skipped, timesNote });
}
function formatName(line1, keys) {
  const l = String(line1 || "");
  if (/SMARTem/i.test(l)) return /SMARTem24|DigiAtlantis/i.test(l + (keys.RECEIVER || "")) ? "SMARTem24 / DigiAtlantis export" : "SMARTem receiver export";
  if (/MAXWELL/i.test(l)) return "Maxwell table";
  if (/PEM SURVEY/i.test(l)) return "Crone PEM survey table";
  return "downhole TEM table";
}

// -- Crone PEM (<FMT> 210) --------------------------------------------------------------------------------------------------------------------------
export function parsePem(text, fileName = "") {
  const all = lines(text), warnings = [];
  const tag = (name) => { const l = all.find((x) => new RegExp(`^\\s*<${name}>`).test(x)); return l ? l.replace(/^\s*<[^>]+>/, "").replace(/~.*$/, "").trim() : ""; };
  const uni = tag("UNI"), units = /nano/i.test(uni) ? "nT/s" : /pico/i.test(uni) ? "pT/s" : /micro/i.test(uni) ? "µT/s" : uni;
  const fl = (s) => String(s).trim().split(/\s+/).map(NUM);
  const loopPts = [];
  for (let k = 0; k < 8; k++) { const t = tag(`L0${k}`); if (!t) continue; const [x, y, z, u] = fl(t); if (Number.isFinite(x) && Number.isFinite(y)) { const f = u === 1 ? 0.3048 : 1; loopPts.push({ x: x * f, y: y * f, z: (Number.isFinite(z) ? z : 0) * f }); } }
  const p0 = fl(tag("P00") || "");
  const collar = p0.length >= 2 && Number.isFinite(p0[0]) && Number.isFinite(p0[1]) ? { x: p0[0], y: p0[1], z: Number.isFinite(p0[2]) ? p0[2] : 0 } : null;
  let az = null, dip = null;
  { const t = tag("P01"); const v = t ? fl(t) : []; if (v.length >= 4 && v[3] >= 2) { az = v[0]; dip = v[1]; } }
  const dollar = all.findIndex((l) => /^\s*\$\s*$/.test(l));
  if (dollar < 0) throw new Error("no '$' line before the readings");
  // the time block: the run of all-number lines just above the '$' line, in seconds
  let a = dollar - 1;
  while (a >= 0 && !all[a].trim()) a--;
  const block = [];
  while (a >= 0 && /^[\s\d.eE+\-]+$/.test(all[a]) && all[a].trim()) { block.unshift(...all[a].trim().split(/\s+/).map(NUM)); a--; }
  // the title lines above: company, property, hole, loop, date
  const titles = [];
  for (let k = 0; k < all.length && k < dollar; k++) {
    const l = all[k];
    if (!l.trim() || /^\s*[<~]/.test(l)) continue;
    titles.push(l.trim());
    if (titles.length >= 3) break;
  }
  const stem = String(fileName).replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  const holeId = titles[2] && /[A-Za-z0-9]/.test(titles[2]) && !/\s{2,}/.test(titles[2]) ? titles[2] : stem.replace(/(XY|Z)\d*$/i, "") || stem;
  const holes = new Map(), h = holeOf(holes, holeId);
  h.collar = collar; h.dip = dip; h.azimuth = az;
  let nch = 0, skipped = 0;
  let i = dollar + 1;
  while (i < all.length) {
    const head = all[i].trim();
    if (!head) { i++; continue; }
    const m = /^(-?[\d.]+)\s+([XYZ])R?(\d*)\b/i.exec(head);
    if (!m) { i++; continue; }
    const stn = NUM(m[1]), comp = m[2].toUpperCase();
    i++;
    if (/^[A-Za-z]\d?\s/.test((all[i] || "").trim()) || /^D\d/.test((all[i] || "").trim())) i++; // the flags line ('D7 0 0 …')
    const v = [];
    while (i < all.length && all[i].trim() && /^[\s\d.eE+\-]+$/.test(all[i])) { v.push(...all[i].trim().split(/\s+/).map(NUM)); i++; }
    if (v.length < 2 || !Number.isFinite(stn)) { skipped++; continue; }
    if (!nch) nch = v.length - 1;
    if (v.length - 1 !== nch) { skipped++; continue; }
    let acc = h.comps.get(comp);
    if (!acc) h.comps.set(comp, (acc = stationAccumulator()));
    acc.add(stn, v.slice(1), null); // v[0] is the primary field
  }
  if (!nch) throw new Error("no readings were found after the '$' line");
  let times = null, timesNote = "";
  if (block.length >= nch) { const c = block.slice(block.length - nch).map((s) => s * 1000); times = { centres: c, widths: null, source: "the time block (seconds)" }; }
  else timesNote = "The time block of the file is shorter than the readings: the gate times are not shown.";
  const hs = new Map([[holeId, h]]);
  return finish({ kind: "pem", format: "Crone PEM", file: stem, units, holes: hs, times, nch, loop: loopPts.length >= 3 ? loopPts : null, warnings, skipped, timesNote });
}

// one file -> the structure above; companions: { name: text } for the .CHN files dropped with it
export function readDownholeEm(text, fileName = "", companions = {}) {
  const kind = downholeEmKind(String(text).slice(0, 8000), fileName);
  if (kind === "pem") return parsePem(text, fileName);
  if (kind === "maxwell") return parseMaxwellDhem(text, fileName, companions);
  if (kind === "pem-surface") throw new Error("this is a surface PEM profile (stations along a line), not a hole: it has no depth. TEM line data reads line surveys");
  if (kind === "chn") throw new Error("this is a channel-time file: open it together with the survey file that names it");
  throw new Error("not a downhole EM file this reader knows (Maxwell / SMARTem tables with CH1 … CHn, or Crone PEM)");
}

// -- matching the file's holes to the project's -----------------------------------------------------------------------------------------------------
const squash = (s) => String(s ?? "").toLowerCase().replace(/[\s_\-.]+/g, "");
const unzero = (s) => s.replace(/([a-z])0+(\d)/g, "$1$2"); // QRSQ-010 and QRSQ10
const keysOf = (id) => {
  const out = [];
  let s = String(id ?? "").trim();
  const push = (v) => { const a = squash(v), b = unzero(a); for (const k of [a, b]) if (k && !out.includes(k)) out.push(k); };
  push(s);
  push(s.replace(/^hole[\s_\-]*/i, ""));
  // trailing repeat / loop / survey suffixes: _1, _L1605, _TX13, _LS_DHEM2017_1 -> shorter and shorter
  let cur = s.replace(/^hole[\s_\-]*/i, "");
  for (let k = 0; k < 4; k++) { const t = cur.replace(/[_\-.][^_\-.]*$/, ""); if (t === cur || !t) break; cur = t; push(cur); }
  return out;
};
// emIds: the ids in the file(s); holeIds: the project's. -> [{ id, hole, how }]; how: 'exact' | 'same name' | 'name with a suffix' | 'prefix' | null
export function matchEmHoles(emIds, holeIds) {
  const exact = new Map(), norm = new Map();
  for (const h of holeIds || []) {
    const id = String(h);
    if (!exact.has(id)) exact.set(id, id);
    for (const k of [squash(id), unzero(squash(id))]) { if (!k) continue; if (norm.has(k) && norm.get(k) !== id) norm.set(k, null); else norm.set(k, id); } // null: two holes squash to one key
  }
  return (emIds || []).map((raw) => {
    const id = String(raw);
    if (exact.has(id)) return { id, hole: id, how: "exact" };
    const ks = keysOf(id);
    for (let n = 0; n < ks.length; n++) { const hit = norm.get(ks[n]); if (hit) return { id, hole: hit, how: n === 0 || n === 1 ? "same name" : "name with a suffix" }; }
    // the project's id is the start of the file's (min 4 characters, and only one hole fits)
    const k0 = unzero(squash(id)), cands = [...new Set([...norm.entries()].filter(([k, v]) => v && k.length >= 4 && k0.startsWith(k)).map(([, v]) => v))];
    if (cands.length === 1) return { id, hole: cands[0], how: "prefix" };
    return { id, hole: null, how: null };
  });
}

// -- the layer a component of a hole set makes (strip log, 3D tubes and bars read it as any numeric log) ------------------------------------------------
// stations: [{ depth, values[] }]; the interval of a station runs to the middle of the gap to its neighbours (at the ends, half the gap on that side)
export function stationIntervals(stations) {
  const d = stations.map((s) => s.depth), n = d.length;
  const gaps = []; for (let i = 1; i < n; i++) if (d[i] > d[i - 1]) gaps.push(d[i] - d[i - 1]);
  gaps.sort((p, q) => p - q);
  const med = gaps.length ? gaps[(gaps.length - 1) >> 1] : 1, cap = 5 * med;
  return stations.map((s, i) => {
    const up = i > 0 ? Math.min(cap, (d[i] - d[i - 1]) / 2) : med / 2, dn = i < n - 1 ? Math.min(cap, (d[i + 1] - d[i]) / 2) : med / 2;
    return { from: +(s.depth - up).toFixed(3), to: +(s.depth + dn).toFixed(3) };
  });
}
// rows for one component over the holes that are matched: [{ hole_id, depth, from, to, value, n, CH1 … CHn }]; value is channel `ch` (1-based)
export function emLayerRows(holes, comp, ch, idOf = (h) => h.id) {
  const rows = [];
  for (const h of holes) {
    const st = h.comps[comp];
    if (!st) continue;
    const iv = stationIntervals(st), hid = idOf(h);
    st.forEach((s, i) => {
      const r = { hole_id: hid, depth: s.depth, from: iv[i].from, to: iv[i].to, value: Number.isFinite(s.values[ch - 1]) ? s.values[ch - 1] : null, n: s.reads };
      for (let k = 0; k < s.values.length; k++) r[`CH${k + 1}`] = Number.isFinite(s.values[k]) ? s.values[k] : null;
      rows.push(r);
    });
  }
  return rows;
}
// the channel offered first for the strip log: about three-fifths of the way down the decay (a mid-to-late gate: the conductor's response, above the early noise)
export const defaultChannel = (nch) => Math.max(1, Math.min(nch, Math.round(nch * 0.6)));
// a signed value on a log-like scale: linear inside ±lin, log beyond (a decay with negative early readings)
export const symlog = (v, lin) => (v === v ? Math.sign(v) * Math.log10(1 + Math.abs(v) / (lin || 1)) : NaN);
// the component letters in the order a person reads them: the axial first
export const COMPONENT_ORDER = ["A", "Z", "U", "X", "V", "Y"];
export const sortComps = (cs) => [...cs].sort((a, b) => COMPONENT_ORDER.indexOf(a) - COMPONENT_ORDER.indexOf(b));
// the project layers that came from this reader -> the same shape as a read file's holes, so the pane draws either
export function holesFromLayers(customLayers) {
  const byHole = new Map(), meta = new Map();
  for (const l of customLayers || []) {
    const em = l?.em;
    if (!em || !Array.isArray(l.rows)) continue;
    meta.set(l.id, em);
    for (const r of l.rows) {
      const nch = em.nch || 0, vals = new Array(nch);
      for (let k = 0; k < nch; k++) { const v = r[`CH${k + 1}`]; vals[k] = v == null ? NaN : Number(v); }
      const key = `${l.id}\u0001${r.hole_id}`;
      let h = byHole.get(key);
      if (!h) byHole.set(key, (h = { id: String(r.hole_id), layerId: l.id, comps: { [em.component]: [] }, units: em.units || "", times: em.times || null, nch, file: em.file || l.name }));
      h.comps[em.component].push({ depth: Number(r.depth), values: vals, reads: r.n || 1 });
    }
  }
  return [...byHole.values()];
}
