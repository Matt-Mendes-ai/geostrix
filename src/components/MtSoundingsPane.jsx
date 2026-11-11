// TASKS.csv #1989 — the Geophysics tab's MT / AMT soundings: EDI files read into a survey (lib/edi.js), each station's
// apparent-resistivity and phase curves, a line's pseudosection, and the Niblett–Bostick points under the stations drawn in
// 3D as a point survey. A first look in depth, not an inversion: the contractor's 2D / 3D model still goes through Block models.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { Waves, Upload } from "./icons.js";
import { parseEdi, ediStations, bostickPoints, mtSurveyName, mergeStations, lineOrder, sortLines } from "../lib/edi.js";
import { reprojectXY, crsName } from "../lib/reproject.js";
import { askAdoptCrs } from "../lib/adoptCrs.js";
import { SURVEY_METHODS, surveyKey } from "../lib/geophysSurveys.js";
import { smallSel, pBtn } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";
import { percentile } from "../lib/arrayStats.js"; // #1114

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", fontSize: "var(--font-size-sm)", marginBottom: 6 };
const SERIES = { xy: { color: "#2f6db5", label: "xy" }, yx: { color: "#c0392b", label: "yx" }, det: { color: "#222222", label: "det" } };
// low resistivity (a conductor) hot, high cold, the way MT sections are read; for phase the ramp runs the other way round
const RAMP = ["#b2182b", "#ef8a62", "#fddbc7", "#d1e5f0", "#67a9cf", "#2166ac"];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function rampColour(t) {
  const u = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(u)), f = u - i;
  const a = hex(RAMP[i]), b = hex(RAMP[i + 1]);
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",")})`;
}
const fmt = (v) => (Math.abs(v) > 0 && Math.abs(v) < 0.01 ? v.toExponential(0) : Number(v.toPrecision(2)).toLocaleString()); // 1/7,500 s is 1e-4, not 0

function SoundingPlot({ s }) {
  const w = 300, pl = 44, pr = 8, pt = 8, h1 = 150, h2 = 90, gap = 22, pb = 26, h = pt + h1 + gap + h2 + pb;
  const keys = ["xy", "yx", "det"].filter((k) => s.rho[k]);
  const periods = s.freqs.map((f) => 1 / f), lp = periods.map(Math.log10);
  const x0 = Math.min(...lp), x1 = Math.max(...lp);
  const lr = keys.flatMap((k) => s.rho[k].filter((v) => v > 0).map(Math.log10));
  if (!lr.length) return <div style={note}>{tr("This station has no apparent resistivity above zero.")}</div>;
  const y0 = Math.floor(Math.min(...lr)), y1 = Math.max(y0 + 1, Math.ceil(Math.max(...lr)));
  const sx = (v) => pl + ((v - x0) / ((x1 - x0) || 1)) * (w - pl - pr);
  const sy = (v) => pt + h1 - ((v - y0) / (y1 - y0)) * h1;
  const top2 = pt + h1 + gap, sp = (v) => top2 + h2 - (Math.min(90, Math.max(0, v)) / 90) * h2;
  const path = (vals, yf, ok) => vals.map((v, i) => (ok(v) ? `${sx(lp[i])},${yf(v)}` : null)).filter(Boolean);
  const decades = []; for (let d = y0; d <= y1; d++) decades.push(d);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={tr("Apparent resistivity and phase against period at {station}", { station: s.id })} style={{ display: "block", background: "#fff", border: "1px solid var(--color-border)", borderRadius: 6 }}>
      <line x1={pl} y1={pt} x2={pl} y2={pt + h1} stroke="#94a1b0" /><line x1={pl} y1={pt + h1} x2={w - pr} y2={pt + h1} stroke="#94a1b0" />
      {decades.map((d) => <g key={d}><line x1={pl} x2={w - pr} y1={sy(d)} y2={sy(d)} stroke="#e3e7ec" /><text x={pl - 3} y={sy(d) + 3} fontSize="8" fill="#55606e" textAnchor="end">{fmt(10 ** d)}</text></g>)}
      <text x={10} y={pt + h1 / 2} fontSize="9" fill="#55606e" textAnchor="middle" transform={`rotate(-90 10 ${pt + h1 / 2})`}>{tr("Apparent resistivity (Ω·m)")}</text>
      {keys.map((k) => { const p = path(s.rho[k], (v) => sy(Math.log10(v)), (v) => v > 0); return <g key={k}><polyline points={p.join(" ")} fill="none" stroke={SERIES[k].color} strokeWidth={k === "det" ? 1.6 : 1} />{p.map((q, i) => { const [cx, cy] = q.split(","); return <circle key={i} cx={cx} cy={cy} r="1.6" fill={SERIES[k].color} />; })}</g>; })}
      <line x1={pl} y1={top2} x2={pl} y2={top2 + h2} stroke="#94a1b0" /><line x1={pl} y1={top2 + h2} x2={w - pr} y2={top2 + h2} stroke="#94a1b0" />
      {[0, 45, 90].map((d) => <g key={d}><line x1={pl} x2={w - pr} y1={sp(d)} y2={sp(d)} stroke="#e3e7ec" /><text x={pl - 3} y={sp(d) + 3} fontSize="8" fill="#55606e" textAnchor="end">{d}°</text></g>)}
      <text x={10} y={top2 + h2 / 2} fontSize="9" fill="#55606e" textAnchor="middle" transform={`rotate(-90 10 ${top2 + h2 / 2})`}>{tr("Phase")}</text>
      {keys.map((k) => { const p = path(s.phs[k], sp, (v) => Number.isFinite(v)); return <polyline key={k} points={p.join(" ")} fill="none" stroke={SERIES[k].color} strokeWidth={k === "det" ? 1.6 : 1} />; })}
      <text x={pl} y={h - pb + 12} fontSize="8" fill="#55606e">{fmt(10 ** x0)}</text>
      <text x={w - pr} y={h - pb + 12} fontSize="8" fill="#55606e" textAnchor="end">{fmt(10 ** x1)}</text>
      <text x={(pl + w - pr) / 2} y={h - 4} fontSize="9" fill="#55606e" textAnchor="middle">{tr("Period (s, log scale)")}</text>
      {keys.map((k, i) => <g key={k}><line x1={pl + 8 + i * 44} x2={pl + 22 + i * 44} y1={pt + 8} y2={pt + 8} stroke={SERIES[k].color} strokeWidth="2" /><text x={pl + 25 + i * 44} y={pt + 11} fontSize="8" fill="#55606e">{SERIES[k].label}</text></g>)}
    </svg>
  );
}

function Pseudosection({ ordered, comp, quantity, selected, onPick }) {
  const w = 300, pl = 40, pr = 8, pt = 8, ph = 170, pb = 30, h = pt + ph + pb + 22;
  const cells = [], allV = [];
  const lpAll = ordered.flatMap(({ s }) => s.freqs.map((f) => Math.log10(1 / f)));
  if (!ordered.length || !lpAll.length) return null;
  const y0 = Math.min(...lpAll), y1 = Math.max(...lpAll), dMax = ordered[ordered.length - 1].d || 1;
  const sx = (d) => pl + (d / dMax) * (w - pl - pr), sy = (v) => pt + ((v - y0) / ((y1 - y0) || 1)) * ph;
  ordered.forEach(({ s, d }, i) => {
    const a = i ? (d + ordered[i - 1].d) / 2 : d - (ordered[1] ? (ordered[1].d - d) / 2 : 50), b = i < ordered.length - 1 ? (d + ordered[i + 1].d) / 2 : d + (i ? (d - ordered[i - 1].d) / 2 : 50);
    const vals = quantity === "phase" ? s.phs[comp] : s.rho[comp]?.map((v) => (v > 0 ? Math.log10(v) : NaN));
    if (!vals) return;
    const lp = s.freqs.map((f) => Math.log10(1 / f));
    lp.forEach((p, j) => {
      const up = j ? (p + lp[j - 1]) / 2 : p - (lp[1] != null ? (lp[1] - p) / 2 : 0.1), dn = j < lp.length - 1 ? (p + lp[j + 1]) / 2 : p + (j ? (p - lp[j - 1]) / 2 : 0.1);
      const [t0, t1] = [Math.min(up, dn), Math.max(up, dn)];
      cells.push({ i, s, x: sx(Math.max(0, a)), x2: sx(Math.min(dMax, b)), y: sy(t0), y2: sy(t1), v: vals[j] });
      allV.push(vals[j]);
    });
  });
  const [lo, hi] = quantity === "phase" ? [0, 90] : [percentile(allV, 0.02), percentile(allV, 0.98)]; // the 2-98 % stretch
  const t = (v) => (quantity === "phase" ? 1 - (v - lo) / (hi - lo || 1) : (v - lo) / (hi - lo || 1));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={tr("Pseudosection: stations along the line against period")} style={{ display: "block", background: "#fff", border: "1px solid var(--color-border)", borderRadius: 6, cursor: "pointer" }}>
      {cells.map((c, k) => <rect key={k} x={c.x} y={c.y} width={Math.max(0.5, c.x2 - c.x)} height={Math.max(0.5, c.y2 - c.y)} fill={Number.isFinite(c.v) ? rampColour(t(c.v)) : "#eeeeee"} onClick={() => onPick(c.s.id)}><title>{`${c.s.id}: ${Number.isFinite(c.v) ? (quantity === "phase" ? `${c.v.toFixed(1)}°` : `${fmt(10 ** c.v)} Ω·m`) : "—"}`}</title></rect>)}
      {ordered.map(({ s, d }) => <line key={s.id} x1={sx(d)} x2={sx(d)} y1={pt + ph} y2={pt + ph + (s.id === selected ? 7 : 3)} stroke={s.id === selected ? "#111" : "#94a1b0"} strokeWidth={s.id === selected ? 2 : 1} />)}
      <text x={pl - 3} y={pt + 8} fontSize="8" fill="#55606e" textAnchor="end">{fmt(10 ** y0)}</text>
      <text x={pl - 3} y={pt + ph} fontSize="8" fill="#55606e" textAnchor="end">{fmt(10 ** y1)}</text>
      <text x={10} y={pt + ph / 2} fontSize="9" fill="#55606e" textAnchor="middle" transform={`rotate(-90 10 ${pt + ph / 2})`}>{tr("Period (s)")}</text>
      <text x={pl} y={pt + ph + 18} fontSize="8" fill="#55606e">0 m</text>
      <text x={w - pr} y={pt + ph + 18} fontSize="8" fill="#55606e" textAnchor="end">{Math.round(dMax).toLocaleString()} m</text>
      {RAMP.map((c, k) => <rect key={k} x={pl + 40 + k * 22} y={h - 14} width="22" height="8" fill={quantity === "phase" ? RAMP[RAMP.length - 1 - k] : c} />)}
      <text x={pl + 37} y={h - 7} fontSize="8" fill="#55606e" textAnchor="end">{quantity === "phase" ? "0°" : `${fmt(10 ** lo)} Ω·m`}</text>
      <text x={pl + 43 + RAMP.length * 22} y={h - 7} fontSize="8" fill="#55606e">{quantity === "phase" ? "90°" : `${fmt(10 ** hi)} Ω·m`}</text>
    </svg>
  );
}

export default function MtSoundingsPane({ layers, setLayers, geophysSurveys, updateGeophysSurvey, project, setEpsg, projectIsEmpty, pendingFiles = null, onPendingDone = null, onClose }) {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const surveys = useMemo(() => Object.entries(geophysSurveys || {}).filter(([, m]) => m?.mt?.stations?.length).map(([k]) => k), [geophysSurveys]);
  const [surveyName, setSurveyName] = useState("");
  const active = surveys.includes(surveyName) ? surveyName : surveys[0] || "";
  const stations = geophysSurveys?.[active]?.mt?.stations || [];
  const lines = useMemo(() => sortLines([...new Set(stations.map((s) => s.line ?? ""))]), [stations]);
  const [lineKey, setLineKey] = useState(null);
  const line = lines.includes(lineKey) ? lineKey : lines[0] ?? "";
  const ordered = useMemo(() => lineOrder(stations.filter((s) => (s.line ?? "") === line)), [stations, line]);
  const [stationId, setStationId] = useState("");
  const station = ordered.find((o) => o.s.id === stationId)?.s || ordered[0]?.s || stations[0] || null;
  const [comp, setComp] = useState("det");
  const [quantity, setQuantity] = useState("rho");

  const importEdi = async (fileList) => {
    const all = Array.from(fileList || []), files = all.filter((f) => /\.edi$/i.test(f.name));
    // TASKS.csv #2078 (review #2013, Woodjam) — a file that is not .edi was dropped without a word (the reviewer's 3050E.dat then reached the
    // drillhole importer): it is named, and a DC / IP .dat is sent to DC / IP
    const others = all.filter((f) => !/\.edi$/i.test(f.name));
    const othersNote = others.length ? tr("Not EDI files, not read here: {names}. MT / AMT reads .edi soundings; a DC / IP line file (.dat, .txt) goes to the DC / IP pane.", { names: others.slice(0, 4).map((f) => f.name).join(", ") + (others.length > 4 ? " …" : "") }) : "";
    if (!files.length) { if (othersNote) setMsg({ info: false, text: othersNote }); return; }
    setBusy(true);
    setMsg({ info: true, text: tr("Reading {n} EDI file(s)…", { n: files.length }) });
    await new Promise((r) => setTimeout(r, 0));
    try {
      const parsed = [], failed = [];
      for (const f of files) { try { parsed.push(parseEdi(await f.text(), f.name)); } catch (err) { failed.push(err.message); } }
      if (!parsed.length) { setMsg({ info: false, text: failed.join(" ") }); return; }
      let target = project?.epsg;
      const first = parsed.find((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon));
      if (first) { const adopted = askAdoptCrs({ isEmpty: projectIsEmpty, currentEpsg: target, declaredEpsg: 4326, fileName: files[0].name, at: { lon: first.lon, lat: first.lat } }); if (adopted) { setEpsg(adopted); target = adopted; } }
      const toXY = (lon, lat) => reprojectXY(lon, lat, 4326, target);
      const name = mtSurveyName(parsed);
      const merged = mergeStations(geophysSurveys?.[name]?.mt?.stations, ediStations(parsed, toXY));
      const { rows, noPlace, outside } = bostickPoints(merged, name);
      setLayers((l) => ({ ...l, geophys_pts: [...(l.geophys_pts || []).filter((r) => surveyKey(r) !== name), ...rows] }));
      updateGeophysSurvey(name, { method: "mt_bostick", units: SURVEY_METHODS.mt_bostick.units, mt: { stations: merged, invariant: "det", epsg: target } });
      setSurveyName(name); setLineKey(null); setStationId("");
      const freqs = parsed.flatMap((e) => e.freqs);
      const how = [...new Set(parsed.map((e) => `${e.units}|${e.unitsFrom}`))].map((k) => {
        const [u, from] = k.split("|");
        const unit = u === "SI" ? tr("SI units (ohm)") : tr("field units, (mV/km)/nT");
        return from === "rho" ? tr("{unit}, checked against the file's own apparent resistivity", { unit }) : from === "info" ? tr("{unit}, as the file's notes say", { unit }) : tr("{unit}, the EDI standard's default", { unit });
      }).join("; ");
      setMsg({ info: !failed.length, text: [
        tr("Read {n} sounding(s) from {files} file(s), {lo} to {hi} Hz; impedances in {how}.", { n: parsed.length, files: files.length, lo: fmt(Math.min(...freqs)), hi: fmt(Math.max(...freqs)), how }),
        merged.length > parsed.length ? tr("The survey \"{name}\" now holds {n} stations (a station read again replaced its earlier copy).", { name, n: merged.length }) : "",
        rows.length ? tr("{pts} Niblett–Bostick point(s) under {st} station(s) are the point survey \"{name}\" in 3D, coloured by log₁₀ of the resistivity: approximate 1D depths, not an inversion.", { pts: rows.length.toLocaleString(), st: merged.length - noPlace, name }) : "",
        noPlace ? tr("{n} station(s) have no latitude / longitude or no elevation: their curves are here, with no points in 3D.", { n: noPlace }) : "",
        outside ? tr("{n} reading(s) were left out of the depth transform: their phase is outside 0 to 90°.", { n: outside }) : "",
        first ? tr("Positions are the files' latitude and longitude, taken as WGS 84, in {crs}.", { crs: `${crsName(target) || "?"} (EPSG:${target})` }) : "",
        ...parsed.flatMap((e) => e.warnings.map((wn) => `${e.id}: ${wn}`)).slice(0, 3),
        failed.length ? tr("Not read: {v}", { v: failed.slice(0, 4).join(" ") + (failed.length > 4 ? " …" : "") }) : "",
        othersNote, // #2078
      ].filter(Boolean).join(" ") });
    } catch (err) {
      setMsg({ info: false, text: tr("Could not import the EDI files: {message}", { message: err.message }) });
    } finally {
      setBusy(false);
    }
  };
  // files dropped on the Geophysics tab arrive here once
  const seen = useRef(null);
  useEffect(() => {
    if (!pendingFiles?.length || seen.current === pendingFiles) return;
    seen.current = pendingFiles;
    importEdi(pendingFiles).finally(() => onPendingDone?.());
  }, [pendingFiles]); // importEdi reads the current props; it runs once per drop

  const pts = (layers?.geophys_pts || []).filter((r) => surveyKey(r) === active).length;
  return (
    <>
      <TaskPaneHeader title={tr("MT / AMT soundings (.edi)")} helpId="mt-soundings" icon={Waves} tone="data" onClose={onClose} />
      <div style={{ ...note, marginBottom: 8 }}>{tr("Magnetotelluric and audio-MT soundings from EDI files: apparent resistivity and phase per station, a pseudosection per line, and Niblett–Bostick depths under the stations in 3D. Drop the .edi files on this tab, or pick them.")}</div>
      <button type="button" style={pBtn} disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={14} />{busy ? tr("Reading…") : tr("Import EDI files…")}</button>
      <input ref={fileRef} type="file" accept=".edi" multiple style={{ display: "none" }} onChange={(e) => { importEdi(e.target.files); e.target.value = ""; }} />
      {msg && <div role="status" style={{ marginBottom: 10, padding: "8px 10px", background: msg.info ? "var(--color-bg-subtle)" : "var(--color-danger-bg)", border: `1px solid ${msg.info ? "var(--color-border)" : "var(--color-danger-border)"}`, borderRadius: 6, fontSize: "var(--font-size-sm)", color: msg.info ? "var(--color-text-secondary)" : "var(--color-danger-text)", lineHeight: 1.5 }}>{msg.text}</div>}
      {!surveys.length ? (
        <div style={note}>{tr("No MT soundings yet.")}</div>
      ) : (
        <>
          {surveys.length > 1 && (
            <label style={row}>{tr("Survey")}<select style={smallSel} value={active} aria-label={tr("MT survey")} onChange={(e) => { setSurveyName(e.target.value); setLineKey(null); setStationId(""); }}>{surveys.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
          )}
          <div style={{ ...note, marginBottom: 6 }}>{tr("{n} stations, {pts} depth points in 3D.", { n: stations.length, pts: pts.toLocaleString() })}</div>
          <label style={row}>{tr("Line")}<select style={smallSel} value={line} aria-label={tr("MT line")} onChange={(e) => { setLineKey(e.target.value); setStationId(""); }}>{lines.map((l) => <option key={l} value={l}>{l || tr("(no line in the station names)")}</option>)}</select></label>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <select style={{ ...smallSel, flex: 1, minWidth: 0 }} value={quantity} aria-label={tr("Pseudosection quantity")} onChange={(e) => setQuantity(e.target.value)}>
              <option value="rho">{tr("Apparent resistivity")}</option>
              <option value="phase">{tr("Phase")}</option>
            </select>
            <select style={{ ...smallSel, flex: 1, minWidth: 0 }} value={comp} title={tr("Determinant (rotation-free)")} aria-label={tr("Impedance component")} onChange={(e) => setComp(e.target.value)}>
              <option value="det">{tr("Determinant")}</option>
              <option value="xy">xy</option>
              <option value="yx">yx</option>
            </select>
          </div>
          <Pseudosection ordered={ordered} comp={comp} quantity={quantity} selected={station?.id} onPick={setStationId} />
          <div style={{ ...note, margin: "4px 0 10px" }}>{tr("Short periods (shallow) at the top. Click a column for its station's curves.")}</div>
          <label style={row}>{tr("Station")}<select style={smallSel} value={station?.id || ""} aria-label={tr("MT station")} onChange={(e) => setStationId(e.target.value)}>{(ordered.length ? ordered.map((o) => o.s) : stations).map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}</select></label>
          {station && <SoundingPlot s={station} />}
          {station && <div style={{ ...note, marginTop: 4 }}>{tr("Elevation {z} m, {n} frequencies. Phases are folded into 0 to 180°: a uniform half-space reads 45°, above 45° the ground gets more conductive with depth.", { z: Number.isFinite(station.z) ? Math.round(station.z).toLocaleString() : "?", n: station.freqs.length })}</div>}
          <div style={{ ...note, marginTop: 8 }}>{tr("The depths in 3D are a Niblett–Bostick transform of the determinant: each frequency's apparent resistivity and phase turned into a resistivity at an approximate depth. It is a 1D estimate, wrong under a 3D body; the contractor's 2D / 3D inversion (Block models) is the model to interpret.")}</div>
        </>
      )}
    </>
  );
}
