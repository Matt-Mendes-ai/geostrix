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
const chip = (on) => ({ padding: "2px 8px", borderRadius: 10, fontSize: 11, cursor: "pointer", border: `1px solid ${on ? "var(--color-accent)" : "var(--color-border-light)"}`, background: on ? "var(--color-divider)" : "transparent", color: "var(--color-text)" });

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
            <button type="button" onClick={exportSvg} disabled={!composed} style={{ ...chip(false), display: "flex", alignItems: "center", gap: 4 }}><Download size={12} />{tr("SVG")}</button>
            {onAddToLayout && <button type="button" onClick={toLayout} disabled={!composed} style={chip(false)}>{tr("Add to Layout")}</button>}
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
              {(assayElements || []).slice(0, 12).map((e) => <span key={e.symbol} role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setSyms((p) => (p.includes(e.symbol) ? p.filter((x) => x !== e.symbol) : p.length >= 3 ? p : [...p, e.symbol]))} style={chip(syms.includes(e.symbol))}>{e.symbol}</span>)}
            </div>
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
