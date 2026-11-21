// TASKS.csv #1986 step 1 — the Geophysics tab's TEM line data pane: a multi-channel time-domain EM file (SkyTEM / Aarhus Workbench *_dat.xyz,
// a Geosoft .xyz with array channels, a CSV with a column per gate) read as decays; the channels stacked along a line, the decay at a
// station with its late-time decay constant (tau), and tau at every station gridded as a map. No forward model or inversion yet (step 2).
import React, { useMemo, useRef, useState } from "react";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { Radio, Upload } from "./icons.js";
import { readTemText, channelMatrix, linesOf, decayTau, tauAll, numbersIn, toMs, joinMatrices, noiseGroupFor, maskNoisy, stdKindGuess } from "../lib/temLines.js";
import { SURVEY_METHODS, surveyKey } from "../lib/geophysSurveys.js";
import { surveyGridDefaults } from "../lib/surveyGridDefaults.js";
import { idwGridToRasterInput, snappedGridExtent, uniqueName } from "../lib/idw.js";
import { reprojectXY, crsName } from "../lib/reproject.js";
import { askAdoptCrs } from "../lib/adoptCrs.js";
import { smallSel, pBtn } from "../lib/sidebarStyles.js";
import { arrMin, arrMax } from "../lib/arrayStats.js"; // no Math.min / max spread (#371)
import TemInvertPanel from "./TemInvertPanel.jsx"; // TASKS.csv #3440 step 3 — the 1D inversion
import { t as tr } from "../lib/i18n.js";
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926 G4 — '0,05' and '0.05' both read

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const rowS = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", fontSize: "var(--font-size-sm)", marginBottom: 6 };
// early gates purple, late gates yellow (viridis anchors)
const VIR = ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"];
const gateColour = (k, m) => VIR[Math.round((m > 1 ? k / (m - 1) : 0) * (VIR.length - 1))];
const fmt = (v) => (v == null || !Number.isFinite(v) ? "–" : Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : Number(v.toPrecision(3)).toLocaleString());
let LAST = null; // the pane's state between visits (the tab unmounts it)

// the channels stacked along one line: log10 of each gate's positive readings against the distance along the line
function Profiles({ line, mat, sel, onPick }) {
  const W = 300, H = 190, pl = 34, pb = 18, pt = 4, m = mat.m;
  const { lo, hi } = useMemo(() => {
    let a = Infinity, b = -Infinity;
    for (const i of line.idx) for (let k = 0; k < m; k++) { const v = mat.v[i * m + k]; if (v > 0) { const l = Math.log10(v); if (l < a) a = l; if (l > b) b = l; } }
    return Number.isFinite(a) ? { lo: Math.floor(a), hi: Math.ceil(b === a ? a + 1 : b) } : { lo: 0, hi: 1 };
  }, [line, mat, m]);
  const dMax = Math.max(1, line.d[line.d.length - 1]);
  const sx = (d) => pl + (d / dMax) * (W - pl - 4), sy = (l) => pt + ((hi - l) / (hi - lo)) * (H - pt - pb);
  const paths = [];
  for (let k = 0; k < m; k++) {
    let p = "", pen = false;
    line.idx.forEach((i, j) => { const v = mat.v[i * m + k]; if (v > 0) { p += `${pen ? "L" : "M"}${sx(line.d[j]).toFixed(1)},${sy(Math.log10(v)).toFixed(1)}`; pen = true; } else pen = false; });
    if (p) paths.push(<path key={k} d={p} fill="none" stroke={gateColour(k, m)} strokeWidth={1} />);
  }
  const ref = useRef(null);
  const pick = (e) => {
    const r = ref.current.getBoundingClientRect(), d = ((e.clientX - r.left) * (W / r.width) - pl) / (W - pl - 4) * dMax;
    let best = 0; for (let j = 1; j < line.d.length; j++) if (Math.abs(line.d[j] - d) < Math.abs(line.d[best] - d)) best = j;
    onPick(line.idx[best]);
  };
  const j = sel != null ? line.idx.indexOf(sel) : -1;
  const ticks = []; for (let l = lo; l <= hi; l++) ticks.push(l);
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", cursor: "crosshair", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4 }} onClick={pick} role="img" aria-label={tr("The TEM channels stacked along the line; click a station for its decay")}>
      {ticks.map((l) => <g key={l}><line x1={pl} x2={W - 4} y1={sy(l)} y2={sy(l)} stroke="var(--color-border)" strokeWidth={0.5} /><text x={pl - 3} y={sy(l) + 3} fontSize={8} textAnchor="end" fill="var(--color-text-muted)">{`1e${l}`}</text></g>)}
      {paths}
      {j >= 0 && <line x1={sx(line.d[j])} x2={sx(line.d[j])} y1={pt} y2={H - pb} stroke="var(--color-text)" strokeDasharray="3 2" strokeWidth={0.8} />}
      <text x={W - 4} y={H - 4} fontSize={8} textAnchor="end" fill="var(--color-text-muted)">{tr("{d} m along the line", { d: Math.round(dMax).toLocaleString() })}</text>
    </svg>
  );
}

// one station's decay, log-log, with the fitted exponential over the gates it used
function Decay({ times, vals, fit }) {
  const W = 300, H = 150, pl = 34, pb = 18, pt = 4;
  const ok = times.map((t, k) => (t > 0 && vals[k] > 0 ? k : -1)).filter((k) => k >= 0);
  if (ok.length < 2) return <div style={note}>{tr("This station has fewer than two positive readings with a gate time.")}</div>;
  const lt = ok.map((k) => Math.log10(times[k])), lv = ok.map((k) => Math.log10(vals[k]));
  const x0 = Math.floor(arrMin(lt)), x1 = Math.ceil(arrMax(lt)), y0 = Math.floor(arrMin(lv)), y1 = Math.ceil(arrMax(lv)) || y0 + 1;
  const sx = (l) => pl + ((l - x0) / Math.max(1e-9, x1 - x0)) * (W - pl - 4), sy = (l) => pt + ((y1 - l) / Math.max(1e-9, y1 - y0)) * (H - pt - pb);
  let fitPath = "";
  if (fit) for (let s = 0; s <= 24; s++) { const t = times[fit.from] + (s / 24) * (times[fit.to] - times[fit.from]), v = Math.exp(fit.a - t / fit.tau); if (v > 0) fitPath += `${s ? "L" : "M"}${sx(Math.log10(t)).toFixed(1)},${sy(Math.log10(v)).toFixed(1)}`; }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4 }} role="img" aria-label={tr("The decay at the station: each gate's reading against its time, with the fitted late-time exponential")}>
      {Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).map((l) => <text key={`y${l}`} x={pl - 3} y={sy(l) + 3} fontSize={8} textAnchor="end" fill="var(--color-text-muted)">{`1e${l}`}</text>)}
      {Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i).map((l) => <text key={`x${l}`} x={sx(l)} y={H - 6} fontSize={8} textAnchor="middle" fill="var(--color-text-muted)">{`${10 ** l} ms`}</text>)}
      {ok.map((k) => <circle key={k} cx={sx(Math.log10(times[k]))} cy={sy(Math.log10(vals[k]))} r={2.4} fill={gateColour(k, times.length)} />)}
      {fitPath && <path d={fitPath} fill="none" stroke="#b2182b" strokeWidth={1.4} />}
    </svg>
  );
}

export default function TemPane({ setLayers, updateGeophysSurvey, addRaster, rasters, project, setEpsg, projectIsEmpty, onClose }) {
  const [st, setSt] = useState(() => LAST);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const save = (next) => { LAST = next; setSt(next); };
  const data = st?.data;
  // TASKS.csv #3441 — a two-moment file whose header states both moments' gate times can be read as ONE decay (the gates of both, by time)
  const joinable = useMemo(() => {
    if (!data) return null;
    const na = data.groups.filter((g) => (g.role ? g.role === "data" : !g.aux)); // #3440: the decays only, not their gate times or a model
    if (na.length !== 2) return null;
    const ta = data.gateTimes(na[0]), tb = data.gateTimes(na[1]);
    return ta && tb ? { ga: na[0], gb: na[1], ta, tb } : null;
  }, [data]);
  const isJoin = st?.g === "join" && !!joinable;
  const joinOf = (ga, gb, ta, tb) => joinMatrices({ mat: channelMatrix(data, ga), times: ta, cols: ga.cols }, { mat: channelMatrix(data, gb), times: tb, cols: gb.cols });
  const joined = useMemo(() => (isJoin ? joinOf(joinable.ga, joinable.gb, joinable.ta, joinable.tb) : null), [isJoin, joinable, data]);
  const group = isJoin ? { prefix: `${joinable.ga.prefix} + ${joinable.gb.prefix}`, cols: joined.cols, aux: false } : data?.groups[st.g] || null;
  const mat = useMemo(() => (joined ? joined.mat : data && group ? channelMatrix(data, group) : null), [joined, data, group]);
  // the uncertainty columns of this group (of both moments, joined in the same order), for leaving the readings in the noise out of the fit
  const noiseMat = useMemo(() => {
    if (!data || !group) return null;
    if (isJoin) { const na = noiseGroupFor(data.groups, joinable.ga), nb = noiseGroupFor(data.groups, joinable.gb); return na && nb ? joinOf(na, nb, joinable.ta, joinable.tb).mat : null; }
    const n = noiseGroupFor(data.groups, group);
    return n ? channelMatrix(data, n) : null;
  }, [data, group, isJoin, joinable]);
  const stdGuess = useMemo(() => (noiseMat ? stdKindGuess(noiseMat) : "relative"), [noiseMat]); // #3440 — the USGS / Aarhus export's STD is in the data's unit
  const noiseOpts = useMemo(() => {
    const floor = Number(st?.floor) > 0 ? Number(st.floor) : null, maxUnc = st?.useStd && noiseMat ? (Number(st.maxUnc) > 0 ? Number(st.maxUnc) / 100 : 0.33) : null;
    return floor != null || maxUnc != null ? { floor, maxUnc, stdKind: st?.stdKind || stdGuess } : null;
  }, [st?.floor, st?.useStd, st?.maxUnc, st?.stdKind, noiseMat, stdGuess]);
  const prepare = (i, row) => maskNoisy(row, noiseMat ? noiseMat.v.subarray(i * noiseMat.m, i * noiseMat.m + noiseMat.m) : null, noiseOpts).values;
  const lines = useMemo(() => (data ? linesOf(data) : []), [data]);
  const times = useMemo(() => { if (joined) return joined.times; const t = toMs(numbersIn(st?.timesText)); return group && t.length === group.cols.length ? t : null; }, [st?.timesText, group, joined]);
  const line = lines.find((l) => l.key === st?.line) || lines[0];
  const sel = st?.sel ?? line?.idx[0] ?? null;
  const vals = useMemo(() => (mat && sel != null ? Array.from(mat.v.subarray(sel * mat.m, sel * mat.m + mat.m)) : null), [mat, sel]);
  const masked = useMemo(() => (noiseOpts && vals ? maskNoisy(vals, noiseMat ? noiseMat.v.subarray(sel * noiseMat.m, sel * noiseMat.m + noiseMat.m) : null, noiseOpts) : null), [noiseOpts, vals, noiseMat, sel]);
  const fit = useMemo(() => (times && vals ? decayTau(times, masked ? masked.values : vals) : null), [times, vals, masked]);

  const open = async (file) => {
    if (!file) return;
    setBusy(true); setMsg({ info: true, text: tr("Reading {name}…", { name: file.name }) });
    await new Promise((r) => setTimeout(r, 0));
    try {
      const d = readTemText(await file.text(), file.name);
      // positions into the project CRS: a Workbench file's own EPSG; a Geosoft .xyz or CSV's X / Y are taken as the project's
      let target = project?.epsg;
      if (d.epsg) { const adopted = askAdoptCrs({ isEmpty: projectIsEmpty, currentEpsg: target, declaredEpsg: d.epsg, fileName: file.name }); if (adopted) { setEpsg(adopted); target = adopted; } }
      if (d.epsg && target && Number(d.epsg) !== Number(target)) {
        for (let i = 0; i < d.n; i++) { const q = reprojectXY(d.x[i], d.y[i], d.epsg, target); d.x[i] = q ? q.x : NaN; d.y[i] = q ? q.y : NaN; }
      }
      const g = 0, t = d.gateTimes(d.groups[g]);
      const L = linesOf(d);
      save({ data: d, g, timesText: t ? t.join(" ") : "", line: L[0]?.key, sel: null, posNote: d.epsg ? (target && Number(d.epsg) !== Number(target) ? tr("Positions reprojected from EPSG:{a} to the project's {crs}.", { a: d.epsg, crs: `${crsName(target) || "?"} (EPSG:${target})` }) : "") : tr("Positions from the file's {x} / {y}, taken as the project's coordinates: the file does not say its coordinate system.", { x: d.xCol, y: d.yCol }) });
      setMsg({ info: true, text: [
        tr("{name} ({src}): {n} stations on {l} line(s); channels {ch} ({m} gates).", { name: file.name, src: d.source, n: d.n.toLocaleString(), l: L.length, ch: d.groups[g].prefix, m: d.groups[g].cols.length }),
        t ? tr("Gate times read from the file: {a} to {b} ms.", { a: fmt(t[0]), b: fmt(t[t.length - 1]) }) : tr("The file does not state its gate times: type them below (ms, one per gate) to fit the decay constant."),
      ].join(" ") });
    } catch (err) { setMsg({ text: tr("Could not read the file: {v}", { v: err?.message || String(err) }) }); }
    setBusy(false);
  };

  // tau at every station: a point survey '<file> · tau' (TEM: decay constant, ms) and its grid, inverse distance with the line spacing's blanking
  const mapTau = () => {
    if (!times || !mat) return;
    const { tau, fitted } = tauAll(mat, times, noiseOpts ? { prepare } : undefined); // #3441
    const name = `${data.name} · tau`;
    const pts = [];
    for (let i = 0; i < data.n; i++) if (Number.isFinite(tau[i]) && Number.isFinite(data.x[i]) && Number.isFinite(data.y[i])) pts.push({ x: data.x[i], y: data.y[i], z: data.z && Number.isFinite(data.z[i]) ? data.z[i] : null, value: +tau[i].toPrecision(5), line: data.line[i], _src: name });
    if (pts.length < 3) { setMsg({ text: tr("A decay constant could be fitted at {n} station(s) only: too few to map.", { n: fitted }) }); return; }
    setLayers((l) => ({ ...l, geophys_pts: [...(l.geophys_pts || []).filter((r) => surveyKey(r) !== name), ...pts] }));
    updateGeophysSurvey(name, { method: "em_tau", units: SURVEY_METHODS.em_tau.units });
    const gd = surveyGridDefaults(pts);
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (const p of pts) { if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; }
    const cell = gd?.cell || 25, blank = gd ? gd.distance : Infinity;
    const box = snappedGridExtent({ xmin, ymin, xmax, ymax }, cell);
    const gName = uniqueName(`${data.name} tau (ms) IDW ${cell} m, blanked > ${Math.round(blank)} m`, (rasters || []).map((r) => r.name));
    const r = idwGridToRasterInput(pts, { ...box, cellSize: cell, power: 2, stretch: "p2-98", maxDistance: blank, name: gName });
    addRaster({ ...r, provenance: { tool: "TEM decay constant (late-time exponential fit) gridded by IDW", survey: data.name, channels: group.prefix, gatesMs: times, points: pts.length, cellM: cell, power: 2, blankingM: Math.round(blank), blankingBasis: gd ? `the median ${gd.basis} (${gd.spacing.toFixed(1)} m)` : "none" }, surveyMethod: "em_tau", units: "ms" });
    setMsg({ info: true, text: tr("Fitted the decay constant at {f} of {n} stations, added as the point survey \"{name}\", and gridded it as \"{grid}\" (Rasters).", { f: fitted.toLocaleString(), n: data.n.toLocaleString(), name, grid: gName }) });
  };
  // one gate's readings as a point survey (TEM: dB/dt, one channel)
  const addGate = (k) => {
    const name = `${data.name} · ${group.cols[k]}`;
    const pts = [];
    for (let i = 0; i < data.n; i++) { const v = mat.v[i * mat.m + k]; if (Number.isFinite(v) && Number.isFinite(data.x[i]) && Number.isFinite(data.y[i])) pts.push({ x: data.x[i], y: data.y[i], z: data.z && Number.isFinite(data.z[i]) ? data.z[i] : null, value: v, line: data.line[i], _src: name }); }
    setLayers((l) => ({ ...l, geophys_pts: [...(l.geophys_pts || []).filter((r) => surveyKey(r) !== name), ...pts] }));
    updateGeophysSurvey(name, { method: "em_dbdt", units: SURVEY_METHODS.em_dbdt.units });
    setMsg({ info: true, text: tr("Added gate {k} ({col}) as the point survey \"{name}\" ({n} stations): Point survey can grid it.", { k: k + 1, col: group.cols[k], name, n: pts.length.toLocaleString() }) });
  };

  return (
    <div>
      <TaskPaneHeader title={tr("TEM line data (multi-channel)")} helpId="tem-lines" icon={Radio} tone="data" onClose={onClose} />
      <div style={{ ...note, marginBottom: 8 }}>{tr("Time-domain EM along lines (SkyTEM or Aarhus Workbench .xyz, a Geosoft .xyz with a channel per gate, or a CSV): every channel stacked along a line, the decay at a station, and the late-time decay constant (tau) mapped. A long decay (a large tau) marks a good conductor.")}</div>
      <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} style={{ ...pBtn, justifyContent: "center" }}><Upload size={14} />{" "}{tr("Open TEM line data…")}</button>
      <input ref={fileRef} type="file" accept=".xyz,.csv,.txt,.dat" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; open(f); }} aria-label={tr("TEM line data file")} />
      {msg && <div role={msg.info ? "status" : "alert"} style={{ ...note, color: msg.info ? "var(--color-text-secondary)" : "var(--color-warn-text)", margin: "4px 0 8px" }}>{msg.text}</div>}
      {data && (<>
        {st.posNote && <div style={{ ...note, marginBottom: 6 }}>{st.posNote}</div>}
        <div style={rowS}><span>{tr("Channels")}</span>
          <select value={st.g} onChange={(e) => { if (e.target.value === "join") { save({ ...st, g: "join" }); return; } const g = Number(e.target.value), t = data.gateTimes(data.groups[g]); save({ ...st, g, timesText: t ? t.join(" ") : st.timesText }); }} style={{ ...smallSel, maxWidth: 190 }} aria-label={tr("TEM channel group")}>
            {data.groups.map((g, i) => <option key={g.prefix} value={i}>{tr("{name} ({m} gates)", { name: g.prefix, m: g.cols.length })}{g.aux ? ` — ${tr("uncertainty")}` : g.role === "time" ? ` — ${tr("gate times")}` : g.role === "model" ? ` — ${tr("model")}` : ""}</option>)}
            {joinable && <option value="join">{tr("Both moments joined ({m} gates)", { m: joinable.ta.length + joinable.tb.length })}</option>}{/* #3441 */}
          </select>
        </div>
        {isJoin ? <div style={note}>{tr("Gate times of both moments read from the file ({a} to {b} ms), sorted together.", { a: fmt(times[0]), b: fmt(times[times.length - 1]) })}</div> : <div style={{ ...rowS, alignItems: "flex-start", flexDirection: "column" }}>
          <span>{tr("Gate times (ms), one per gate")}</span>
          <input type="text" value={st.timesText} onChange={(e) => save({ ...st, timesText: e.target.value })} placeholder={tr("{m} times, e.g. 0.01 0.02 0.04 …", { m: group.cols.length })} style={{ ...smallSel, width: "100%" }} aria-label={tr("Gate times in milliseconds")} />
          {!times && <span style={{ ...note, color: "var(--color-warn-text)" }}>{tr("{have} of {m} gate times: the decay constant needs one per gate.", { have: numbersIn(st.timesText).length, m: group.cols.length })}</span>}
        </div>}
        {/* TASKS.csv #3441 — readings in the noise left out of the decay-constant fit */}
        <div style={{ ...rowS, flexWrap: "wrap" }}>
          <span>{tr("Noise floor")}</span>
          <NumberInput allowEmpty min={0} value={st.floor ?? ""} placeholder={tr("none")} onChange={(v) => save({ ...st, floor: (v == null ? "" : String(v)) })} style={{ ...smallSel, width: 90 }} aria-label={tr("Readings under this size are left out of the decay fit (the data's units)")} title={tr("Readings under this size are left out of the decay fit (the data's units)")} />
        </div>
        {noiseMat && <div style={{ ...rowS, flexWrap: "wrap", justifyContent: "flex-start" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={!!st.useStd} onChange={(e) => save({ ...st, useStd: e.target.checked })} />{tr("Leave out readings with an uncertainty over")}</label>
          <NumberInput allowEmpty min={1} max={1000} step={1} value={st.maxUnc ?? 33} onChange={(v) => save({ ...st, maxUnc: (v == null ? "" : String(v)) })} style={{ ...smallSel, width: 52 }} aria-label={tr("Largest uncertainty kept, in per cent")} />
          <span>%</span>
          <select value={st.stdKind || stdGuess} onChange={(e) => save({ ...st, stdKind: e.target.value })} style={smallSel} aria-label={tr("What the uncertainty columns hold")}>
            <option value="relative">{tr("STD is a fraction of the reading")}</option><option value="absolute">{tr("STD is in the data's units")}</option>
          </select>
        </div>}
        {lines.length > 1 && <div style={rowS}><span>{tr("Line")}</span>
          <select value={line?.key} onChange={(e) => save({ ...st, line: e.target.value, sel: null })} style={smallSel} aria-label={tr("TEM line")}>{lines.map((l) => <option key={l.key} value={l.key}>{l.key} ({l.idx.length})</option>)}</select>
        </div>}
        {line && mat && <Profiles line={line} mat={mat} sel={sel} onPick={(i) => save({ ...st, sel: i })} />}
        <div style={{ ...note, margin: "3px 0 8px" }}>{tr("Early gates purple, late gates yellow; a log scale, positive readings only. Click a station to see its decay.")}</div>
        {sel != null && vals && (<>
          <div style={{ fontSize: "var(--font-size-sm)", marginBottom: 4 }}>{tr("Station {i}: {x} E, {y} N", { i: sel + 1, x: fmt(data.x[sel]), y: fmt(data.y[sel]) })}</div>
          {times ? <Decay times={times} vals={vals} fit={fit} /> : <div style={note}>{tr("Type the gate times to draw the decay.")}</div>}
          {times && <div style={{ ...note, marginTop: 3 }}>{fit ? tr("Decay constant tau = {tau} ms, from gates {a} to {b} ({t0} to {t1} ms, r² {r2}).", { tau: fmt(fit.tau), a: fit.from + 1, b: fit.to + 1, t0: fmt(times[fit.from]), t1: fmt(times[fit.to]), r2: fit.r2.toFixed(3) }) : tr("No decay constant here: fewer than three positive late readings, or they do not fall.")}{masked?.dropped ? " " + tr("{n} reading(s) in the noise were left out.", { n: masked.dropped }) : ""}</div>}
        </>)}
        <button type="button" disabled={!times} onClick={mapTau} title={times ? undefined : tr("Type the gate times first")} style={{ ...pBtn, justifyContent: "center", marginTop: 8 }}>{tr("Map the decay constant (tau)")}</button>
        <div style={rowS}>
          <select value={st.gate ?? ""} onChange={(e) => save({ ...st, gate: e.target.value === "" ? null : Number(e.target.value) })} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Gate to add as a point survey")}>
            <option value="">{tr("Add one gate as a point survey…")}</option>
            {group.cols.map((c, k) => <option key={c} value={k}>{times ? tr("Gate {k} ({t} ms)", { k: k + 1, t: fmt(times[k]) }) : tr("Gate {k}", { k: k + 1 })}</option>)}
          </select>
          <button type="button" disabled={st.gate == null} onClick={() => addGate(st.gate)} style={{ ...smallSel, cursor: "pointer" }}>{tr("Add")}</button>
        </div>
        {/* TASKS.csv #3440 step 3 — the 1D inversion, for a set of decays (one, or both moments joined) */}
        {(isJoin || group.role === "data" || (!group.role && !group.aux)) && (
          <TemInvertPanel /* TASKS.csv #3501 — keyed by the file and its channel set: switching from one moment to both joined remounts the
              panel (its state holds a waveform per moment; reused for two moments it read the second's as undefined and closed the tab) */ key={`${data.name}|${isJoin ? `${joinable.ga.prefix}+${joinable.gb.prefix}` : group.prefix}`} data={data} groups={isJoin ? [joinable.ga, joinable.gb] : [group]} timesOf={(g) => (isJoin ? (g === joinable.ga ? joinable.ta : joinable.tb) : times)} line={line} setLayers={setLayers} updateGeophysSurvey={updateGeophysSurvey} />
        )}
      </>)}
    </div>
  );
}
