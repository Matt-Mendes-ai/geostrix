// TASKS.csv #1999 — the robust multivariate anomaly score (MCD Mahalanobis distance on log ratios, lib/mcd.js) as a calculated element: of
// the drill assays (lab rows: no QC inserts, no pXRF) or of the surface samples (one medium, or all), on elements read from the data
// (defaultMcdElements) that the user can change. Written like a Calc. element, so the plan map, the 3D View, thresholds and grade stats
// take it. The panel says what the score is: a ranking of how unusual each sample's whole composition is, not a probability.
// TASKS.csv #4070 (Geochem panes) — on the shared step shell (StepDialog): Elements (the samples, the elements; Score, the gold primary) and Result (the
// most unusual, the column name; Write the score, the gold primary). What the score is and how the defaults are read moved into the Help card.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { t as tr } from "../lib/i18n.js";
import { backdropProps } from "../lib/modalStyles.js";
import { defaultMcdElements } from "../lib/mcd.js";
import { floorElements } from "../lib/floorShare.js"; // TASKS.csv #3748
import { runMcdScores } from "../lib/mcdClient.js"; // TASKS.csv #3030 — in a worker for a large table
import { classifyQAQCRow, isPxrfRow } from "../lib/qaqc.js";
import { notice } from "../lib/notices.js";
import StepDialog from "./StepDialog.jsx"; // TASKS.csv #4073 — the shared step shell (Escape and the focus trap)
import { useMcpAnomaly } from "./useMcpAnomaly.js"; // TASKS.csv #4093 (batch 5): anomaly_score

const ALL = "\u0000all";
export default function McdAnomalyPanel({ assays, assayElements, surfaceSamples, surfaceElements, setAssays, setAssayElements, setSurfaceSamples, setSurfaceElements, onNotice, onClose }) {
  const [source, setSource] = useState(() => (assays.length ? "assays" : "surface"));
  const media = useMemo(() => [...new Set(surfaceSamples.map((s) => s.medium || ""))].filter(Boolean).sort(), [surfaceSamples]);
  const [medium, setMedium] = useState(() => (media.length > 1 ? media[0] : ALL));
  const pool = useMemo(() => (source === "assays" ? assays.filter((a) => !isPxrfRow(a) && classifyQAQCRow(a) === "regular") : surfaceSamples.filter((s) => medium === ALL || (s.medium || "") === medium)), [source, medium, assays, surfaceSamples]);
  const elements = source === "assays" ? assayElements : surfaceElements;
  // TASKS.csv #3748 — the half-limit floor is read as Grade statistics reads it: an element mostly on its floor is not a default
  const floors = useMemo(() => {
    const units = Object.fromEntries(elements.map((e) => [e.symbol, e.unit]));
    return new Map(floorElements(pool, elements.filter((e) => !e.calculated).map((e) => e.symbol), units, 0.05).map((f) => [f.symbol, f]));
  }, [pool, elements]);
  const defaults = useMemo(() => defaultMcdElements(pool, elements, { floorShare: (s) => floors.get(s)?.share || 0 }), [pool, elements, floors]);
  const leftOut = useMemo(() => [...floors.values()].filter((f) => f.share > 0.25 && !defaults.includes(f.symbol)).sort((a, b) => b.share - a.share), [floors, defaults]);
  const [picked, setPicked] = useState(null); // null: the defaults
  const chosen = picked || defaults;
  const [name, setName] = useState("MCD_score");
  const [res, setRes] = useState(null), [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const [at, setAt] = useState(0);
  const reset = () => { setRes(null); setErr(null); };
  // TASKS.csv #3030 — the fit runs in a worker from MCD_WORKER_FROM samples (10^5 froze the window about 10 s); closing the dialog or a new
  // run drops the one in flight
  const job = useRef(null);
  useEffect(() => () => job.current?.cancel(), []);
  const run = () => {
    setBusy(true); reset();
    job.current?.cancel();
    const j = runMcdScores(pool, chosen);
    job.current = j;
    j.promise.then((r) => { if (job.current === j) { setRes(r); setBusy(false); setAt(1); } }, (e) => { if (job.current === j) { setErr(e.message); setBusy(false); } });
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
  // TASKS.csv #4093 (batch 5): anomaly_score runs this dialog's own Score and Write the score, with the choices the call names (components/useMcpAnomaly.js)
  useMcpAnomaly(() => ({ source, setSource, setPicked, reset, media, ALL, medium, setMedium, elements, chosen, pool, name, setName, run, write, res, err, busy, validName, top, where, hasAssays: assays.length > 0, hasSurface: surfaceSamples.length > 0 }));
  const lbl = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
  const sel = { background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 6px", fontSize: "var(--font-size-sm)", fontFamily: "inherit" };

  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>{tr("Multivariate anomaly score")}</summary>
      <div style={{ ...lbl, lineHeight: 1.45 }}>{tr("Ranks how far each sample's composition lies from the bulk (robust Mahalanobis distance on log ratios, Filzmoser 2005): a ranking, not a probability of mineralization.")}</div>
      <div style={{ ...lbl, lineHeight: 1.45, marginTop: 6 }}>{tr("Ticked first: the elements with a value on 90 % of the samples and few below detection or on the detection floor.")}</div>
    </details>
  );
  const steps = [
    { key: "elements", label: tr("Elements"), primary: { label: busy ? tr("Scoring…") : tr("Score"), onClick: run, disabled: busy || chosen.length < 3 }, hint: chosen.length < 3 ? tr("Choose at least three elements.") : "", render: () => (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
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
        <div style={lbl}>{tr("Elements (at least three)")}
          {leftOut.length > 0 && <div style={{ marginTop: 3 }}>{tr("Left out of the defaults, mostly on the file's detection floor: {list}.", { list: leftOut.slice(0, 8).map((f) => `${f.symbol} ${Math.round(f.share * 100)} %`).join(", ") + (leftOut.length > 8 ? ", …" : "") })}</div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", marginTop: 4 }}>
            {elements.filter((e) => !e.calculated).map((e) => (
              <label key={e.symbol} style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
                <input type="checkbox" checked={chosen.includes(e.symbol)} onChange={(ev) => { setPicked(ev.target.checked ? [...chosen, e.symbol] : chosen.filter((s) => s !== e.symbol)); reset(); }} />{e.symbol}
              </label>
            ))}
          </div>
        </div>
      </div>
    ) },
    { key: "result", label: tr("Result"), primary: { label: tr("Write the score"), onClick: write, disabled: !res || !validName }, hint: !res ? tr("Score the samples first.") : exists ? tr("\"{n}\" already exists — pick another name.", { n: name }) : "", render: () => (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {res && (<>
          <div style={{ fontSize: "var(--font-size-sm)", lineHeight: 1.45 }}>{tr("{used} of {n} sample(s) scored on {d} elements ({p} log-ratio coordinates). {k} lie above the 97.5 % chi-square line ({cut}); with no anomalies, about 2.5 % would.", { used: res.used.toLocaleString(), n: pool.length.toLocaleString(), d: chosen.length, p: res.p, k: res.flagged.toLocaleString(), cut: res.cutoff.toFixed(2) })}</div>
          {top.length > 0 && <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", alignSelf: "flex-start" }}>
            <thead><tr><th style={{ textAlign: "start", padding: "2px 8px" }}>{tr("Most unusual")}</th><th style={{ textAlign: "end", padding: "2px 8px" }}>{tr("Score")}</th></tr></thead>
            <tbody>{top.map(([r, v], i) => <tr key={i}><td style={{ padding: "2px 8px" }}>{where(r)}</td><td style={{ textAlign: "end", padding: "2px 8px", fontVariantNumeric: "tabular-nums" }}>{v.toFixed(2)}</td></tr>)}</tbody>
          </table>}
          <label style={lbl}>{tr("Column name")}<input value={name} onChange={(e) => setName(e.target.value.trim())} style={{ ...sel, display: "block", marginTop: 3, width: 150 }} /></label>
        </>)}
      </div>
    ) },
  ];
  const heading = tr("Multivariate anomaly score"); // the dialog's name, seen (not a tooltip)
  return <StepDialog title={heading} onClose={onClose} steps={steps} at={at} onAt={setAt} help={help} error={err} width="min(640px, 94vw)" overlayProps={backdropProps(onClose)} />;
}
