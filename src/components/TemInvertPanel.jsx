// TASKS.csv #3440 (step 3 of 3) — TEM line data's 1D inversion: the system (an airborne loop as a dipole with its receiver offset, or a ground
// central loop), each moment's waveform from an approximate preset, the two things a file rarely says (when its gate times start, its data's
// unit) guessed with their reasons, the job (python-sidecar/app/geophys/tem1d.py) with progress, an estimate of the time left and a Cancel that
// keeps the stations already finished, 'every Nth station' for a first look, and the result: conductivity against depth along the line, a
// station's data against its model's response, the models in 3D.
import React, { useMemo, useRef, useState } from "react";
import { channelMatrix, noiseGroupFor, stdKindGuess } from "../lib/temLines.js";
import { WAVEFORM_PRESETS, waveformFrom, parseWaveformTable, parseFilters, timeZeroGuess, unitGuess, heightColumn, rxColumn, buildTemRequest, mergePartials, partialResult, layerThicknesses } from "../lib/temInvert.js";
import { modelPoints } from "../lib/fdem.js";
import { SURVEY_METHODS, surveyKey } from "../lib/geophysSurveys.js";
import { runTem1dJob } from "../lib/desktop.js";
import { smallSel, pBtn } from "../lib/sidebarStyles.js";
import { arrMin, arrMax } from "../lib/arrayStats.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const rowS = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", fontSize: "var(--font-size-sm)", marginBottom: 6 };
const num = { ...smallSel, width: 64 };
// conductive red, resistive blue (as FDEM 1D's section)
const RAMP = ["#2166ac", "#67a9cf", "#d1e5f0", "#fddbc7", "#ef8a62", "#b2182b"];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function rampRgb(t) {
  const u = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(u)), f = u - i;
  const a = hex(RAMP[i]), b = hex(RAMP[i + 1]);
  return a.map((v, k) => Math.round(v + (b[k] - v) * f));
}
const fmt = (v) => (v == null || !Number.isFinite(v) ? "–" : Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : Number(v.toPrecision(3)).toLocaleString());
const sci = (v) => (v == null || !Number.isFinite(v) ? "–" : v.toExponential(1));
const EVERY = [1, 2, 5, 10, 20];
let LAST = null; // the panel's state between visits

// conductivity against depth for the line's stations that have a model, the depth of investigation dashed
function Section({ stations, result, bottom, onPick, sel }) {
  const W = 300, H = 170, pl = 30, pb = 16, pt = 4;
  const ref = useRef(null);
  const tops = useMemo(() => { const t = [0]; for (const d of result.thick) t.push(t[t.length - 1] + d); return t; }, [result.thick]);
  const withM = stations.filter((s) => result.condMs[s.j]);
  const all = withM.flatMap((s) => result.condMs[s.j].filter((v) => v > 0).map((v) => Math.log10(v)));
  const lo = all.length ? Math.floor(arrMin(all)) : -1, hi = all.length ? Math.ceil(arrMax(all)) : 3;
  const d0 = withM.length ? withM[0].d : 0, d1 = withM.length ? Math.max(d0 + 1, withM[withM.length - 1].d) : 1;
  const sx = (d) => pl + ((d - d0) / (d1 - d0)) * (W - pl - 2), sy = (z) => pt + (z / bottom) * (H - pt - pb);
  React.useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); ctx.clearRect(0, 0, W, H);
    withM.forEach((s, k) => {
      const xa = k ? (sx(withM[k - 1].d) + sx(s.d)) / 2 : sx(s.d) - 2, xb = k < withM.length - 1 ? (sx(s.d) + sx(withM[k + 1].d)) / 2 : sx(s.d) + 2;
      result.condMs[s.j].forEach((v, i) => {
        if (!(v > 0)) return;
        const z0 = tops[i], z1 = i < tops.length - 1 ? tops[i + 1] : bottom;
        if (z0 >= bottom) return;
        const [r, g, b] = rampRgb((Math.log10(v) - lo) / Math.max(1e-9, hi - lo));
        ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(xa, sy(z0), Math.max(1, xb - xa), Math.max(1, sy(Math.min(z1, bottom)) - sy(z0)));
      });
    });
    ctx.strokeStyle = "#222"; ctx.setLineDash([3, 2]); ctx.beginPath();
    withM.forEach((s, k) => { const z = result.doi[s.j]; if (Number.isFinite(z)) { if (k) ctx.lineTo(sx(s.d), sy(Math.min(z, bottom))); else ctx.moveTo(sx(s.d), sy(Math.min(z, bottom))); } });
    ctx.stroke(); ctx.setLineDash([]);
  });
  const pick = (e) => {
    const r = ref.current.getBoundingClientRect(), d = ((e.clientX - r.left) * (W / r.width) - pl) / (W - pl - 2) * (d1 - d0) + d0;
    let best = null; for (const s of withM) if (!best || Math.abs(s.d - d) < Math.abs(best.d - d)) best = s;
    if (best) onPick(best.j);
  };
  const s = withM.find((x) => x.j === sel);
  return (
    <div style={{ position: "relative" }}>
      <canvas ref={ref} width={W} height={H} onClick={pick} style={{ width: "100%", cursor: "crosshair", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4 }} role="img" aria-label={tr("The TEM models along the line: conductivity against depth, the depth of investigation dashed")} />
      <svg viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => <text key={f} x={pl - 3} y={sy(f * bottom) + 3} fontSize={8} textAnchor="end" fill="var(--color-text-muted)">{Math.round(f * bottom)}</text>)}
        {s && <line x1={sx(s.d)} x2={sx(s.d)} y1={pt} y2={H - pb} stroke="var(--color-text)" strokeWidth={0.8} strokeDasharray="2 2" />}
        <text x={W - 2} y={H - 3} fontSize={8} textAnchor="end" fill="var(--color-text-muted)">{tr("{lo} to {hi} mS/m, log scale; depth in m", { lo: fmt(10 ** lo), hi: fmt(10 ** hi) })}</text>
      </svg>
    </div>
  );
}

// a station's readings (dots) and its model's response (line), every moment, log-log
function Fit({ times, obs, pred }) {
  const W = 300, H = 130, pl = 34, pb = 16, pt = 4;
  const pts = times.map((t, k) => [t, obs[k], pred[k]]).filter(([t]) => t > 0);
  const vals = pts.flatMap(([, o, p]) => [o, p]).filter((v) => v > 0);
  if (pts.length < 2 || !vals.length) return null;
  const lt = pts.map(([t]) => Math.log10(t)), lv = vals.map(Math.log10);
  const x0 = Math.floor(arrMin(lt)), x1 = Math.ceil(arrMax(lt)), y0 = Math.floor(arrMin(lv)), y1 = Math.max(y0 + 1, Math.ceil(arrMax(lv)));
  const sx = (l) => pl + ((l - x0) / Math.max(1e-9, x1 - x0)) * (W - pl - 4), sy = (l) => pt + ((y1 - l) / Math.max(1e-9, y1 - y0)) * (H - pt - pb);
  const order = pts.map((p, k) => [p, k]).sort((a, b) => a[0][0] - b[0][0]);
  let path = "";
  order.forEach(([[t, , p]], k) => { if (p > 0) path += `${path ? "L" : "M"}${sx(Math.log10(t)).toFixed(1)},${sy(Math.log10(p)).toFixed(1)}`; void k; });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4 }} role="img" aria-label={tr("The station's readings (dots) and its model's response (line)")}>
      {Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).map((l) => <text key={`y${l}`} x={pl - 3} y={sy(l) + 3} fontSize={8} textAnchor="end" fill="var(--color-text-muted)">{`1e${l}`}</text>)}
      {Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i).map((l) => <text key={`x${l}`} x={sx(l)} y={H - 4} fontSize={8} textAnchor="middle" fill="var(--color-text-muted)">{`${10 ** l} ms`}</text>)}
      {pts.map(([t, o], k) => (o > 0 ? <circle key={k} cx={sx(Math.log10(t))} cy={sy(Math.log10(o))} r={2.2} fill="#444" /> : null))}
      {path && <path d={path} fill="none" stroke="#b2182b" strokeWidth={1.3} />}
    </svg>
  );
}

export default function TemInvertPanel({ data, groups, timesOf, line, setLayers, updateGeophysSurvey }) {
  // groups: the channel set(s) to invert (one, or two joined); timesOf(group) -> the file's gate times (ms) or null
  const key = `${data.name}|${groups.map((g) => g.prefix).join("+")}`;
  const mats = useMemo(() => groups.map((g) => channelMatrix(data, g)), [data, groups]);
  const noiseMats = useMemo(() => groups.map((g) => { const n = noiseGroupFor(data.groups, g); return n ? channelMatrix(data, n) : null; }), [data, groups]);
  const tz = useMemo(() => timeZeroGuess(data, groups[0]), [data, groups]);
  const ug = useMemo(() => unitGuess(mats[0]), [mats]);
  const hc = useMemo(() => heightColumn(data.columns), [data]);
  const rxc = useMemo(() => rxColumn(data.columns), [data]);
  const stdGuess = useMemo(() => (noiseMats[0] ? stdKindGuess(noiseMats[0]) : "relative"), [noiseMats]);
  const fresh = () => ({
    key, geom: "vmd", r: 13, a: 20, area: 314, h: 30, rz: 0, rzCol: rxc && hc ? rxc : "", filters: "", heightsCol: hc || "", timeZero: tz.zero, unit: ug.unit, useStd: noiseMats.every(Boolean), stdKind: stdGuess, errRel: 5, every: 1,
    layers: { n: 20, first: 3, bottom: 300 },
    wave: groups.map((g, k) => { const p = groups.length > 1 ? (k === 0 ? "airLow" : "airHigh") : "airHigh"; return { preset: p, onMs: WAVEFORM_PRESETS[p].onMs, rampUs: WAVEFORM_PRESETS[p].rampUs, table: "", baseFreq: "", shiftUs: "", frontUs: "", widthsUs: "" }; }),
    result: null, pick: null, sel: null,
  });
  const [st, setSt] = useState(() => (LAST && LAST.key === key ? LAST : fresh()));
  const save = (next) => { LAST = next; setSt(next); };
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const ctl = useRef(null);
  const times = groups.map((g) => timesOf(g));
  const ready = times.every(Boolean);

  // TASKS.csv #3485 — a moment's waveform: a preset's shape, or the survey report's table (its own ramp-off, from the table's zero)
  const tables = (st.wave || []).map((w) => (w.preset === "table" ? parseWaveformTable(w.table) : null));
  const waveOf = (k) => (tables[k] ? { waveform: tables[k].waveform || null, rampUs: tables[k].rampUs || 0 } : { waveform: waveformFrom(st.wave[k].onMs, st.wave[k].rampUs), rampUs: st.wave[k].rampUs });
  const numList = (text) => String(text || "").split(/[\s,;]+/).filter(Boolean).map(Number);
  const filters = parseFilters(st.filters);
  const sysErr = tables.find((t) => t && t.error)?.error || (filters == null ? "Filters: up to three cut-offs in kHz (1 to 100,000), separated by commas." : null);
  const build = () => buildTemRequest(data, {
    moments: groups.map((g, k) => ({ group: g, times: times[k], ...waveOf(k), baseFreq: st.wave[k].baseFreq, shiftUs: st.wave[k].shiftUs, frontUs: st.wave[k].frontUs,
      widthsUs: String(st.wave[k].widthsUs || "").trim() ? numList(st.wave[k].widthsUs) : null })),
    timeZero: st.timeZero, unit: st.unit, every: st.every, heightsCol: st.heightsCol || null, rxCol: st.rzCol || null,
    noise: { use: st.useStd, kind: st.stdKind, mats: noiseMats },
    system: st.geom === "loop" ? { geom: "loop", a: Number(st.a) || 20, h: Number(st.h) || 0, filters: filters || [] }
      : { ...(st.geom === "cloop" ? { geom: "cloop", a: Math.sqrt((Number(st.area) || 314) / Math.PI) } : { geom: "vmd" }), r: Number(st.r) || 13, h: Number(st.h) || 30, rz: Number(st.rz) || 0, filters: filters || [] },
    layers: { n: Number(st.layers.n) || 20, first: Number(st.layers.first) || 3, bottom: Number(st.layers.bottom) || 300 }, errRel: (Number(st.errRel) || 5) / 100,
  });
  // the engine's progress in the app's words (its own message is English): stations finished, the pass when the neighbour tie runs twice
  const progressText = (ev) => {
    if (ev.stage !== "inverting" || !Number.isFinite(ev.iter) || !Number.isFinite(ev.stations)) return ev.message || tr("Working…");
    const k = ev.iter - (ev.pass || 0) * ev.stations;
    if (ev.iter === 0) return tr("Inverting the first stations: the first batch also prepares the engine, so it takes longer.");
    const n = ev.stations.toLocaleString();
    return ev.passes > 1 ? tr("Pass {p} of {q}: {k} of {n} stations finished.", { p: (ev.pass || 0) + 1, q: ev.passes, k: k.toLocaleString(), n }) : tr("{k} of {n} stations finished.", { k: k.toLocaleString(), n });
  };
  const run = async () => {
    if (sysErr) { setMsg({ text: tr(sysErr) }); return; }
    const b = build();
    if (!b.request.data.length) { setMsg({ text: tr("No stations to invert.") }); return; }
    const thick = layerThicknesses(b.request.layers.n, b.request.layers.first, b.request.layers.bottom);
    const abort = new AbortController();
    ctl.current = abort;
    let gathered = null;
    const t0 = Date.now();
    setBusy({ text: tr("Starting the Python engine…"), done: 0, n: b.pick.length });
    setMsg(null);
    const res = await runTem1dJob(b.request, { signal: abort.signal, onProgress: (ev) => {
      if (ev.partials) gathered = mergePartials(gathered, ev.partials);
      setBusy({ text: progressText(ev), eta: ev.etaS, done: gathered ? gathered.condMs.size : 0, n: b.pick.length });
    } });
    ctl.current = null;
    setBusy(null);
    const secs = Math.round((Date.now() - t0) / 1000);
    if (res.ok) {
      save({ ...st, result: { ...res.data, partial: false }, pick: b.pick, scale: b.scale, gates: b.request.moments.map((m) => m.gates), obs: b.request.data, sel: null });
      const chi = (res.data.chi || []).filter(Number.isFinite).sort((x, y) => x - y);
      setMsg({ info: true, text: tr("Inverted {n} stations in {s} s; misfit (chi) median {c}.", { n: b.pick.length.toLocaleString(), s: secs.toLocaleString(), c: chi.length ? chi[Math.floor(chi.length / 2)].toFixed(2) : "–" }) + (b.dropped ? " " + tr("{k} gate(s) before the front gate (or the end of the turn-off) were left out.", { k: b.dropped }) : "") + (b.widthsMismatch?.length ? " " + tr("The gate widths of {m} do not match its gates (one a gate): they were not used.", { m: b.widthsMismatch.join(", ") }) : "") + (res.data.leftOut ? " " + tr("{k} reading(s) at or below zero were left out.", { k: res.data.leftOut }) : "") });
      return;
    }
    if (res.cancelled && gathered && gathered.condMs.size) {
      save({ ...st, result: partialResult(gathered, b.pick.length, thick), pick: b.pick, scale: b.scale, gates: b.request.moments.map((m) => m.gates), obs: b.request.data, sel: null });
      setMsg({ info: true, text: gathered.condMs.size === 1 ? tr("Cancelled: the one station already finished (of {n}) is kept.", { n: b.pick.length.toLocaleString() }) : tr("Cancelled: the {k} of {n} stations already finished are kept.", { k: gathered.condMs.size.toLocaleString(), n: b.pick.length.toLocaleString() }) });
      return;
    }
    setMsg({ text: res.cancelled ? tr("Cancelled.") : tr("The inversion failed: {v}", { v: res.error || "" }) });
  };

  const R = st.result;
  const lineStations = useMemo(() => {
    if (!R || !st.pick || !line) return [];
    const at = new Map(line.idx.map((i, k) => [i, line.d[k]]));
    return st.pick.map((i, j) => ({ i, j, d: at.get(i) })).filter((s) => s.d != null).sort((a, b) => a.d - b.d);
  }, [R, st.pick, line]);
  const sel = st.sel != null ? st.sel : lineStations[0]?.j;
  const bottomDraw = useMemo(() => { if (!R) return 300; const d = R.doi.filter(Number.isFinite).sort((a, b) => a - b); const med = d.length ? d[Math.floor(d.length / 2)] : 200; return Math.min(R.thick.reduce((a, b) => a + b, 0), Math.max(50, Math.ceil(1.5 * med / 50) * 50)); }, [R]);
  // the readings the job was given (pV / (A m^4), the kept gates of each moment) against the model's response
  const fit = useMemo(() => (R && sel != null && R.pred?.[sel] && st.gates && st.obs?.[sel] ? { times: st.gates.flat().map((g) => g * 1000), obs: st.obs[sel], pred: R.pred[sel], station: st.pick[sel] } : null), [R, sel, st.gates, st.obs, st.pick]);
  const add3d = () => {
    if (!R) return;
    const name = `${data.name} · TEM 1D model`;
    const z = data.z || new Float64Array(data.n).fill(NaN);
    const { rows, noZ, every } = modelPoints({ x: data.x, y: data.y, z }, R, { pick: st.pick, src: name });
    if (!rows.length) { setMsg({ text: tr("The models cannot be placed in 3D: the file has no ground elevation column.") }); return; }
    setLayers((l) => ({ ...l, geophys_pts: [...(l.geophys_pts || []).filter((r) => surveyKey(r) !== name), ...rows] }));
    updateGeophysSurvey(name, { method: "tem1d_cond", units: SURVEY_METHODS.tem1d_cond.units });
    setMsg({ info: true, text: (every > 1 ? tr("Added \"{name}\": {n} points (log₁₀ mS/m) under every {k}th station, above each one's depth of investigation.", { name, n: rows.length.toLocaleString(), k: every }) : tr("Added \"{name}\": {n} points (log₁₀ mS/m) under the stations, above each one's depth of investigation.", { name, n: rows.length.toLocaleString() })) + (noZ ? " " + tr("{k} station(s) without a ground elevation were left out.", { k: noZ }) : "") });
  };

  const set = (patch) => save({ ...st, ...patch });
  const setWave = (k, patch) => set({ wave: st.wave.map((w, j) => (j === k ? { ...w, ...patch } : w)) });
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--color-border)" }}>
      <div style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", marginBottom: 6 }}>{tr("1D inversion: conductivity against depth")}</div>
      <div style={rowS}><span>{tr("System")}</span>
        <select value={st.geom} onChange={(e) => set({ geom: e.target.value })} style={{ ...smallSel, maxWidth: 190 }} aria-label={tr("TEM system geometry")}>
          <option value="vmd">{tr("Airborne: the loop as a dipole, receiver offset")}</option>
          <option value="cloop">{tr("Airborne: a loop of the frame's area, receiver offset")}</option>
          <option value="loop">{tr("Ground: central loop")}</option>
        </select>
      </div>
      {st.geom === "cloop" && <div style={rowS}><span>{tr("Loop area (m²)")}</span><input type="number" min="1" step="any" value={st.area} onChange={(e) => set({ area: e.target.value })} style={num} aria-label={tr("Loop area (m²)")} /></div>}
      <div style={rowS}>
        {st.geom !== "loop" ? <><span>{tr("Receiver offset (m)")}</span><input type="number" min="0.1" step="any" value={st.r} onChange={(e) => set({ r: e.target.value })} style={num} aria-label={tr("Receiver offset (m)")} /></>
          : <><span>{tr("Loop radius (m)")}</span><input type="number" min="0.1" step="any" value={st.a} onChange={(e) => set({ a: e.target.value })} style={num} aria-label={tr("Loop radius (m)")} /></>}
      </div>
      {st.geom !== "loop" && <div style={rowS}><span>{tr("Receiver above the transmitter (m)")}</span>
        <span style={{ display: "flex", gap: 4 }}>
          {rxc && st.heightsCol && <select value={st.rzCol} onChange={(e) => set({ rzCol: e.target.value })} style={{ ...smallSel, maxWidth: 120 }} aria-label={tr("Where the receiver's height comes from")}>
            <option value="">{tr("one value")}</option>
            <option value={rxc}>{tr("{c} less the height", { c: rxc })}</option>
          </select>}
          {!(rxc && st.heightsCol && st.rzCol) && <input type="number" min="-20" max="20" step="any" value={st.rz} onChange={(e) => set({ rz: e.target.value })} style={num} aria-label={tr("Receiver above the transmitter (m)")} />}
        </span>
      </div>}
      <div style={rowS}><span>{tr("Receiver low-pass filters (kHz)")}</span>
        <input type="text" value={st.filters} placeholder={tr("none")} onChange={(e) => set({ filters: e.target.value })} style={{ ...num, width: 90 }} aria-label={tr("Receiver low-pass filters (kHz)")} />
      </div>
      <div style={rowS}><span>{tr("Height above ground")}</span>
        <span style={{ display: "flex", gap: 4 }}>
          <select value={st.heightsCol} onChange={(e) => set({ heightsCol: e.target.value })} style={{ ...smallSel, maxWidth: 120 }} aria-label={tr("Column of the height above ground")}>
            <option value="">{tr("one height")}</option>
            {data.columns.filter((c) => /alt|height|agl/i.test(String(c))).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {!st.heightsCol && <input type="number" min="0" step="any" value={st.h} onChange={(e) => set({ h: e.target.value })} style={num} aria-label={tr("Height above ground (m)")} />}
        </span>
      </div>
      {groups.map((g, k) => (
        <div key={g.prefix} style={{ ...rowS, flexWrap: "wrap" }}>
          <span style={{ minWidth: 70 }}>{g.prefix}</span>
          <select value={st.wave[k].preset} onChange={(e) => { const p = WAVEFORM_PRESETS[e.target.value]; setWave(k, { preset: e.target.value, onMs: p.onMs, rampUs: p.rampUs }); }} style={{ ...smallSel, maxWidth: 180 }} aria-label={tr("Waveform of {m}", { m: g.prefix })}>
            {Object.entries(WAVEFORM_PRESETS).map(([v, p]) => <option key={v} value={v}>{tr(p.label)}</option>)}
          </select>
          {st.wave[k].preset !== "table" && st.wave[k].onMs != null && <span style={{ display: "flex", gap: 4, alignItems: "center", fontSize: "var(--font-size-xs)" }}>
            {tr("on (ms)")}<input type="number" min="0.01" step="any" value={st.wave[k].onMs} onChange={(e) => setWave(k, { onMs: Number(e.target.value) })} style={{ ...num, width: 52 }} aria-label={tr("On-time of {m} (ms)", { m: g.prefix })} />
            {tr("ramp-off (µs)")}<input type="number" min="0" step="any" value={st.wave[k].rampUs} onChange={(e) => setWave(k, { rampUs: Number(e.target.value) })} style={{ ...num, width: 52 }} aria-label={tr("Ramp-off of {m} (µs)", { m: g.prefix })} />
          </span>}
          {st.wave[k].preset === "table" && <div style={{ width: "100%" }}>
            <textarea value={st.wave[k].table || ""} onChange={(e) => setWave(k, { table: e.target.value })} rows={4} spellCheck={false} style={{ ...smallSel, width: "100%", fontFamily: "var(--font-mono, monospace)", fontSize: "var(--font-size-xs)", boxSizing: "border-box" }}
              aria-label={tr("Waveform table of {m}", { m: g.prefix })} placeholder={tr("time (s), current: one pair a line, from the start of the ramp-down")} />
            <div style={note}>{tables[k]?.error ? tr(tables[k].error) : tables[k]?.waveform ? tr("{n} points; the turn-off ends {us} µs after the table's zero.", { n: tables[k].n, us: fmt(tables[k].rampUs) }) : ""}</div>
          </div>}
          <details style={{ width: "100%", fontSize: "var(--font-size-xs)" }}>
            <summary style={{ cursor: "pointer" }}>{tr("From the survey report ({m})", { m: g.prefix })}</summary>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4, alignItems: "center", marginTop: 4 }}>
              <span>{tr("Base frequency (Hz)")}</span><input type="number" min="1" step="any" value={st.wave[k].baseFreq} placeholder={tr("one pulse")} onChange={(e) => setWave(k, { baseFreq: e.target.value })} style={num} aria-label={tr("Base frequency of {m} (Hz)", { m: g.prefix })} />
              <span>{tr("Gate time shift (µs)")}</span><input type="number" step="any" value={st.wave[k].shiftUs} placeholder="0" onChange={(e) => setWave(k, { shiftUs: e.target.value })} style={num} aria-label={tr("Gate time shift of {m} (µs)", { m: g.prefix })} />
              <span>{tr("Front gate (µs)")}</span><input type="number" step="any" value={st.wave[k].frontUs} placeholder={tr("end of turn-off")} onChange={(e) => setWave(k, { frontUs: e.target.value })} style={{ ...num, width: 90 }} aria-label={tr("Front gate of {m} (µs)", { m: g.prefix })} />
              <span>{tr("Gate widths (µs, one a gate)")}</span><input type="text" value={st.wave[k].widthsUs} placeholder={tr("none")} onChange={(e) => setWave(k, { widthsUs: e.target.value })} style={{ ...num, width: 90 }} aria-label={tr("Gate widths of {m} (µs)", { m: g.prefix })} />
            </div>
            <div style={{ ...note, marginTop: 4 }}>{tr("The base frequency adds the earlier half-periods' pulses (a bipolar transmitter). The shift corrects the file's gate times (raw to calibrated, as the report lists them). Gates before the front gate, in the file's time, are left out; blank keeps those after the end of the turn-off.")}</div>
          </details>
        </div>
      ))}
      <div style={{ ...note, marginBottom: 6 }}>{tr("The presets are approximate: check the on-time and the ramp-off against the survey report (they move the early gates).")} {tr("For a fit to the noise, take the waveform table, base frequency, filters, loop and receiver position from the survey report.")}</div>
      {sysErr && <div role="alert" style={{ ...note, color: "var(--color-warn-text)", marginBottom: 6 }}>{tr(sysErr)}</div>}
      <div style={rowS}><span>{tr("Gate times start at")}</span>
        <select value={st.timeZero} onChange={(e) => set({ timeZero: e.target.value })} style={{ ...smallSel, maxWidth: 190 }} aria-label={tr("When the gate times start")}>
          <option value="rampEnd">{tr("the end of the turn-off")}</option>
          <option value="rampStart">{tr("the start of the ramp-down")}</option>
        </select>
      </div>
      <div style={{ ...note, marginBottom: 6 }}>{tr("Guess: {v}", { v: tr(tz.reason) })}</div>
      <div style={rowS}><span>{tr("Data unit")}</span>
        <select value={st.unit} onChange={(e) => set({ unit: e.target.value })} style={{ ...smallSel, maxWidth: 190 }} aria-label={tr("Unit of the readings")}>
          <option value="SI">{tr("V/(A·m⁴) (SI)")}</option><option value="pV">{tr("pV/(A·m⁴)")}</option>
        </select>
      </div>
      <div style={{ ...note, marginBottom: 6 }}>{tr("Guess: {v}", { v: tr(ug.reason, { v: sci(ug.early) }) })}</div>
      <div style={rowS}>
        {noiseMats.every(Boolean) ? <label style={{ display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={!!st.useStd} onChange={(e) => set({ useStd: e.target.checked })} />{tr("Weigh by the file's STD columns")}</label>
          : <span>{tr("Uncertainty (%)")}</span>}
        {(!st.useStd || !noiseMats.every(Boolean)) && <input type="number" min="0.1" max="100" step="any" value={st.errRel} onChange={(e) => set({ errRel: e.target.value })} style={num} aria-label={tr("Uncertainty of every reading (%)")} />}
      </div>
      <div style={rowS}><span>{tr("Layers")}</span>
        <span style={{ display: "flex", gap: 4, alignItems: "center", fontSize: "var(--font-size-xs)" }}>
          <input type="number" min="2" max="40" step="1" value={st.layers.n} onChange={(e) => set({ layers: { ...st.layers, n: e.target.value } })} style={{ ...num, width: 44 }} aria-label={tr("Number of layers")} />
          {tr("first (m)")}<input type="number" min="0.5" step="any" value={st.layers.first} onChange={(e) => set({ layers: { ...st.layers, first: e.target.value } })} style={{ ...num, width: 44 }} aria-label={tr("First layer's thickness (m)")} />
          {tr("to (m)")}<input type="number" min="10" step="any" value={st.layers.bottom} onChange={(e) => set({ layers: { ...st.layers, bottom: e.target.value } })} style={{ ...num, width: 52 }} aria-label={tr("Depth of the last layer's top (m)")} />
        </span>
      </div>
      <div style={rowS}><span>{tr("Stations")}</span>
        <select value={st.every} onChange={(e) => set({ every: Number(e.target.value) })} style={smallSel} aria-label={tr("Every Nth station")}>
          {EVERY.map((k) => <option key={k} value={k}>{k === 1 ? tr("every station") : tr("every {k}th station (a first look)", { k })}</option>)}
        </select>
      </div>
      {busy ? (
        <div role="status" style={{ ...note, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{ flex: 1 }}>{busy.text}{Number.isFinite(busy.eta) ? " " + tr("About {m} min left.", { m: Math.max(1, Math.round(busy.eta / 60)) }) : ""}</span>
          <button type="button" onClick={() => ctl.current?.abort()} style={{ ...smallSel, cursor: "pointer" }}>{tr("Cancel")}</button>
        </div>
      ) : (
        <button type="button" disabled={!ready} onClick={run} title={ready ? undefined : tr("Type the gate times first")} style={{ ...pBtn, justifyContent: "center" }}>{tr("Invert the stations (Python engine)")}</button>
      )}
      {msg && <div role={msg.info ? "status" : "alert"} style={{ ...note, color: msg.info ? "var(--color-text-secondary)" : "var(--color-warn-text)", margin: "4px 0 8px" }}>{msg.text}</div>}
      {R && lineStations.length > 0 && (<>
        <Section stations={lineStations} result={R} bottom={bottomDraw} sel={sel} onPick={(j) => set({ sel: j })} />
        <div style={{ ...note, margin: "3px 0 6px" }}>{tr("Conductive red, resistive blue; below the dashed line (the depth of investigation) the model is the inversion's guess, not the data's. A 1D model is wrong under a 3D conductor (a plate, a pipe).")}</div>
        {fit && <>
          <div style={{ fontSize: "var(--font-size-sm)", marginBottom: 4 }}>{tr("Station {i}: misfit (chi) {c}, depth of investigation {d} m", { i: fit.station + 1, c: fmt(R.chi[sel]), d: fmt(R.doi[sel]) })}</div>
          <Fit times={fit.times} obs={fit.obs} pred={fit.pred} />
        </>}
        <button type="button" onClick={add3d} style={{ ...pBtn, justifyContent: "center", marginTop: 8 }}>{tr("Add the models to the 3D view")}</button>
      </>)}
      {R && !lineStations.length && <div style={note}>{tr("No model on this line: pick another line, or run with every station.")}</div>}
    </div>
  );
}
