// TASKS.csv #1324 — the Identify tool's answer: the layer first, then the details, and what else lies under the same click
import React from "react";
import { X } from "./icons.js";
import { identifyText } from "../lib/viewer/identify.js";
import { copyText } from "../lib/desktop.js";
import { t as tr } from "../lib/i18n.js";

const small = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" };
const act = { padding: "4px 8px", borderRadius: 5, border: "1px solid var(--color-border)", background: "var(--color-bg)", cursor: "pointer", font: "inherit", fontSize: "var(--font-size-sm)", color: "var(--color-text)" };

export default function IdentifyPanel({ result, onShow, onClose, onZoom, onStripLog }) {
  const items = result?.items || [], it = items[result?.shown ?? 0];
  return (
    <div role="region" aria-label={tr("Identify")} style={{ position: "absolute", top: 12, right: 132, width: 300, maxHeight: "calc(100% - 24px)", display: "flex", flexDirection: "column", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, boxShadow: "0 4px 18px rgba(0,0,0,0.18)", color: "var(--color-text)", fontSize: "var(--font-size-base)", zIndex: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>
        <span style={{ fontWeight: 600 }}>{tr("Identify")}</span>
        <button type="button" onClick={onClose} aria-label={tr("Close")} title={tr("Close (Esc)")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", padding: 0, display: "flex" }}><X size={15} /></button>
      </div>
      <div style={{ overflow: "auto", padding: "8px 10px" }} aria-live="polite">
        {!result && <div style={small}>{tr("Click anything in the 3D view to see which layer it belongs to and its details. Dragging still moves the view.")}</div>}
        {result && !it && <div style={small}>{tr("Nothing here. Only what is showing can be identified.")}</div>}
        {it && (
          <>
            <div style={{ ...small, textTransform: "uppercase", letterSpacing: "0.06em" }}>{it.layer}</div>
            <div style={{ fontWeight: 600, overflowWrap: "anywhere", marginBottom: 6 }}>{it.title}</div>
            {it.fields.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
                <tbody>
                  {it.fields.map(([k, v], i) => (k
                    ? <tr key={i}><td style={{ color: "var(--color-text-muted)", padding: "2px 8px 2px 0", verticalAlign: "top", overflowWrap: "anywhere" }}>{k}</td><td style={{ padding: "2px 0", overflowWrap: "anywhere" }}>{v}</td></tr>
                    : <tr key={i}><td colSpan={2} style={{ padding: "2px 0", overflowWrap: "anywhere" }}>{v}</td></tr>))}
                </tbody>
              </table>
            )}
            <div style={{ ...small, marginTop: 6 }}>{tr("At this point: {e} E, {n} N, elevation {z} m", { e: Math.round(it.world.e).toLocaleString(), n: Math.round(it.world.n).toLocaleString(), z: Math.round(it.world.z).toLocaleString() })}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              <button type="button" style={act} onClick={() => onZoom(it.point)}>{tr("Zoom here")}</button>
              {it.hole && <button type="button" style={act} onClick={() => onStripLog(it.hole)}>{tr("Strip log")}</button>}
              <button type="button" style={act} onClick={() => copyText(identifyText(it))}>{tr("Copy")}</button>
            </div>
          </>
        )}
        {items.length > 1 && (
          <div style={{ marginTop: 10, borderTop: "1px solid var(--color-border)", paddingTop: 6 }}>
            <div style={small}>{tr("Under this click ({n})", { n: items.length })}</div>
            {items.map((x, i) => (
              <button key={i} type="button" onClick={() => onShow(i)} aria-current={i === result.shown} style={{ display: "block", width: "100%", textAlign: "left", border: "none", borderRadius: 4, padding: "3px 6px", marginTop: 2, cursor: "pointer", font: "inherit", fontSize: "var(--font-size-sm)", color: "var(--color-text)", background: i === result.shown ? "var(--color-selected-bg)" : "transparent", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${x.layer}: ${x.title}`}>
                <span style={{ color: "var(--color-text-muted)" }}>{x.layer}:</span> {x.title}{x.at ? <span style={{ color: "var(--color-text-muted)" }}> · {x.at}</span> : null}{/* #2520 */}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
