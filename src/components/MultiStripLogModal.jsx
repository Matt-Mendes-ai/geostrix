// TASKS.csv #3560 A1 — several holes' strip logs side by side on one depth scale (lib/multiStripLog.js), opened from the strip log.
import React, { useMemo, useState } from "react";
import { X, Download } from "./icons.js";
import { saveFile } from "../lib/desktop.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { embedFigureFont } from "../lib/svgFontEmbed.js";
import { composeStripLogs, MULTI_MAX_HOLES } from "../lib/multiStripLog.js";
import { t as tr } from "../lib/i18n.js";

const panel = { width: "min(1200px, 96vw)", maxHeight: "92vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Exo 2', system-ui, sans-serif" };
const chip = (on) => ({ padding: "2px 8px", borderRadius: 10, fontSize: "var(--font-size-sm)", cursor: "pointer", border: `1px solid ${on ? "var(--color-accent)" : "var(--color-border-light)"}`, background: on ? "var(--color-divider)" : "transparent", color: "var(--color-text)" });

export default function MultiStripLogModal({ holeId, collars, layers, assays, assayElements, legendOverride = null, onAddToLayout = null, onClose }) {
  useEscapeKey(onClose); useFocusTrap();
  const [picked, setPicked] = useState([holeId]);
  const [filter, setFilter] = useState("");
  const [align, setAlign] = useState("depth");
  const [syms, setSyms] = useState([]);
  const withData = useMemo(() => {
    const has = new Set();
    for (const k of ["litho", "alt", "vein", "breccia", "structzone", "weath", "geotech", "recovery", "sg", "mnlgy", "magsusc"]) for (const r of layers?.[k] || []) has.add(r.hole_id);
    for (const a of assays || []) has.add(a.hole_id);
    return (collars || []).filter((c) => has.has(c.hole_id)).map((c) => c.hole_id);
  }, [collars, layers, assays]);
  const shown = withData.filter((h) => !filter.trim() || h.toLowerCase().includes(filter.trim().toLowerCase()));
  const toggle = (h) => setPicked((p) => (p.includes(h) ? p.filter((x) => x !== h) : p.length >= MULTI_MAX_HOLES ? p : [...p, h]));
  const elementUnits = useMemo(() => Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit])), [assayElements]);
  const toggleSym = (s) => setSyms((p) => (p.includes(s) ? p.filter((x) => x !== s) : p.length >= 3 ? p : [...p, s]));
  const QUICK = 12, quick = (assayElements || []).slice(0, QUICK), ticked = (assayElements || []).filter((e) => syms.includes(e.symbol) && !quick.includes(e));
  const chips = [...quick, ...ticked], rest = (assayElements || []).filter((e) => !chips.includes(e)); // #3764
  const composed = useMemo(() => (picked.length ? composeStripLogs(picked, { collars, layers, legendOverride, assays, assaySymbols: syms, elementUnits }, { align }) : null), [picked, collars, layers, legendOverride, assays, syms, elementUnits, align]);
  const exportSvg = () => composed && embedFigureFont(composed.svg).catch(() => composed.svg).then((content) => saveFile({ suggestedName: `strip_logs_${picked.length}_holes.svg`, filters: [{ name: "SVG", extensions: ["svg"] }], content }));
  const toLayout = () => {
    if (!composed || !onAddToLayout) return;
    embedFigureFont(composed.svg).catch(() => composed.svg).then((m) => onAddToLayout({ label: `Strip logs — ${picked.join(", ")}` /* project data stays English */, src: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(m)))}`, naturalW: composed.width, naturalH: composed.height, legendItems: [], depthHeightAtCaptureM: composed.height / composed.pxPerMeter }));
    onClose?.();
  };
  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Strip logs side by side")}</div>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" onClick={exportSvg} disabled={!composed} className="gs-btn gs-btn--sm" style={{ display: "flex", alignItems: "center", gap: 4 }}><Download size={12} />{tr("SVG")}</button>
            {onAddToLayout && <button type="button" onClick={toLayout} disabled={!composed} className="gs-btn gs-btn--sm">{tr("Add to Layout")}</button>}
            <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
          </span>
        </div>
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div style={{ width: 250, borderRight: "1px solid var(--color-border)", padding: 12, overflowY: "auto", fontSize: "var(--font-size-sm)" }}>
            <label style={{ display: "block", marginBottom: 8 }}>{tr("Hang the holes")}
              <select value={align} onChange={(e) => setAlign(e.target.value)} style={{ width: "100%" }} aria-label={tr("How the holes are lined up")}>
                <option value="depth">{tr("from their own 0 m (depth)")}</option>
                <option value="rl">{tr("from their collar elevations")}</option>
              </select>
            </label>
            <div style={{ marginBottom: 6 }}>{tr("Elements (up to 3)")}</div>
            {/* TASKS.csv #3764 — every element of the project can be chosen: the first QUICK as chips (and any ticked one), the rest in an 'Add an element' list
                (34 elements offered twelve: lead, zinc, sulphur and iron could not go beside gold) */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
              {chips.map((e) => <span key={e.symbol} role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => toggleSym(e.symbol)} style={chip(syms.includes(e.symbol))}>{e.symbol}</span>)}
            </div>
            {rest.length > 0 && (
              <select aria-label={tr("Add an element")} value="" disabled={syms.length >= 3} onChange={(e) => { if (e.target.value) toggleSym(e.target.value); }} style={{ width: "100%", marginBottom: 10 }}>
                <option value="">{tr("Add an element… ({n} more)", { n: rest.length })}</option>
                {rest.map((e) => <option key={e.symbol} value={e.symbol}>{e.symbol}</option>)}
              </select>
            )}
            {align === "rl" && <div style={{ marginBottom: 8, color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", lineHeight: 1.4 }}>{tr("Hung by collar elevation: the scale is downhole depth, so the same line across is the same level only in vertical holes.")}</div>}{/* #3764 */}
            <div style={{ marginBottom: 4 }}>{tr("Holes ({n} of {max})", { n: picked.length, max: MULTI_MAX_HOLES })}</div>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tr("Filter holes…")} aria-label={tr("Filter holes")} style={{ width: "100%", boxSizing: "border-box", marginBottom: 6 }} />
            {shown.slice(0, 300).map((h) => <label key={h} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={picked.includes(h)} onChange={() => toggle(h)} />{h}</label>)}
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 12, background: "#fff" }}>
            {composed ? <div dangerouslySetInnerHTML={{ __html: composed.svg.replace("<svg ", '<svg style="max-width:none" ') }} /> : <div style={{ color: "var(--color-text-muted)" }}>{tr("Tick holes to draw their logs.")}</div>}
            {composed?.skipped.length > 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Nothing to draw for: {list}.", { list: composed.skipped.join(", ") })}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
