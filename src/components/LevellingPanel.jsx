// TASKS.csv #1001 — levelling one survey's surface samples to another, written as a new element column that Thresholds and
// the anomaly maps can use. Tie samples first; quantile matching only as a labelled fallback. Maths and sources in
// lib/levelling.js.
import React, { useMemo, useState } from "react";
import { X } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { surveysOf, fitLevelling, levellingPreview, writeLevelled, levelledSymbol, MIN_TIES, MIN_STAT } from "../lib/levelling.js";
import { PROJECT_SOURCE } from "../lib/thresholds.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps, sel, th, td, panel, header, rowBtn as btn } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { t as tr } from "../lib/i18n.js";

const panelBox = panel({ width: "min(720px, 96vw)", maxHeight: "92vh" });
const ctl = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };
const warn = { ...note, color: "var(--color-danger-fg)" };
const num = (v) => (Number.isFinite(v) ? +v.toPrecision(4) : "—");

export default function LevellingPanel({ onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const { surfaceSamples, surfaceElements, setSurfaceSamples, setSurfaceElements } = useStore();
  const elements = useMemo(() => surfaceElements.filter((e) => !e.symbol.endsWith("_lev")), [surfaceElements]);
  const media = useMemo(() => [...new Set(surfaceSamples.map((s) => s.medium))], [surfaceSamples]);
  const columns = useMemo(() => { const c = new Set(["source"]); surfaceSamples.forEach((s) => Object.keys(s.attrs || {}).forEach((k) => { if (!k.endsWith("_lev_basis")) c.add(k); })); return [...c]; }, [surfaceSamples]);
  const [column, setColumn] = useState("source");
  const [medium, setMedium] = useState(media[0] || "");
  const [symbol, setSymbol] = useState(elements[0]?.symbol || "");
  const inMedium = useMemo(() => surfaceSamples.filter((s) => s.medium === medium), [surfaceSamples, medium]);
  const surveys = useMemo(() => surveysOf(inMedium, column), [inMedium, column]);
  const [refPick, setRefPick] = useState("");
  const [surPick, setSurPick] = useState("");
  const reference = surveys.some((s) => s.key === refPick) ? refPick : surveys.find((s) => s.key === PROJECT_SOURCE)?.key || surveys[0]?.key || ""; // public data levels to the project's own samples
  const survey = surveys.some((s) => s.key === surPick) && surPick !== reference ? surPick : surveys.find((s) => s.key !== reference)?.key || "";
  const [radiusM, setRadiusM] = useState(25);
  const [methodPick, setMethodPick] = useState(null);
  const [msg, setMsg] = useState(null);
  const opts = { symbol, medium, column, reference, survey, radiusM };
  const fit = useMemo(() => (reference && survey && symbol ? fitLevelling(surfaceSamples, opts) : null), [surfaceSamples, symbol, medium, column, reference, survey, radiusM]);
  const canTies = !!fit?.ties?.ok, canStat = !!fit?.stats.ok;
  const method = methodPick === "quantile" && canStat ? "quantile" : canTies ? "ties" : null;
  const preview = useMemo(() => (fit && method ? levellingPreview(surfaceSamples, fit, method, opts) : null), [fit, method, surfaceSamples]);
  const unit = surfaceElements.find((e) => e.symbol === symbol)?.unit || "ppm";

  const write = () => {
    const r = writeLevelled(surfaceSamples, surfaceElements, fit, method, opts);
    setSurfaceSamples(r.samples);
    setSurfaceElements(r.elements);
    setMsg(tr("\"{col}\" written: {levelled} levelled and {reference} reference samples in {medium}. {symbol} itself is unchanged. It is now an element choice in Thresholds and the anomaly maps.", { col: levelledSymbol(symbol), levelled: r.written.levelled, reference: r.written.reference, medium, symbol }));
  };

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panelBox} role="dialog" aria-modal="true" aria-label={tr("Level surveys")} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Level surveys")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("Bring one survey's values to another's level, as a new column; the source values stay as they are")}</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>
        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={ctl}>{tr("Sample type")}<select value={medium} onChange={(e) => { setMedium(e.target.value); setMsg(null); }} style={{ ...sel, display: "block", marginTop: 4 }}>{media.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
            <label style={ctl}>{tr("Element")}<select value={symbol} onChange={(e) => { setSymbol(e.target.value); setMsg(null); }} style={{ ...sel, display: "block", marginTop: 4 }}>{elements.map((e) => <option key={e.symbol} value={e.symbol}>{e.symbol} ({e.unit})</option>)}</select></label>
            <label style={ctl}>{tr("Surveys told apart by")}<select value={column} onChange={(e) => { setColumn(e.target.value); setMsg(null); }} style={{ ...sel, display: "block", marginTop: 4 }}>{columns.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          </div>
          {surveys.length < 2 ? (
            <div style={note}>{tr("These samples all belong to one survey under this column, so there is nothing to level. Public data carries a source column; for your own surveys, choose a column such as year, lab or batch.")}</div>
          ) : (<>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={ctl}>{tr("Level to (reference)")}<select value={reference} onChange={(e) => { setRefPick(e.target.value); setMsg(null); }} style={{ ...sel, display: "block", marginTop: 4, maxWidth: 280 }}>{surveys.map((s) => <option key={s.key} value={s.key}>{s.key} ({s.count})</option>)}</select></label>
              <label style={ctl}>{tr("Survey to adjust")}<select value={survey} onChange={(e) => { setSurPick(e.target.value); setMsg(null); }} style={{ ...sel, display: "block", marginTop: 4, maxWidth: 280 }}>{surveys.filter((s) => s.key !== reference).map((s) => <option key={s.key} value={s.key}>{s.key} ({s.count})</option>)}</select></label>
              <label style={ctl}>{tr("Same site within (m)")}<input type="number" min="1" step="5" value={radiusM} onChange={(e) => setRadiusM(Math.max(1, Number(e.target.value) || 1))} style={{ ...sel, display: "block", marginTop: 4, width: 70 }} /></label>
            </div>
            {fit && (<>
              <div style={note}>
                {fit.ties?.ok
                  ? tr("{n} sites were sampled by both surveys. The median ratio is x{f}; most pairs fall between x{lo} and x{hi}. A wide range means the ties disagree: check them before relying on the level.", { n: fit.ties.n, f: num(fit.ties.factor), lo: num(fit.ties.low), hi: num(fit.ties.high) })
                  : tr("{n} sites were sampled by both surveys within this distance; tie levelling needs at least {min}. A larger distance finds more pairs, but sites further apart can differ for real.", { n: fit.ties?.n || 0, min: MIN_TIES })}
              </div>
              <label style={{ ...note, display: "flex", gap: 6, alignItems: "flex-start", cursor: canStat ? "pointer" : "default", opacity: canStat ? 1 : 0.6 }}>
                <input type="checkbox" disabled={!canStat} checked={method === "quantile"} onChange={(e) => setMethodPick(e.target.checked ? "quantile" : null)} />
                <span>{canStat ? tr("Use statistical quantile matching instead. It assumes both surveys sampled the same population, so it can erase or create real differences (Darnley et al. 1995). Use it only without tie samples, and treat the result as a guide.") : tr("Statistical quantile matching needs at least {min} measured samples in each survey (here {a} and {b}).", { min: MIN_STAT, a: fit.nReference, b: fit.nSurvey })}</span>
              </label>
              {preview && (
                <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", alignSelf: "flex-start" }}>
                  <thead><tr><th style={th}>{symbol} ({unit})</th><th style={th}>{tr("Median")}</th><th style={th}>{tr("Maximum")}</th></tr></thead>
                  <tbody>
                    <tr><td style={td}>{tr("Reference survey")}</td><td style={td}>{num(preview.reference.median)}</td><td style={td}>{num(preview.reference.max)}</td></tr>
                    <tr><td style={td}>{tr("Survey before")}</td><td style={td}>{num(preview.before.median)}</td><td style={td}>{num(preview.before.max)}</td></tr>
                    <tr><td style={td}>{tr("Survey after")}</td><td style={td}>{num(preview.after.median)}</td><td style={td}>{num(preview.after.max)}</td></tr>
                  </tbody>
                </table>
              )}
              {method === "quantile" && <div style={warn}>{tr("Statistical level: every adjusted sample records this in its basis column.")}</div>}
              <div><button type="button" onClick={write} disabled={!method} style={{ ...btn(true), opacity: method ? 1 : 0.5 }}>{tr("Write {col}", { col: levelledSymbol(symbol) })}</button></div>
            </>)}
          </>)}
          {msg && <div role="status" style={note}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}
