// TASKS.csv #1999 — the robust multivariate anomaly score (MCD Mahalanobis distance on log ratios, lib/mcd.js) as a calculated element: of
// the drill assays (lab rows: no QC inserts, no pXRF) or of the surface samples (one medium, or all), on elements read from the data
// (defaultMcdElements) that the user can change. Written like a Calc. element, so the plan map, the 3D View, thresholds and grade stats
// take it. The panel says what the score is: a ranking of how unusual each sample's whole composition is, not a probability.
import React, { useMemo, useState } from "react";
import { t as tr } from "../lib/i18n.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { mcdAnomalyScores, defaultMcdElements } from "../lib/mcd.js";
import { classifyQAQCRow, isPxrfRow } from "../lib/qaqc.js";
import { notice } from "../lib/notices.js";

const ALL = "\u0000all";
export default function McdAnomalyPanel({ assays, assayElements, surfaceSamples, surfaceElements, setAssays, setAssayElements, setSurfaceSamples, setSurfaceElements, onNotice, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const [source, setSource] = useState(() => (assays.length ? "assays" : "surface"));
  const media = useMemo(() => [...new Set(surfaceSamples.map((s) => s.medium || ""))].filter(Boolean).sort(), [surfaceSamples]);
  const [medium, setMedium] = useState(() => (media.length > 1 ? media[0] : ALL));
  const pool = useMemo(() => (source === "assays" ? assays.filter((a) => !isPxrfRow(a) && classifyQAQCRow(a) === "regular") : surfaceSamples.filter((s) => medium === ALL || (s.medium || "") === medium)), [source, medium, assays, surfaceSamples]);
  const elements = source === "assays" ? assayElements : surfaceElements;
  const defaults = useMemo(() => defaultMcdElements(pool, elements), [pool, elements]);
  const [picked, setPicked] = useState(null); // null: the defaults
  const chosen = picked || defaults;
  const [name, setName] = useState("MCD_score");
  const [res, setRes] = useState(null), [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const reset = () => { setRes(null); setErr(null); };
  const run = () => {
    setBusy(true); reset();
    setTimeout(() => { // let the 'Scoring…' state paint (10^4 samples take about a second)
      try { setRes(mcdAnomalyScores(pool, chosen)); } catch (e) { setErr(e.message); }
      setBusy(false);
    }, 30);
  };
  const exists = elements.some((e) => e.symbol === name);
  const validName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !exists;
  const write = () => {
    if (!res || !validName) return;
    const byRow = new Map(pool.map((r, i) => [r, res.scores[i]]));
    const element = { symbol: name, unit: "index", calculated: { method: "MCD robust distance (ilr)", elements: [...chosen], cutoff: +res.cutoff.toFixed(4), ...(source === "surface" && medium !== ALL ? { medium } : {}) } };
    const put = (rows) => rows.map((r) => { const v = byRow.get(r); return v == null ? r : { ...r, values: { ...(r.values || {}), [name]: +v.toFixed(4) } }; });
    if (source === "assays") { setAssays(put(assays)); setAssayElements((prev) => [...prev, element]); }
    else { setSurfaceSamples(put(surfaceSamples)); setSurfaceElements((prev) => [...prev, element]); }
    onNotice?.(notice("Added {name}: the robust multivariate score of {n} sample(s) on {els}; {k} lie above the 97.5 % line ({cut}). It ranks how unusual each sample's composition is; it is not a probability of mineralization.", { name, n: res.used.toLocaleString(), els: chosen.join(", "), k: res.flagged.toLocaleString(), cut: res.cutoff.toFixed(2) }));
    onClose();
  };
  const top = res ? pool.map((r, i) => [r, res.scores[i]]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]).slice(0, 8) : [];
  const where = (r) => (r.hole_id != null && r.from != null ? `${r.hole_id} ${r.from}–${r.to} m` : r.sample_id || r.id || "");
  const lbl = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
  const sel = { background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 6px", fontSize: "var(--font-size-sm)", fontFamily: "inherit" };
  const btn = (primary) => ({ ...sel, cursor: "pointer", padding: "5px 12px", ...(primary ? { background: "var(--color-selected-bg)", color: "var(--color-primary)", borderColor: "var(--color-selected-border)" } : {}) });
  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div role="dialog" aria-modal="true" aria-label={tr("Multivariate anomaly score")} onClick={(e) => e.stopPropagation()} style={{ width: "min(640px, 94vw)", maxHeight: "88vh", overflow: "auto", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-accent-dark)" }}>{tr("Multivariate anomaly score")}</div>
        <div style={{ ...lbl, lineHeight: 1.45 }}>{tr("How far each sample's whole composition lies from the bulk of the data: the robust Mahalanobis distance on log ratios of the chosen elements, with the centre and spread from the Minimum Covariance Determinant (Filzmoser, Garrett & Reimann 2005), so up to a quarter of the samples can be unusual without hiding each other. It is a ranking, not a probability of mineralization.")}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={lbl}>{tr("Samples")}<select value={source} onChange={(e) => { setSource(e.target.value); setPicked(null); reset(); }} style={{ ...sel, display: "block", marginTop: 3 }}>
            {assays.length > 0 && <option value="assays">{tr("Drill assays (lab rows)")}</option>}
            {surfaceSamples.length > 0 && <option value="surface">{tr("Surface samples")}</option>}
          </select></label>
          {source === "surface" && media.length > 1 && <label style={lbl}>{tr("Sample type")}<select value={medium} onChange={(e) => { setMedium(e.target.value); setPicked(null); reset(); }} style={{ ...sel, display: "block", marginTop: 3 }}>
            {media.map((m) => <option key={m} value={m}>{m}</option>)}
            <option value={ALL}>{tr("All types together")}</option>
          </select></label>}
          <span style={lbl}>{tr("{n} sample(s)", { n: pool.length.toLocaleString() })}</span>
        </div>
        <div style={lbl}>{tr("Elements (at least three; the defaults are those with a value on 90 % of the samples and few below detection):")}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", marginTop: 4 }}>
            {elements.filter((e) => !e.calculated).map((e) => (
              <label key={e.symbol} style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
                <input type="checkbox" checked={chosen.includes(e.symbol)} onChange={(ev) => { setPicked(ev.target.checked ? [...chosen, e.symbol] : chosen.filter((s) => s !== e.symbol)); reset(); }} />{e.symbol}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" style={btn(true)} disabled={busy || chosen.length < 3} onClick={run}>{busy ? tr("Scoring…") : tr("Score")}</button>
          {chosen.length < 3 && <span style={lbl}>{tr("Choose at least three elements.")}</span>}
        </div>
        {err && <div role="alert" style={{ ...lbl, color: "var(--color-danger-text)" }}>{err}</div>}
        {res && (<>
          <div style={{ fontSize: "var(--font-size-sm)", lineHeight: 1.45 }}>{tr("{used} of {n} sample(s) scored on {d} elements ({p} log-ratio coordinates; a sample missing one of them has no score). {k} lie above the 97.5 % chi-square line, a distance of {cut}; with no anomalies about 2.5 % would.", { used: res.used.toLocaleString(), n: pool.length.toLocaleString(), d: chosen.length, p: res.p, k: res.flagged.toLocaleString(), cut: res.cutoff.toFixed(2) })}</div>
          {top.length > 0 && <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", alignSelf: "flex-start" }}>
            <thead><tr><th style={{ textAlign: "start", padding: "2px 8px" }}>{tr("Most unusual")}</th><th style={{ textAlign: "end", padding: "2px 8px" }}>{tr("Score")}</th></tr></thead>
            <tbody>{top.map(([r, v], i) => <tr key={i}><td style={{ padding: "2px 8px" }}>{where(r)}</td><td style={{ textAlign: "end", padding: "2px 8px", fontVariantNumeric: "tabular-nums" }}>{v.toFixed(2)}</td></tr>)}</tbody>
          </table>}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={lbl}>{tr("Column name")}<input value={name} onChange={(e) => setName(e.target.value.trim())} style={{ ...sel, display: "block", marginTop: 3, width: 150 }} /></label>
            <button type="button" style={btn(true)} disabled={!validName} onClick={write}>{tr("Write the score")}</button>
            {exists && <span style={{ ...lbl, color: "var(--color-warn-text)" }}>{tr("\"{n}\" already exists — pick another name.", { n: name })}</span>}
          </div>
        </>)}
        <div style={{ display: "flex", justifyContent: "flex-end" }}><button type="button" style={btn(false)} onClick={onClose}>{tr("Close")}</button></div>
      </div>
    </div>
  );
}
