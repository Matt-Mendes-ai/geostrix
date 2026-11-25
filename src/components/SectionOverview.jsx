import React, { useEffect, useMemo, useRef, useState } from "react";
import { overviewSvg, overviewView, sectionInModel, snapOffset, withOverviewInset, insetOnFigure, figureWidth } from "../lib/sectionOverview.js";
import { t as tr } from "../lib/i18n.js";

// TASKS.csv #3977 — the section window's overview pane: the plan (lib/sectionOverview.js) with this section's line, its buffer as a band, A / B,
// and the series' other lines faint. It comes with each section the main window sends, so it follows the ± steps, the arrows and the tabs.
// Dragging the line moves the section parallel to itself (to the series' step, else to a metre); the section is redrawn on release.
// Open / closed, its size and "Show on export" are kept on this computer. exportRef: while "Show on export" is ticked, the inset for the
// SVG / PNG / Layout snapshot markup (inset: beside the figure, which it widens; width reads the widened figure's width) and for the printed
// PDF (pdf: put on the live figure, returns its undo); null otherwise.
const KEY = "geostrix.sectionOverview";
const readPref = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
const MIN_W = 160, MIN_H = 120;

export default function SectionOverview({ model, section, onMove, exportRef, busy = false, zoomWindow = null }) { // zoomWindow: #4009 { l0, l1 } along the line, metres from A
  const [pref, setPref] = useState(() => ({ open: true, w: 260, h: 260, onExport: false, ...readPref() }));
  const save = (patch) => setPref((p) => { const n = { ...p, ...patch }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* private mode */ } return n; });
  const boxRef = useRef(null);
  const [size, setSize] = useState({ w: pref.w, h: pref.h });
  // the body is resized by its corner (CSS resize); the size is kept when the drag ends
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    let t = null;
    const ro = new ResizeObserver(([e]) => {
      if (!e.contentRect.width || !e.contentRect.height) return; // a hidden tab (display: none) measures 0 x 0: not a resize (seen live)
      const w = Math.max(MIN_W, Math.round(e.contentRect.width)), h = Math.max(MIN_H, Math.round(e.contentRect.height));
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
      clearTimeout(t); t = setTimeout(() => save({ w, h }), 300);
    });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, [pref.open]);

  const base = useMemo(() => (pref.open ? overviewSvg(model, section, size.w, size.h) : ""), [pref.open, model, section, size.w, size.h]);
  const view = useMemo(() => overviewView(model, size.w, size.h), [model, size.w, size.h]);
  const s = useMemo(() => sectionInModel(model, section), [model, section]);

  // export: the inset while "Show on export" is ticked
  useEffect(() => {
    if (!exportRef) return undefined;
    exportRef.current = pref.onExport ? {
      inset: (markup, vb) => withOverviewInset(markup, vb, model, section),
      width: figureWidth,
      pdf: (svgEl) => insetOnFigure(svgEl, model, section),
    } : null;
    return () => { exportRef.current = null; };
  }, [exportRef, pref.onExport, model, section]);

  // dragging the line: its offset along the normal, snapped
  const [drag, setDrag] = useState(null); // { x0, y0, off }
  const offsetAt = (e, d) => {
    const r = e.currentTarget.getBoundingClientRect(), [x, y] = view.toRel(e.clientX - r.left, e.clientY - r.top), [x0, y0] = view.toRel(d.x0, d.y0);
    return snapOffset((x - x0) * s.n[0] + (y - y0) * s.n[1], model.stepM);
  };
  const down = (e) => { if (busy || e.button !== 0) return; const r = e.currentTarget.ownerSVGElement.getBoundingClientRect(); e.currentTarget.ownerSVGElement.setPointerCapture?.(e.pointerId); setDrag({ x0: e.clientX - r.left, y0: e.clientY - r.top, off: 0 }); e.preventDefault(); };
  const move = (e) => { if (!drag) return; const off = offsetAt(e, drag); if (off !== drag.off) setDrag({ ...drag, off }); };
  const up = (e) => { if (!drag) return; const off = offsetAt(e, drag); setDrag(null); if (Math.abs(off) >= 1) onMove?.(off); };
  useEffect(() => { if (!drag) return undefined; const k = (e) => { if (e.key === "Escape") setDrag(null); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [drag]);

  const corner = { position: "fixed", right: 14, bottom: 14, zIndex: 20 };
  if (!pref.open) {
    return <button data-btn-own="" type="button"  onClick={() => save({ open: true })} style={{ ...corner, padding: "4px 10px", background: "#ffffff", border: "1px solid #9aa3ad", borderRadius: 4, cursor: "pointer", fontSize: "var(--font-size-sm)" }} title={tr("Show where this section is on the plan")}>{tr("Overview")}</button>;
  }
  const X = view.X, Y = view.Y, d = drag ? [s.n[0] * drag.off, s.n[1] * drag.off] : [0, 0];
  return (
    <div className="ge-section-overview" data-section-overview="" style={{ ...corner, background: "#ffffff", border: "1px solid #9aa3ad", borderRadius: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.18)", fontSize: "var(--font-size-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 6px", borderBottom: "1px solid #e6e8eb" }}>
        <b style={{ flex: 1 }}>{tr("Overview")}</b>
        <label style={{ display: "flex", alignItems: "center", gap: 4, color: "#55606e" }}><input type="checkbox" checked={!!pref.onExport} onChange={(e) => save({ onExport: e.target.checked })} />{tr("Show on export")}</label>
        <button data-btn-own="" type="button" onClick={() => save({ open: false })} aria-label={tr("Hide the overview")} title={tr("Hide the overview")} style={{ border: "none", background: "none", cursor: "pointer", fontSize: "var(--font-size-lg)", lineHeight: 1, padding: "0 2px" }}>×</button>
      </div>
      <div ref={boxRef} style={{ position: "relative", width: pref.w, height: pref.h, minWidth: MIN_W, minHeight: MIN_H, maxWidth: "70vw", maxHeight: "70vh", resize: "both", overflow: "hidden" }}>
        <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: base }} style={{ position: "absolute", inset: 0, lineHeight: 0 }} />
        <svg width={size.w} height={size.h} style={{ position: "absolute", inset: 0 }} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)}>
          {drag && Math.abs(drag.off) > 0 && (<g pointerEvents="none">
            <line x1={X(s.a[0] + d[0])} y1={Y(s.a[1] + d[1])} x2={X(s.b[0] + d[0])} y2={Y(s.b[1] + d[1])} stroke="#c0392b" strokeWidth="1.8" strokeDasharray="5 3" />
            <text x={X((s.a[0] + s.b[0]) / 2 + d[0])} y={Y((s.a[1] + s.b[1]) / 2 + d[1]) - 6} fontSize="11" fontWeight="700" fill="#c0392b" textAnchor="middle" stroke="#ffffff" strokeWidth="2.5" paintOrder="stroke">{`${drag.off > 0 ? "+" : ""}${drag.off} m`}</text>
          </g>)}
          {zoomWindow && (() => { // #4009 — the section window's zoom: the part of the line in view, as a box across the buffer band
            const c = Math.max(s.corridor, 0.04 * Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])), P = (l, m) => [s.a[0] + s.u[0] * l + s.n[0] * c * m, s.a[1] + s.u[1] * l + s.n[1] * c * m];
            const pts = [P(zoomWindow.l0, 1), P(zoomWindow.l1, 1), P(zoomWindow.l1, -1), P(zoomWindow.l0, -1)].map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ");
            return <polygon data-zoom-box="" points={pts} fill="#1f5fa8" fillOpacity="0.14" stroke="#1f5fa8" strokeWidth="1.6" pointerEvents="none" />;
          })()}
          <line x1={X(s.a[0])} y1={Y(s.a[1])} x2={X(s.b[0])} y2={Y(s.b[1])} stroke="transparent" strokeWidth="14" style={{ cursor: busy ? "progress" : "move", pointerEvents: "stroke" }} onPointerDown={down}>
            <title>{model.stepM ? tr("Drag the line to move the section ({m} m steps).", { m: model.stepM }) : tr("Drag the line to move the section.")}</title>
          </line>
        </svg>
      </div>
    </div>
  );
}
