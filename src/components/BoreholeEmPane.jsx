// TASKS.csv #4064 — the Geophysics tab's Borehole EM pane: downhole time-domain EM files (Maxwell / SMARTem tables, Crone PEM) read into holes, depths, components
// and gate readings (lib/downholeEm.js), matched to the project's holes, drawn as channel profiles down the hole with the decay at a picked depth, and added
// as numeric layers so the Strip log and the 3D View show them along the trace. It reads and draws; it does not model conductor plates.
import React, { useMemo, useRef, useState } from "react";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { Radio, Upload } from "./icons.js";
import { smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";
import { arrMin, arrMax } from "../lib/arrayStats.js"; // no Math.min / max spread (#371)
import { readDownholeEm, downholeEmKind, matchEmHoles, emLayerRows, defaultChannel, symlog, sortComps, holesFromLayers } from "../lib/downholeEm.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const rowS = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", fontSize: "var(--font-size-sm)", marginBottom: 6 };
const VIR = ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"]; // early gates purple, late yellow
const gateColour = (k, m) => VIR[Math.round((m > 1 ? k / (m - 1) : 0) * (VIR.length - 1))];
const COMP_COLOUR = { A: "#1f77b4", Z: "#1f77b4", U: "#d95f02", X: "#d95f02", V: "#1b9e77", Y: "#1b9e77" };
const fmt = (v) => (v == null || !Number.isFinite(v) ? "–" : Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : Number(v.toPrecision(3)).toLocaleString());
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
let LAST = null; // the pane's state between visits (the tab unmounts it)

// one hole's channels down the hole: depth runs down; each gate is a line of its readings on a signed log-like scale. Click for a depth.
function Profiles({ stations, nch, units, sel, onPick }) {
  const W = 300, H = 230, pl = 36, pb = 20, pt = 6, pr = 6;
  const ref = useRef(null);
  const { lin, lo, hi, d0, d1 } = useMemo(() => {
    const abs = [];
    let dmin = Infinity, dmax = -Infinity;
    for (const s of stations) { if (s.depth < dmin) dmin = s.depth; if (s.depth > dmax) dmax = s.depth; for (const v of s.values) if (v === v) abs.push(Math.abs(v)); }
    abs.sort((a, b) => a - b);
    const med = abs.length ? abs[abs.length >> 1] : 1, l = med > 0 ? med / 50 : 1;
    let a = Infinity, b = -Infinity;
    for (const s of stations) for (const v of s.values) { const q = symlog(v, l); if (q === q) { if (q < a) a = q; if (q > b) b = q; } }
    if (!Number.isFinite(a)) { a = -1; b = 1; }
    if (b - a < 1e-6) b = a + 1;
    return { lin: l, lo: Math.min(a, 0), hi: Math.max(b, 0), d0: dmin, d1: dmax > dmin ? dmax : dmin + 1 };
  }, [stations]);
  const sx = (q) => pl + ((q - lo) / (hi - lo)) * (W - pl - pr), sy = (d) => pt + ((d - d0) / (d1 - d0)) * (H - pt - pb);
  const paths = [];
  const m = Math.min(nch, 64);
  for (let k = 0; k < m; k++) {
    let p = "", pen = false;
    for (const s of stations) { const q = symlog(s.values[k], lin); if (q === q) { p += `${pen ? "L" : "M"}${sx(q).toFixed(1)},${sy(s.depth).toFixed(1)}`; pen = true; } else pen = false; }
    if (p) paths.push(<path key={k} d={p} fill="none" stroke={gateColour(k, m)} strokeWidth={0.9} />);
  }
  const pick = (e) => {
    const r = ref.current.getBoundingClientRect(), y = (e.clientY - r.top) * (H / r.height), d = d0 + ((y - pt) / (H - pt - pb)) * (d1 - d0);
    let best = 0; for (let j = 1; j < stations.length; j++) if (Math.abs(stations[j].depth - d) < Math.abs(stations[best].depth - d)) best = j;
    onPick(stations[best].depth);
  };
  const ticks = []; const step = [5, 10, 20, 25, 50, 100, 200, 250, 500].find((s) => (d1 - d0) / s <= 8) || 1000;
  for (let d = Math.ceil(d0 / step) * step; d <= d1; d += step) ticks.push(d);
  const inv = (q) => Math.sign(q) * lin * (10 ** Math.abs(q) - 1);
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", cursor: "crosshair", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4 }} onClick={pick} role="img" aria-label={tr("Channels down the hole: click a depth.")}><title>{tr("Early gates purple, late yellow; signed log scale.")}</title>
      {ticks.map((d) => <g key={d}><line x1={pl} x2={W - pr} y1={sy(d)} y2={sy(d)} stroke="var(--color-border)" strokeWidth={0.5} /><text x={pl - 3} y={sy(d) + 4} fontSize={12} textAnchor="end" fill="var(--color-text-muted)">{d}</text></g>)}
      <line x1={sx(0)} x2={sx(0)} y1={pt} y2={H - pb} stroke="var(--color-text-muted)" strokeWidth={0.6} strokeDasharray="2 2" />
      {paths}
      {sel != null && <line x1={pl} x2={W - pr} y1={sy(sel)} y2={sy(sel)} stroke="var(--color-text)" strokeDasharray="3 2" strokeWidth={0.9} />}
      <text x={pl + 2} y={H - 5} fontSize={12} fill="var(--color-text-muted)">{fmt(inv(lo))}</text>
      <text x={W - pr} y={H - 5} fontSize={12} textAnchor="end" fill="var(--color-text-muted)">{`${fmt(inv(hi))} ${units || ""}`}</text>
    </svg>
  );
}

// the decay at one depth: gate time (or gate number) against the reading, on a signed log scale; a negative reading is an open ring
function Decay({ rows, times, nch, units }) {
  const W = 300, H = 170, pl = 36, pb = 20, pt = 6, pr = 8;
  const useT = !!times && times.length === nch && times.some((t) => t > 0);
  const xs = Array.from({ length: nch }, (_, k) => (useT ? times[k] : k + 1));
  const pos = xs.filter((x) => x > 0);
  const x0 = Math.floor(Math.log10(arrMin(pos.length ? pos : [1]))), x1 = Math.max(x0 + 1, Math.ceil(Math.log10(arrMax(pos.length ? pos : [10]))));
  const abs = rows.flatMap((r) => r.values.filter((v) => v === v).map(Math.abs)).filter((v) => v > 0).sort((a, b) => a - b);
  const lo = abs.length ? Math.floor(Math.log10(abs[0])) : 0, hi = abs.length ? Math.max(lo + 1, Math.ceil(Math.log10(abs[abs.length - 1]))) : 1;
  const sx = (x) => pl + ((Math.log10(x) - x0) / (x1 - x0)) * (W - pl - pr), sy = (v) => pt + ((hi - Math.log10(v)) / (hi - lo)) * (H - pt - pb);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4 }} role="img" aria-label={tr("Decay at the picked depth.")}><title>{tr("Filled dot: positive. Ring: negative.")}</title>
      {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((l) => <text key={`y${l}`} x={pl - 3} y={sy(10 ** l) + 4} fontSize={12} textAnchor="end" fill="var(--color-text-muted)">{`1e${l}`}</text>)}
      {Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i).map((l, i, all) => <text key={`x${l}`} x={sx(10 ** l)} y={H - 5} fontSize={12} textAnchor={i === 0 ? "start" : i === all.length - 1 ? "end" : "middle"} fill="var(--color-text-muted)">{useT ? `${10 ** l} ms` : `${10 ** l}`}</text>)}
      {rows.map((r) => r.values.map((v, k) => { if (!(v === v) || v === 0 || !(xs[k] > 0)) return null; const c = COMP_COLOUR[r.comp] || "#555"; return v > 0 ? <circle key={`${r.comp}${k}`} cx={sx(xs[k])} cy={sy(v)} r={2.4} fill={c} /> : <circle key={`${r.comp}${k}`} cx={sx(xs[k])} cy={sy(-v)} r={2.4} fill="none" stroke={c} strokeWidth={1.1} />; }))}
      <text x={W - pr} y={pt + 11} fontSize={12} textAnchor="end" fill="var(--color-text-muted)">{units || ""}</text>
    </svg>
  );
}

export default function BoreholeEmPane({ collars, customLayers, setCustomLayers, pendingFiles = null, onPendingDone = null, onClose }) {
  const [st, setSt] = useState(() => LAST || { files: [], assign: {}, key: null, comp: null, depth: null, ch: null });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const save = (next) => { LAST = next; setSt(next); };
  const holeIds = useMemo(() => (collars || []).map((c) => String(c.hole_id)).filter(Boolean), [collars]);

  // every hole of the files read this session (each one a source), then the project's layers that came from this reader
  const sources = useMemo(() => {
    const out = [];
    st.files.forEach((f, fi) => f.holes.forEach((h) => out.push({ key: `${f.name}\u0001${h.id}`, fileIndex: fi, file: f.file, units: f.units, times: f.times?.centres || null, nch: f.nch, id: h.id, comps: h.comps, matched: st.assign[`${f.name}\u0001${h.id}`] ?? f.match[h.id]?.hole ?? "" })));
    const seen = new Set(out.map((s) => `${s.file}|${s.matched || s.id}`));
    const merged = new Map();
    for (const h of holesFromLayers(customLayers)) {
      const k = `${h.file}|${h.id}`; if (seen.has(k)) continue;
      let s = merged.get(k);
      if (!s) merged.set(k, (s = { key: `l:${k}`, fileIndex: -1, file: h.file, units: h.units, times: h.times, nch: h.nch, id: h.id, comps: {}, matched: h.id, fromProject: true }));
      Object.assign(s.comps, h.comps);
    }
    return [...out, ...merged.values()];
  }, [st.files, st.assign, customLayers]);
  const src = sources.find((s) => s.key === st.key) || sources[0] || null;
  const comps = src ? sortComps(Object.keys(src.comps)) : [];
  const comp = comps.includes(st.comp) ? st.comp : comps[0] || null;
  const stations = src && comp ? src.comps[comp] : [];
  const nch = src?.nch || 0;
  const ch = st.ch && st.ch <= nch ? st.ch : defaultChannel(nch);
  const depth = st.depth != null && stations.some((s) => s.depth === st.depth) ? st.depth : stations[0]?.depth ?? null;
  const decayRows = src && depth != null ? comps.map((c) => { const s = src.comps[c].find((x) => x.depth === depth); return s ? { comp: c, values: s.values } : null; }).filter(Boolean) : [];
  const timeOf = (k) => (src?.times && src.times.length === nch ? src.times[k - 1] : null);

  const open = async (list) => {
    const files = [...(list || [])];
    if (!files.length) return;
    setBusy(true); setMsg({ info: true, text: tr("Reading {n} file(s)…", { n: files.length }) });
    await new Promise((r) => setTimeout(r, 0));
    const companions = {}, texts = [];
    for (const f of files) { const text = await f.text(); if (/\.chn$/i.test(f.name) || downholeEmKind(text.slice(0, 8000), f.name) === "chn") companions[f.name] = text; else texts.push([f, text]); }
    const read = [], problems = [];
    for (const [f, text] of texts) {
      try {
        const r = readDownholeEm(text, f.name, companions);
        const ids = r.holes.map((h) => h.id), match = {};
        for (const m of matchEmHoles(ids, holeIds)) match[m.id] = m;
        read.push({ ...r, name: f.name, match });
      } catch (e) { problems.push(tr("{name}: {why}", { name: f.name, why: e?.message || String(e) })); }
    }
    const next = { ...st, files: [...st.files.filter((x) => !read.some((r) => r.name === x.name)), ...read], key: read.length ? `${read[0].name}\u0001${read[0].holes[0].id}` : st.key };
    save(next);
    const holes = read.reduce((n, r) => n + r.holes.length, 0), stn = read.reduce((n, r) => n + r.holes.reduce((m, h) => m + arrMax(Object.values(h.comps).map((c) => c.length)), 0), 0);
    setMsg({ info: !problems.length, text: [read.length ? tr("Read {f} file(s): {h} hole(s), {s} station(s).", { f: read.length, h: holes, s: stn.toLocaleString() }) : "", ...problems].filter(Boolean).join(" ") });
    setBusy(false);
  };
  // dropped on the tab (GeophysicsModule hands them over once)
  const handedRef = useRef(null);
  if (pendingFiles && handedRef.current !== pendingFiles) { handedRef.current = pendingFiles; Promise.resolve().then(() => { open(pendingFiles); onPendingDone?.(); }); }

  const matchedCount = sources.filter((s) => !s.fromProject && s.matched).length;
  // the layers: one per component, over the file's matched holes; the ones from this file are replaced, their style kept (same id)
  const addLayers = (s) => {
    if (!s || s.fromProject) return;
    const f = st.files[s.fileIndex];
    const holesOf = f.holes.filter((h) => (st.assign[`${f.name}\u0001${h.id}`] ?? f.match[h.id]?.hole));
    if (!holesOf.length) { setMsg({ text: tr("No hole is matched yet.") }); return; }
    const idOf = (h) => st.assign[`${f.name}\u0001${h.id}`] ?? f.match[h.id].hole;
    const cs = sortComps([...new Set(holesOf.flatMap((h) => Object.keys(h.comps)))]);
    const t = timeOf(ch);
    setCustomLayers((p) => {
      let next = p;
      for (const c of cs) {
        const rows = emLayerRows(holesOf, c, ch, idOf);
        const id = `custom_em_${slug(f.file)}_${c}`;
        const layer = { id, name: `EM ${c} · ${f.file} · CH${ch}${t != null ? ` (${fmt(t)} ms)` : ""}`, rows, unit: f.units || null, defaultRampScale: "linear", em: { component: c, nch: f.nch, times: f.times?.centres || null, widths: f.times?.widths || null, units: f.units || "", file: f.file, format: f.format, valueChannel: ch } };
        next = next.some((l) => l.id === id) ? next.map((l) => (l.id === id ? { ...l, ...layer } : l)) : [...next, layer];
      }
      return next;
    });
    setMsg({ info: true, text: tr("Added {n} layer(s), {ch}, {h} hole(s).", { n: cs.length, ch: `CH${ch}`, h: holesOf.length }) });
  };

  return (
    <div>
      <TaskPaneHeader title={tr("Borehole EM (downhole)")} icon={Radio} tone="data" onClose={onClose} />
      <div style={{ ...note, marginBottom: 8 }}>{tr("Downhole TEM and PEM. It does not model conductor plates.")}</div>
      <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="gs-btn gs-btn--block" style={{ justifyContent: "center" }}><Upload size={14} />{" "}{tr("Open borehole EM files…")}</button>
      <input ref={fileRef} type="file" multiple accept=".tem,.pem,.stp,.chn,.txt,.dat" style={{ display: "none" }} onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ""; open(f); }} aria-label={tr("Borehole EM files")} />
      {msg && <div role={msg.info ? "status" : "alert"} style={{ ...note, color: msg.info ? "var(--color-text-secondary)" : "var(--color-warn-text)", margin: "4px 0 8px" }}>{msg.text}</div>}
      {st.files.map((f) => (
        <div key={f.name} style={{ ...note, marginBottom: 4 }}>
          <strong>{f.name}</strong>{": "}{tr("{fmt}, {h} hole(s), {n} gates.", { fmt: f.format, h: f.holes.length, n: f.nch })}
          {f.times ? ` ${tr("{a} to {b} ms.", { a: fmt(f.times.centres[0]), b: fmt(f.times.centres[f.times.centres.length - 1]) })}` : ` ${f.timesNote || tr("No gate times.")}`}
          {f.warnings.map((w) => ` ${w}.`)}
        </div>
      ))}
      {sources.length > 0 && (<>
        <div style={{ ...rowS, marginTop: 6 }}><span>{tr("Hole")}</span>
          <select value={src?.key || ""} onChange={(e) => save({ ...st, key: e.target.value, depth: null })} style={{ ...smallSel, maxWidth: 200 }} aria-label={tr("Hole")}>
            {sources.map((s) => <option key={s.key} value={s.key}>{s.id}{s.matched && s.matched !== s.id ? ` → ${s.matched}` : ""}{s.matched ? "" : ` (${tr("no project hole")})`}</option>)}
          </select>
        </div>
        {src && !src.fromProject && (
          <div style={rowS}><span>{tr("Project hole")}</span>
            <select value={src.matched || ""} onChange={(e) => save({ ...st, assign: { ...st.assign, [src.key]: e.target.value } })} style={{ ...smallSel, maxWidth: 200 }} aria-label={tr("Project hole")}>
              <option value="">{tr("— none")}</option>
              {holeIds.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        )}
        {src && !src.fromProject && !src.matched && <div style={{ ...note, color: "var(--color-warn-text)", marginBottom: 6 }}>{tr("No project hole matches: choose one.")}</div>}
        {comps.length > 0 && (
          <div style={rowS}><span>{tr("Component")}</span>
            <span style={{ display: "flex", gap: 4 }}>{comps.map((c) => <button key={c} type="button" data-btn-own="" onClick={() => save({ ...st, comp: c })} aria-pressed={c === comp} style={{ ...smallSel, cursor: "pointer", fontWeight: c === comp ? 700 : 400, borderColor: c === comp ? "var(--color-accent)" : "var(--color-border)" }}>{c}</button>)}</span>
          </div>
        )}
        {stations.length > 0 && (<>
          <Profiles stations={stations} nch={nch} units={src.units} sel={depth} onPick={(d) => save({ ...st, depth: d })} />
          <div style={{ ...note, margin: "3px 0 8px" }}>{tr("{n} stations, {a} to {b} m.", { n: stations.length.toLocaleString(), a: fmt(stations[0].depth), b: fmt(stations[stations.length - 1].depth) })}</div>
          <div style={rowS}><span>{tr("Decay at {d} m", { d: fmt(depth) })}</span>
            <span style={{ display: "flex", gap: 4 }}>
              <button type="button" className="gs-btn gs-btn--quiet gs-btn--sm" onClick={() => { const j = stations.findIndex((s) => s.depth === depth); if (j > 0) save({ ...st, depth: stations[j - 1].depth }); }} aria-label={tr("The station above")}>▲</button>
              <button type="button" className="gs-btn gs-btn--quiet gs-btn--sm" onClick={() => { const j = stations.findIndex((s) => s.depth === depth); if (j >= 0 && j < stations.length - 1) save({ ...st, depth: stations[j + 1].depth }); }} aria-label={tr("The station below")}>▼</button>
            </span>
          </div>
          <Decay rows={decayRows} times={src.times} nch={nch} units={src.units} />
          
          {!src.fromProject && (<>
            <div style={rowS}><span>{tr("Channel")}</span>
              <select value={ch} onChange={(e) => save({ ...st, ch: Number(e.target.value) })} style={{ ...smallSel, maxWidth: 170 }} aria-label={tr("Channel")}>
                {Array.from({ length: nch }, (_, i) => i + 1).map((k) => <option key={k} value={k}>{`CH${k}`}{timeOf(k) != null ? ` (${fmt(timeOf(k))} ms)` : ""}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => addLayers(src)} className="gs-btn gs-btn--block" style={{ justifyContent: "center" }} title={tr("One layer per component for the Strip log and the StrixViewer; every channel is kept.")}>{tr("Add as layers")}</button>
            <div style={note}>{tr("{m} of {n} matched.", { m: matchedCount, n: sources.filter((s) => !s.fromProject).length })}</div>
          </>)}
          {src.fromProject && <div style={note}>{tr("From a project layer.")}</div>}
        </>)}
      </>)}
    </div>
  );
}
