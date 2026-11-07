// TASKS.csv #1986 — the Geophysics tab's FDEM 1D pane: ground loop-loop EM soundings (DUALEM, GEM-2, an Aarhus Workbench export)
// inverted one sounding at a time for conductivity against depth in the Python engine (app/geophys/em1d.py), a section along each
// line with the depth of investigation, each sounding's data against the model's, and the models in 3D as a point survey.
// An Aarhus Workbench *_inv.xyz is read as a result (no inversion); read beside its *_dat.xyz it is drawn against GeoStrix's own.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { Layers, Upload } from "./icons.js";
import { isWorkbenchXyz, parseWorkbenchXyz, fdemFromWorkbenchDat, fdemFromWorkbenchInv, fdemFromCsv, resampleAlongPath, alongLine, em1dRequest, modelPoints } from "../lib/fdem.js";
import { reprojectXY, crsName } from "../lib/reproject.js";
import { askAdoptCrs } from "../lib/adoptCrs.js";
import { SURVEY_METHODS, surveyKey } from "../lib/geophysSurveys.js";
import { runEm1dJob } from "../lib/desktop.js";
import { smallSel, pBtn } from "../lib/sidebarStyles.js";
import { percentile } from "../lib/arrayStats.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", fontSize: "var(--font-size-sm)", marginBottom: 6 };
const num = { ...smallSel, width: 64 };
// conductive red, resistive blue (the way conductivity sections are read)
const RAMP = ["#2166ac", "#67a9cf", "#d1e5f0", "#fddbc7", "#ef8a62", "#b2182b"];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function rampRgb(t) {
  const u = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(u)), f = u - i;
  const a = hex(RAMP[i]), b = hex(RAMP[i + 1]);
  return a.map((v, k) => Math.round(v + (b[k] - v) * f));
}
const fmt = (v) => (v == null || !Number.isFinite(v) ? "–" : Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : Number(v.toPrecision(3)).toLocaleString());
const TIES = [{ v: 0, label: "None: each sounding alone" }, { v: 0.3, label: "Weak" }, { v: 1, label: "Medium" }, { v: 3, label: "Strong" }];
let LAST = null; // the pane's state between visits (the tab unmounts it): a run is not lost by looking elsewhere

function Section({ dist, ks, result, range, selected, onPick }) {
  const ref = useRef(null);
  const W = 300, H = 170, pl = 30, pb = 18, pt = 4;
  const tops = useMemo(() => { const t = [0]; for (const d of result.thick) t.push(t[t.length - 1] + d); return t; }, [result.thick]);
  const maxD = tops[tops.length - 1] * 1.08;
  const d0 = dist[ks[0]] ?? 0, d1 = Math.max(d0 + 1, dist[ks[ks.length - 1]] ?? 1);
  const sx = (d) => pl + ((d - d0) / (d1 - d0)) * (W - pl - 2), sy = (z) => pt + (z / maxD) * (H - pt - pb);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
    const [lo, hi] = range;
    const src = result;
    for (let n = 0; n < ks.length; n++) {
      const j = ks[n], x0 = sx(dist[j]), x1 = n + 1 < ks.length ? sx(dist[ks[n + 1]]) : x0 + 1.5;
      const cond = src.condMs[j];
      if (!cond) continue;
      const doi = src.doi?.[j];
      for (let i = 0; i < cond.length; i++) {
        const v = cond[i];
        if (v == null || !(v > 0)) continue;
        const y0 = sy(tops[i]), y1 = i + 1 < tops.length ? sy(tops[i + 1]) : sy(maxD);
        const [r, gg, b] = rampRgb((Math.log10(v) - lo) / (hi - lo || 1));
        g.fillStyle = `rgb(${r},${gg},${b})`;
        g.fillRect(x0, y0, Math.max(1, x1 - x0 + 0.5), y1 - y0 + 0.5);
        if (Number.isFinite(doi) && tops[i] >= doi) { g.fillStyle = "rgba(255,255,255,0.55)"; g.fillRect(x0, y0, Math.max(1, x1 - x0 + 0.5), y1 - y0 + 0.5); }
      }
    }
    g.strokeStyle = "#111"; g.lineWidth = 1; g.beginPath();
    let on = false;
    for (const j of ks) { const v = src.doi?.[j]; if (!Number.isFinite(v)) { on = false; continue; } const x = sx(dist[j]), y = sy(v); if (on) g.lineTo(x, y); else g.moveTo(x, y); on = true; }
    g.stroke();
    g.strokeStyle = "#94a1b0"; g.strokeRect(pl, pt, W - pl - 2, H - pt - pb);
    g.fillStyle = "#55606e"; g.font = "8px sans-serif"; g.textAlign = "right";
    for (const z of [0, tops[tops.length - 1] / 2, tops[tops.length - 1]]) g.fillText(`${fmt(z)} m`, pl - 2, sy(z) + 3);
    g.textAlign = "left"; g.fillText(`0 m`, pl, H - 5); g.textAlign = "right"; g.fillText(`${fmt(d1 - d0)} m`, W - 2, H - 5);
    if (selected != null && dist[selected] != null) { g.strokeStyle = "#000"; g.setLineDash([3, 2]); g.beginPath(); g.moveTo(sx(dist[selected]), pt); g.lineTo(sx(dist[selected]), H - pb); g.stroke(); g.setLineDash([]); }
  }, [result, ks, dist, range, selected, tops]);
  const pick = (e) => {
    const r = e.currentTarget.getBoundingClientRect(), d = d0 + ((e.clientX - r.left) * (W / r.width) - pl) / (W - pl - 2) * (d1 - d0);
    let best = ks[0], bd = Infinity; for (const j of ks) { const q = Math.abs(dist[j] - d); if (q < bd) { bd = q; best = j; } }
    onPick(best);
  };
  return <canvas ref={ref} onClick={pick} style={{ width: "100%", height: "auto", aspectRatio: `${W} / ${H}`, display: "block", border: "1px solid var(--color-border)", borderRadius: 4, cursor: "crosshair" }} role="img" aria-label={tr("Conductivity against depth along the line; the black line is the depth of investigation, the paler ground below it is what the data hardly constrain")} />;
}

function SoundingView({ result, reference, j, k, survey, used }) {
  const w = 300, h = 170, pl = 34, pt = 6, pb = 22, mid = 150;
  const tops = [0]; for (const d of result.thick) tops.push(tops[tops.length - 1] + d);
  const maxD = tops[tops.length - 1] * 1.08;
  const prof = (c) => (c || []).map((v, i) => (v > 0 ? [Math.log10(v), tops[i], i + 1 < tops.length ? tops[i + 1] : maxD] : null)).filter(Boolean);
  const a = prof(result.condMs?.[j]), b = reference && reference !== result ? prof(reference.condMs?.[k]) : []; // the reference is indexed by sounding
  const all = [...a, ...b].map((p) => p[0]);
  if (!all.length) return <div style={note}>{tr("No model for this sounding (no usable readings).")}</div>;
  const lo = Math.floor(Math.min(...all) * 2) / 2, hi = Math.max(lo + 0.5, Math.ceil(Math.max(...all) * 2) / 2);
  const sx = (v) => pl + ((v - lo) / (hi - lo)) * (mid - pl - 6), sy = (z) => pt + (z / maxD) * (h - pt - pb);
  const steps = (p) => p.map(([v, z0, z1]) => `${sx(v)},${sy(z0)} ${sx(v)},${sy(z1)}`).join(" ");
  // data against the model's prediction, per coil in use
  const obs = survey?.data?.[k] || [], pred = result.pred?.[j] || [];
  const pairs = [];
  used.forEach((u, n) => {
    if (survey.kind === "eca") pairs.push({ label: `${u.c.geom} ${u.c.sep} m`, o: obs[u.i], p: pred[n] });
    else pairs.push({ label: `${Math.round(u.c.freq / 100) / 10} kHz Q`, o: obs[2 * u.i + 1], p: pred[2 * n + 1] });
  });
  const vals = pairs.flatMap((q) => [q.o, q.p]).filter((v) => v != null && Number.isFinite(v));
  const vmax = vals.length ? Math.max(...vals.map(Math.abs)) : 1;
  const bx = (v) => mid + 40 + (Math.max(0, v) / (vmax || 1)) * (w - mid - 48);
  const doi = result.doi?.[j];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={tr("Conductivity against depth at the sounding, and its readings against the model's")} style={{ display: "block", background: "#fff", border: "1px solid var(--color-border)", borderRadius: 4 }}>
      <line x1={pl} x2={pl} y1={pt} y2={h - pb} stroke="#94a1b0" />
      {[lo, (lo + hi) / 2, hi].map((v) => <text key={v} x={sx(v)} y={h - 10} fontSize="7" fill="#55606e" textAnchor="middle">{fmt(10 ** v)}</text>)}
      <text x={(pl + mid) / 2} y={h - 2} fontSize="7" fill="#55606e" textAnchor="middle">{tr("mS/m (log scale)")}</text>
      {[0, tops[tops.length - 1]].map((z) => <text key={z} x={pl - 2} y={sy(z) + 3} fontSize="7" fill="#55606e" textAnchor="end">{fmt(z)} m</text>)}
      {Number.isFinite(doi) && <g><line x1={pl} x2={mid - 6} y1={sy(doi)} y2={sy(doi)} stroke="#111" strokeDasharray="3 2" /><text x={mid - 6} y={sy(doi) - 2} fontSize="7" fill="#111" textAnchor="end">DOI</text></g>}
      {b.length > 0 && <polyline points={steps(b)} fill="none" stroke="#7a8794" strokeWidth="1.2" strokeDasharray="4 2" />}
      <polyline points={steps(a)} fill="none" stroke="#b2182b" strokeWidth="1.6" />
      {pairs.map((q, n) => {
        const y = pt + 8 + n * Math.min(18, (h - pt - pb - 8) / Math.max(1, pairs.length));
        return (
          <g key={n}>
            <text x={mid + 38} y={y + 3} fontSize="7" fill="#55606e" textAnchor="end">{q.label}</text>
            {q.o != null && Number.isFinite(q.o) && <circle cx={bx(q.o)} cy={y} r="2.6" fill="#222" />}
            {q.p != null && Number.isFinite(q.p) && <line x1={bx(q.p)} x2={bx(q.p)} y1={y - 4} y2={y + 4} stroke="#b2182b" strokeWidth="1.6" />}
          </g>
        );
      })}
      <text x={(mid + w) / 2 + 20} y={h - 2} fontSize="7" fill="#55606e" textAnchor="middle">{survey.kind === "eca" ? tr("mS/m: reading ● model |") : tr("ppm: reading ● model |")}</text>
    </svg>
  );
}

export default function FdemPane({ layers, setLayers, geophysSurveys, updateGeophysSurvey, project, setEpsg, projectIsEmpty, pendingFiles = null, onPendingDone = null, onClose }) {
  const [st, setSt] = useState(() => LAST || { survey: null, reference: null, raw: null, result: null, pick: null, settings: null });
  useEffect(() => { LAST = st; }, [st]);
  const { survey, result, pick } = st;
  const s = st.settings || {};
  const set = (patch) => setSt((o) => ({ ...o, settings: { ...o.settings, ...patch } }));
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [lineKey, setLineKey] = useState(null);
  const [sel, setSel] = useState(null);
  const [aboveDoi, setAboveDoi] = useState(true);
  const abort = useRef(null);
  const fileRef = useRef(null);

  const defaults = (sv) => {
    const maxSep = Math.max(...sv.coils.map((c) => Number(c.sep) || 0));
    const bottom = +(4 * maxSep).toFixed(1); // about what a loop-loop pair sees: a few coil separations down
    return { height: sv.height ?? "", errRel: 10, errAbs: sv.kind === "eca" ? 0.1 : 75, n: 20, bottom, first: +(bottom / 75).toFixed(2), lateral: 0, every: 1, spacing: 1 };
  };
  // positions into the project CRS: a Workbench file's own EPSG, a CSV's latitude / longitude, else its X / Y taken as the project's
  const place = (xs, ys, fromEpsg, target) => (fromEpsg && target && Number(fromEpsg) !== Number(target) ? xs.map((x, k) => { const q = reprojectXY(x, ys[k], fromEpsg, target); return q ? [q.x, q.y] : [NaN, NaN]; }) : xs.map((x, k) => [x, ys[k]]));

  const openFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setBusy(true); setMsg({ info: true, text: tr("Reading {n} file(s)…", { n: files.length }) });
    await new Promise((r) => setTimeout(r, 0));
    try {
      let sv = null, inv = null, raw = null, notes = [];
      for (const f of files) {
        const text = await f.text();
        if (isWorkbenchXyz(text)) {
          const w = parseWorkbenchXyz(text);
          if (w.cols.includes("RHO_1")) inv = fdemFromWorkbenchInv(w, f.name); else sv = fdemFromWorkbenchDat(w, f.name);
        } else {
          const c = fdemFromCsv(text, f.name);
          raw = c; sv = { ...c, stations: null, data: null };
        }
      }
      let target = project?.epsg;
      const declared = sv?.epsg || inv?.epsg || (raw?.readings.lat ? 4326 : null);
      if (declared) {
        const r = raw?.readings, at = declared === 4326 && r ? { lon: r.lon.find(Number.isFinite), lat: r.lat.find(Number.isFinite) } : null;
        const adopted = askAdoptCrs({ isEmpty: projectIsEmpty, currentEpsg: target, declaredEpsg: declared, fileName: files[0].name, at });
        if (adopted) { setEpsg(adopted); target = adopted; }
      }
      const placeStations = (o) => { if (!o) return o; const p = place(o.stations.x, o.stations.y, o.epsg, target); return { ...o, stations: { ...o.stations, x: p.map((q) => q[0]), y: p.map((q) => q[1]) } }; };
      sv = sv && !raw ? placeStations(sv) : sv;
      inv = placeStations(inv);
      if (raw) {
        const r = raw.readings;
        raw.xy = r.lat && r.lon ? place(r.lon, r.lat, 4326, target) : r.x ? r.x.map((x, k) => [x, r.y[k]]) : null;
        if (!raw.xy) throw new Error(tr("{name} has no positions (latitude / longitude or X / Y columns).", { name: raw.name }));
        notes.push(r.lat ? tr("Positions from the file's latitude and longitude (WGS 84), in {crs}.", { crs: `${crsName(target) || "?"} (EPSG:${target})` }) : tr("Positions from the file's X and Y, taken as the project's {crs}: the file does not say its coordinate system.", { crs: `EPSG:${target}` }));
        if (r.zFrom) notes.push(tr("Ground elevation from the column {col}.", { col: r.zFrom }) + (/alt/i.test(r.zFrom) ? " " + tr("A GPS height: check it against the terrain before trusting depths in 3D (a GPS height above the ellipsoid can differ from sea level by tens of metres; the USGS Indiana DUALEM files read 34 m under their DEM).") : ""));
        else notes.push(tr("The file has no elevation column: the models can be drawn here, but not placed in 3D."));
      }
      const base = sv || inv;
      const settings = defaults(sv || { coils: [{ sep: 4 }], kind: "eca" });
      const next = { survey: sv, reference: inv?.result || null, refStations: inv?.stations || null, raw, result: !sv && inv ? inv.result : null, pick: null, settings };
      if (raw) Object.assign(next, resampled(raw, next.survey, settings.spacing));
      if (sv && inv && next.survey.data.length !== inv.result.condMs.length) { next.reference = null; notes.push(tr("The models' file holds {a} soundings and the data's {b}: not drawn together.", { a: inv.result.condMs.length, b: next.survey.data.length })); }
      if (!sv && inv) next.survey = { name: inv.name, kind: "eca", coils: [], stations: inv.stations, data: [], source: inv.source };
      setSt(next); setLineKey(null); setSel(null);
      const s0 = next.survey;
      setMsg({ info: true, text: [
        sv ? tr("{name}: {src}, {n} soundings, {c} coil pair(s) ({kind}).", { name: base.name, src: sv.source, n: (s0.data?.length || 0).toLocaleString(), c: sv.coils.length, kind: sv.kind === "eca" ? tr("apparent conductivity, mS/m") : tr("in-phase and quadrature, ppm") }) : "",
        raw ? tr("{r} readings averaged into {n} soundings, one per {m} m of path.", { r: raw.readings.n.toLocaleString(), n: s0.data.length.toLocaleString(), m: settings.spacing }) : "",
        inv ? tr("{name}: Aarhus Workbench models, {n} soundings of {l} layers.", { name: inv.name, n: inv.result.condMs.length.toLocaleString(), l: inv.result.thick.length + 1 }) : "",
        sv?.instrument === "GEM-2" || (sv && sv.kind === "ppm") ? tr("Quadrature only by default: the in-phase carries instrument offsets and the response to magnetic minerals. Tick it per frequency if the data were levelled.") : "",
        ...notes,
      ].filter(Boolean).join(" ") });
    } catch (err) {
      setMsg({ info: false, text: tr("Could not read the file: {message}", { message: err.message }) });
    } finally { setBusy(false); }
  };
  function resampled(raw, sv, spacing) {
    const r = raw.readings, rs = resampleAlongPath(raw.xy, r.z, r.line, raw.data, { spacing: Math.max(0.1, Number(spacing) || 1) });
    return { survey: { ...sv, coils: sv.coils, kind: raw.kind, stations: rs.stations, data: rs.data, source: raw.source, instrument: raw.instrument, name: raw.name } };
  }
  const seen = useRef(null);
  useEffect(() => {
    if (!pendingFiles?.length || seen.current === pendingFiles) return;
    seen.current = pendingFiles;
    openFiles(pendingFiles).finally(() => onPendingDone?.());
  }, [pendingFiles]); // openFiles reads the current props; it runs once per drop

  const stations = survey?.stations;
  const dist = useMemo(() => (stations ? alongLine(stations) : []), [stations]);
  const resultStations = st.refStations && !survey?.data?.length ? st.refStations : stations;
  // the soundings the result holds, as indices into the survey
  const idx = useMemo(() => (result ? (pick || result.condMs.map((_, j) => j)) : []), [result, pick]);
  const lines = useMemo(() => [...new Set(idx.map((k) => resultStations?.line[k]))], [idx, resultStations]);
  const line = lines.includes(lineKey) ? lineKey : lines[0];
  const ksLine = useMemo(() => idx.map((k, j) => ({ k, j })).filter((o) => resultStations?.line[o.k] === line), [idx, line, resultStations]);
  const range = useMemo(() => { if (!result) return [0, 1]; const v = result.condMs.flat().filter((x) => x > 0).map(Math.log10); return [percentile(v, 0.02), percentile(v, 0.98)]; }, [result]);
  const selJ = sel != null && ksLine.some((o) => o.j === sel) ? sel : ksLine[0]?.j;
  const used = (survey?.coils || []).map((c, i) => ({ c, i })).filter((u) => u.c.use);
  const sectionResult = useMemo(() => (result ? { ...result, condMs: reindex(result.condMs, idx, resultStations), doi: reindex(result.doi, idx, resultStations) } : null), [result, idx, resultStations]);

  const run = async () => {
    if (!(Number(s.height) >= 0) || s.height === "") { setMsg({ info: false, text: tr("Enter the height the instrument was carried at, above the ground (m): the readings depend on it.") }); return; }
    if (!used.length) { setMsg({ info: false, text: tr("Tick at least one coil pair.") }); return; }
    const { pick: pk, request } = em1dRequest(survey, { height: s.height, errRel: Number(s.errRel) / 100, errAbs: Number(s.errAbs), layers: { n: Number(s.n), first: Number(s.first), bottom: Number(s.bottom) }, lateral: Number(s.lateral), every: Number(s.every) });
    const dropped = survey.kind === "eca" ? request.data.flat().filter((v) => v != null && v <= 0).length : 0;
    setBusy(true); setProgress({ message: tr("Starting the Python engine…") });
    abort.current = new AbortController();
    const t0 = Date.now();
    const res = await runEm1dJob(request, { signal: abort.current.signal, onProgress: setProgress });
    setBusy(false); setProgress(null);
    if (!res.ok) { setMsg({ info: !!res.cancelled, text: res.cancelled ? tr("Cancelled.") : tr("The inversion failed: {message}", { message: res.error }) }); return; }
    const r = { ...res.data, from: "geostrix" };
    setSt((o) => ({ ...o, result: r, pick: pk }));
    const chi = r.chi.filter((v) => v != null);
    setMsg({ info: true, text: [
      tr("Inverted {n} soundings in {s} s.", { n: chi.length.toLocaleString(), s: Math.round((Date.now() - t0) / 1000) }),
      chi.length ? tr("Misfit (error-weighted RMS; 1 = fitted to the errors): median {m}; {a}% of the soundings at 1 or less, {b}% at 2 or less.", { m: fmt(percentile(chi, 0.5)), a: Math.round((100 * chi.filter((v) => v <= 1).length) / chi.length), b: Math.round((100 * chi.filter((v) => v <= 2).length) / chi.length) }) : "",
      dropped ? tr("{n} reading(s) at or below 0 mS/m were left out: apparent conductivity is fitted in log terms.", { n: dropped.toLocaleString() }) : "",
    ].filter(Boolean).join(" ") });
  };

  const addTo3d = () => {
    const name = `${(survey?.name || "FDEM").replace(/\.[^.]+$/, "")} (1D models)`;
    const { rows, noZ, every } = modelPoints(resultStations, result, { pick: result.from === "workbench" ? null : pick, src: name, aboveDoi });
    if (!rows.length) { setMsg({ info: false, text: tr("No points to draw: the soundings have no ground elevation.") }); return; }
    setLayers((l) => ({ ...l, geophys_pts: [...(l.geophys_pts || []).filter((r) => surveyKey(r) !== name), ...rows] }));
    updateGeophysSurvey(name, { method: "em1d_cond", units: SURVEY_METHODS.em1d_cond.units });
    setMsg({ info: true, text: [tr("{n} points in 3D as the point survey \"{name}\", coloured by log₁₀ conductivity (mS/m), at each layer's middle below the ground.", { n: rows.length.toLocaleString(), name }), aboveDoi ? tr("Only above each sounding's depth of investigation.") : "", every > 1 ? tr("One sounding in {k} drawn, to keep the points near {max} (all of them stay in the section here).", { k: every, max: (100000).toLocaleString() }) : "", noZ ? tr("{n} sounding(s) without a ground elevation were left out.", { n: noZ }) : ""].filter(Boolean).join(" ") });
  };
  const inThreeD = (layers?.geophys_pts || []).some((r) => /\(1D models\)$/.test(surveyKey(r)));

  return (
    <>
      <TaskPaneHeader title={tr("FDEM 1D (DUALEM, GEM-2)")} helpId="fdem-1d" icon={Layers} tone="model" onClose={onClose} />
      <div style={{ ...note, marginBottom: 8 }}>{tr("Ground loop-loop EM soundings (DUALEM, GEM-2, an Aarhus Workbench export) inverted for conductivity against depth, one 1D model per sounding. A 1D model assumes flat-lying layers: under a dyke, a pipe, a fence or any 3D conductor it is wrong. Use it for cover, regolith, clay and water-table depth, not to model a conductor.")}</div>
      <button type="button" style={pBtn} disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={14} />{tr("Open soundings (CSV or Workbench .xyz)…")}</button>
      <input ref={fileRef} type="file" accept=".csv,.xyz,.txt" multiple style={{ display: "none" }} onChange={(e) => { openFiles(e.target.files); e.target.value = ""; }} />
      {msg && <div role="status" style={{ marginBottom: 10, padding: "8px 10px", background: msg.info ? "var(--color-bg-subtle)" : "var(--color-danger-bg)", border: `1px solid ${msg.info ? "var(--color-border)" : "var(--color-danger-border)"}`, borderRadius: 6, fontSize: "var(--font-size-sm)", lineHeight: 1.45 }}>{msg.text}</div>}
      {survey?.data?.length > 0 && (
        <div aria-label={tr("FDEM inversion settings")}>
          <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, margin: "6px 0" }}>{tr("Coil pairs")}</div>
          {survey.coils.map((c, i) => (
            <label key={i} style={{ ...row, justifyContent: "flex-start" }}>
              <input type="checkbox" checked={!!c.use} onChange={(e) => setSt((o) => ({ ...o, survey: { ...o.survey, coils: o.survey.coils.map((q, k) => (k === i ? { ...q, use: e.target.checked } : q)) } }))} />
              <span style={{ flex: 1 }}>{tr("{geom} {sep} m, {f} kHz", { geom: c.geom, sep: c.sep, f: +(c.freq / 1000).toFixed(2) })}</span>
              {survey.kind === "ppm" && <span title={tr("Use the in-phase too (only if the data were levelled)")} style={{ display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={!!c.inphase} onChange={(e) => setSt((o) => ({ ...o, survey: { ...o.survey, coils: o.survey.coils.map((q, k) => (k === i ? { ...q, inphase: e.target.checked } : q)) } }))} />{tr("in-phase")}</span>}
            </label>
          ))}
          <label style={row}>{tr("Sensor height above the ground (m)")}<input style={num} type="number" min="0" step="0.05" value={s.height} placeholder={tr("required")} aria-label={tr("Sensor height (m)")} onChange={(e) => set({ height: e.target.value })} /></label>
          {st.raw && <label style={row}>{tr("One sounding per (m of path)")}<input style={num} type="number" min="0.1" step="0.5" value={s.spacing} aria-label={tr("Sounding spacing (m)")} onChange={(e) => { const v = e.target.value; setSt((o) => ({ ...o, ...resampled(o.raw, o.survey, v), settings: { ...o.settings, spacing: v }, result: null, pick: null })); }} /></label>}
          <label style={row}>{tr("Errors: % of the reading")}<input style={num} type="number" min="0" max="100" step="1" value={s.errRel} aria-label={tr("Relative error (%)")} onChange={(e) => set({ errRel: e.target.value })} /></label>
          <label style={row}>{survey.kind === "eca" ? tr("plus (mS/m)") : tr("plus (ppm)")}<input style={num} type="number" min="0" step="any" value={s.errAbs} aria-label={tr("Absolute error")} onChange={(e) => set({ errAbs: e.target.value })} /></label>
          <label style={row}>{tr("Layers / first thickness (m) / to depth (m)")}<span style={{ display: "flex", gap: 3 }}><input style={{ ...num, width: 40 }} type="number" min="2" max="40" value={s.n} aria-label={tr("Number of layers")} onChange={(e) => set({ n: e.target.value })} /><input style={{ ...num, width: 46 }} type="number" min="0.01" step="0.05" value={s.first} aria-label={tr("First layer thickness (m)")} onChange={(e) => set({ first: e.target.value })} /><input style={{ ...num, width: 46 }} type="number" min="0.5" step="0.5" value={s.bottom} aria-label={tr("Depth of the last layer (m)")} onChange={(e) => set({ bottom: e.target.value })} /></span></label>
          <label style={row}>{tr("Tie to the neighbouring soundings")}<select style={smallSel} value={s.lateral} aria-label={tr("Tie to the neighbouring soundings")} onChange={(e) => set({ lateral: Number(e.target.value) })}>{TIES.map((t) => <option key={t.v} value={t.v}>{tr(t.label)}</option>)}</select></label>
          <label style={row}>{tr("Invert every Nth sounding")}<input style={num} type="number" min="1" step="1" value={s.every} aria-label={tr("Invert every Nth sounding")} onChange={(e) => set({ every: Math.max(1, Math.round(Number(e.target.value) || 1)) })} /></label>
          <div style={{ ...note, marginBottom: 6 }}>{tr("{n} soundings to invert.", { n: Math.ceil(survey.data.length / Math.max(1, s.every || 1)).toLocaleString() })}</div>
          {!busy ? <button type="button" style={pBtn} onClick={run}><Layers size={14} />{tr("Invert")}</button>
            : <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}><div style={{ ...note, flex: 1 }}>{progress?.message || tr("Working…")}{progress?.etaS != null ? " " + tr("About {s} s left.", { s: progress.etaS }) : ""}</div><button type="button" style={{ ...pBtn, width: "auto", marginBottom: 0 }} onClick={() => abort.current?.abort()}>{tr("Cancel")}</button></div>}
        </div>
      )}
      {result && ksLine.length > 0 && (
        <>
          {lines.length > 1 && <label style={row}>{tr("Line")}<select style={smallSel} value={line} aria-label={tr("FDEM line")} onChange={(e) => { setLineKey(lines.find((l) => String(l) === e.target.value)); setSel(null); }}>{lines.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>}
          <div style={{ ...note, marginBottom: 4 }}>{result.from === "workbench" ? tr("Aarhus Workbench's models.") : tr("GeoStrix's models.")} {tr("Log colour scale {lo} to {hi} mS/m, conductive red.", { lo: fmt(10 ** range[0]), hi: fmt(10 ** range[1]) })}</div>
          <Section dist={dist} ks={ksLine.map((o) => o.k)} result={sectionResult} range={range} selected={idx[selJ]} onPick={(k) => setSel(idx.indexOf(k))} />
          <div style={{ ...note, margin: "4px 0 8px" }}>{tr("Depth down, distance along the line across. Black: the depth of investigation; paler below it. Click for a sounding.")}</div>
          {selJ != null && <SoundingView result={result} reference={st.reference} j={selJ} k={idx[selJ]} survey={survey} used={used} />}
          {selJ != null && <div style={{ ...note, marginTop: 4 }}>{tr("Sounding {k}: misfit {chi}, depth of investigation {doi} m, ground {z} m.", { k: idx[selJ] + 1, chi: fmt(result.chi?.[selJ]), doi: fmt(result.doi?.[selJ]), z: fmt(resultStations?.z?.[idx[selJ]]) })}{st.reference && result.from !== "workbench" ? " " + tr("Grey dashes: Aarhus Workbench's model.") : ""}</div>}
          <label style={{ ...row, justifyContent: "flex-start", marginTop: 8 }}><input type="checkbox" checked={aboveDoi} onChange={(e) => setAboveDoi(e.target.checked)} />{tr("Only above the depth of investigation")}</label>
          <button type="button" style={pBtn} onClick={addTo3d}>{inThreeD ? tr("Replace the models in 3D") : tr("Add the models to 3D")}</button>
          <div style={note}>{tr("The depth of investigation is the depth above which 80% of the data's sensitivity lies: an approximation, not Aarhus Workbench's calibrated DOI.")}</div>
        </>
      )}
    </>
  );
}

// a result's rows (one per inverted sounding) laid out by survey sounding: the section reads by survey index
function reindex(a, idx, stations) {
  if (!a) return null;
  const out = new Array(stations?.x?.length || 0).fill(null);
  idx.forEach((k, j) => { out[k] = a[j]; });
  return out;
}
