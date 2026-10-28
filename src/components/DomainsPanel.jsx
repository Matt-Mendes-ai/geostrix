// TASKS.csv #852 — geochemical domains: clr PCA with the loadings shown, k-means, and the domain written to the samples as
// a column ("Geochemical domain") that the Thresholds populations (#841) and the anomaly maps (#843) group by. Maths and
// the cautions (Templ, Filzmoser & Reimann 2008) in lib/geochemDomains.js.
import React, { useMemo, useState } from "react";
import { X } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { usableElements, geochemDomains, writeDomains, DOMAIN_ATTR } from "../lib/geochemDomains.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps, sel, th, td, label, panel, header, rowBtn as btn } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { fontSizes } from "../lib/theme.js";
import { t as tr } from "../lib/i18n.js";

const COLOURS = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442", "#999999"];

export default function DomainsPanel({ onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const { surfaceSamples, surfaceElements, setSurfaceSamples } = useStore();
  const units = useMemo(() => Object.fromEntries(surfaceElements.map((e) => [e.symbol, e.unit])), [surfaceElements]);
  const [medium, setMedium] = useState("all");
  const media = useMemo(() => [...new Set(surfaceSamples.map((s) => s.medium))], [surfaceSamples]);
  const subset = useMemo(() => (medium === "all" ? surfaceSamples : surfaceSamples.filter((s) => s.medium === medium)), [surfaceSamples, medium]);
  const usable = useMemo(() => usableElements(subset, surfaceElements, units), [subset, surfaceElements, units]);
  const [chosen, setChosen] = useState(null);
  const symbols = chosen || usable;
  const [k, setK] = useState(3);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState(null);
  const run = () => {
    const r = geochemDomains(subset, symbols, units, { k });
    setResult(r.error ? null : r);
    setMsg(r.error ? tr("Too few samples with all the chosen elements ({n}); drop an element or choose fewer clusters.", { n: r.n }) : null);
  };
  const write = () => {
    // the subset's indices map back to the full list
    const full = surfaceSamples.map((s) => s), pos = new Map(subset.map((s, i) => [s, i]));
    const mapped = { ...result, index: result.index.map((i) => full.indexOf(subset[i])) };
    void pos;
    setSurfaceSamples((prev) => writeDomains(prev, mapped));
    setMsg(tr("\"{attr}\" written to {n} samples: it is now a population choice in Thresholds and in the 3D View's anomaly maps.", { attr: DOMAIN_ATTR, n: result.index.length }));
  };
  const toggle = (sym) => setChosen((c) => { const base = c || usable; return base.includes(sym) ? base.filter((x) => x !== sym) : [...base, sym].sort((a, b) => surfaceElements.findIndex((e) => e.symbol === a) - surfaceElements.findIndex((e) => e.symbol === b)); });
  const pcs = result?.pca ? Math.min(3, result.pca.loadings.length) : 0;

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panelBox} role="dialog" aria-modal="true" aria-label={tr("Geochemical domains")} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Geochemical domains")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("Log-ratio principal components and k-means: populations to set thresholds within")}</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>
        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={ctl}>{tr("Samples")}<select value={medium} onChange={(e) => { setMedium(e.target.value); setChosen(null); setResult(null); }} style={{ ...sel, display: "block", marginTop: 4 }}><option value="all">{tr("All media together")}</option>{media.map((m) => <option key={m} value={m}>{tr(m)}</option>)}</select></label>
            <label style={ctl}>{tr("Clusters (k)")}<select value={k} onChange={(e) => setK(Number(e.target.value))} style={{ ...sel, display: "block", marginTop: 4 }}>{[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <button type="button" style={btn(true)} onClick={run} disabled={symbols.length < 2 || subset.length < 6}>{tr("Run")}</button>
          </div>
          <div>
            <div style={label}>{tr("Elements ({n} of {m}; those with a value in 90 % of the samples are ticked)", { n: symbols.length, m: surfaceElements.length })}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px", fontSize: "var(--font-size-sm)" }}>
              {surfaceElements.map((e) => <label key={e.symbol} style={{ display: "flex", alignItems: "center", gap: 3, color: usable.includes(e.symbol) ? "var(--color-text)" : "var(--color-text-secondary)" }} title={usable.includes(e.symbol) ? undefined : tr("Missing or below zero in more than 10 % of the samples; those samples would be left out")}><input type="checkbox" checked={symbols.includes(e.symbol)} onChange={() => toggle(e.symbol)} />{e.symbol}</label>)}
            </div>
          </div>
          <div style={note}>{tr("Concentrations are parts of a closed whole, so the samples are compared on centred log-ratios (Aitchison 1986), which also tames the skew. The number of clusters is your choice; the within-cluster scatter for k = 2–8 is only a guide. Clusters mostly reproduce lithology or regolith: that is the useful result, populations to threshold within, not a mineral map (Templ, Filzmoser & Reimann 2008).")}</div>
          {msg && <div style={{ ...note, color: "var(--color-text)" }}>{msg}</div>}
          {result && (
            <>
              <div style={note}>{tr("{n} samples on {e} elements ({skipped} left out for a missing element). PC1–PC3 explain {a} / {b} / {c} %.", { n: result.index.length, e: result.symbols.length, skipped: result.skipped, a: result.pca.explained[0].toFixed(0), b: (result.pca.explained[1] || 0).toFixed(0), c: (result.pca.explained[2] || 0).toFixed(0) })}</div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 360px", minWidth: 0 }}>
                  <div style={label}>{tr("PC1 against PC2, coloured by cluster")}</div>
                  <Biplot result={result} />
                </div>
                <div style={{ flex: "1 1 320px", minWidth: 0, overflowX: "auto" }}>
                  <div style={label}>{tr("Loadings")}</div>
                  <table style={tbl}>
                    <thead><tr><th style={{ ...th, textAlign: "start" }}>{tr("Element")}</th>{Array.from({ length: pcs }, (_, i) => <th key={i} style={th}>PC{i + 1}</th>)}</tr></thead>
                    <tbody>{result.symbols.map((sym, j) => <tr key={sym}><td style={{ ...td, textAlign: "start" }}>{sym}</td>{Array.from({ length: pcs }, (_, i) => <td key={i} style={{ ...td, fontWeight: Math.abs(result.pca.loadings[i][j]) > 0.4 ? 600 : 400 }}>{result.pca.loadings[i][j].toFixed(2)}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={tbl}>
                  <thead><tr><th style={{ ...th, textAlign: "start" }}>{tr("Domain")}</th><th style={th}>n</th><th style={{ ...th, textAlign: "start" }}>{tr("Enriched (median clr above all samples)")}</th><th style={{ ...th, textAlign: "start" }}>{tr("Depleted")}</th></tr></thead>
                  <tbody>{result.clusters.map((c, i) => <tr key={c.id}><td style={{ ...td, textAlign: "start" }}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: COLOURS[i % COLOURS.length], marginRight: 5 }} />{c.id}</td><td style={td}>{c.n}</td><td style={{ ...td, textAlign: "start" }}>{c.enriched.map((e) => `${e.sym} (+${e.d.toFixed(2)})`).join(", ") || "—"}</td><td style={{ ...td, textAlign: "start" }}>{c.depleted.map((e) => `${e.sym} (${e.d.toFixed(2)})`).join(", ") || "—"}</td></tr>)}</tbody>
                </table>
              </div>
              <div style={note}>{tr("Within-cluster scatter by k:")} {result.elbow.map((e) => `${e.k}: ${e.withinSS.toFixed(0)}`).join(" · ")}</div>
              <button type="button" style={{ ...btn(true), alignSelf: "flex-start" }} onClick={write}>{tr("Write \"{attr}\" to the samples", { attr: DOMAIN_ATTR })}</button>
            </>
          )}
        </div>
        <div style={{ display: "flex", padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}><span style={{ flex: 1 }} /><button type="button" style={btn(false)} onClick={onClose}>{tr("Close")}</button></div>
      </div>
    </div>
  );
}

function Biplot({ result }) {
  const w = 420, h = 320, p = 30, sc = result.pca.scores, xs = sc.map((s) => s[0]), ys = sc.map((s) => s[1] || 0);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1e-9, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1e-9;
  const X = (v) => p + ((v - x0) / (x1 - x0)) * (w - 2 * p), Y = (v) => h - p - ((v - y0) / (y1 - y0)) * (h - 2 * p);
  const L = result.pca.loadings, scale = 0.45 * Math.min(x1 - x0, y1 - y0);
  const cx = X((x0 + x1) / 2), cy = Y((y0 + y1) / 2);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={tr("PC1 against PC2, coloured by cluster")} style={{ display: "block" }}>
      <line x1={p} x2={w - p} y1={cy} y2={cy} style={{ stroke: "var(--color-border)" }} /><line x1={cx} x2={cx} y1={p} y2={h - p} style={{ stroke: "var(--color-border)" }} />
      {sc.map((s, i) => <circle key={i} cx={X(s[0])} cy={Y(s[1] || 0)} r={2.6} style={{ fill: COLOURS[result.labels[i] % COLOURS.length], fillOpacity: 0.8 }} />)}
      {L[0] && result.symbols.map((sym, j) => { const ex = X((x0 + x1) / 2 + L[0][j] * scale), ey = Y((y0 + y1) / 2 + (L[1]?.[j] || 0) * scale); return <g key={sym}><line x1={cx} y1={cy} x2={ex} y2={ey} style={{ stroke: "var(--color-text-secondary)", strokeWidth: 1 }} /><text x={ex} y={ey} dx={3} dy={3} fontSize={fontSizes.xs} style={{ fill: "var(--color-text)" }}>{sym}</text></g>; })}
      <text x={w - p} y={h - 6} textAnchor="end" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>PC1 ({result.pca.explained[0].toFixed(0)} %)</text>
      <text x={6} y={p - 6} fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>PC2 ({(result.pca.explained[1] || 0).toFixed(0)} %)</text>
    </svg>
  );
}

const panelBox = panel({ width: "min(1000px, 96vw)", maxHeight: "92vh" }); // TASKS.csv #997 — the shared modal chrome
const ctl = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const tbl = { borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" };
