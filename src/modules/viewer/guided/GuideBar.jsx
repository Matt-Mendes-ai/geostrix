// TASKS.csv #4035 (guided modelling row 5, design docs/ideas/guided-modelling-design.md section 2, "A way back") — the guide shrunk to one line while
// the person works in a pane or turns the model: which step it is on, and one click back. Drawn in StrixViewer and 3D Modelling, over the view's
// top-left corner where the card was. It reads nothing from the project (the guide's facts are not computed while it is a bar).
import React from "react";
import { X } from "../../../components/icons.js";
import { t as tr } from "../../../lib/i18n.js";

const bar = { position: "absolute", top: 12, left: 12, zIndex: 30, display: "flex", alignItems: "center", gap: 8, maxWidth: 420, padding: "6px 8px 6px 12px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderInlineStart: "4px solid var(--color-tier-basic)", borderRadius: 8, boxShadow: "0 4px 14px rgba(0,0,0,0.12)", color: "var(--color-text)", fontSize: "var(--font-size-sm)" };
const btn = { padding: "3px 10px", border: "1px solid var(--color-tier-basic)", background: "var(--color-tier-basic)", color: "var(--color-bg)", borderRadius: 5, cursor: "pointer", fontSize: "var(--font-size-sm)", fontWeight: 600, whiteSpace: "nowrap" };

// n: the step's number (1-7), of: the number of steps, title: its English title; open(): back to the card; close(): the guide closes (its place is kept)
export default function GuideBar({ n, of, title, open, close }) {
  return (
    <div style={bar} role="region" aria-label={tr("Guide")} data-guide-bar="">
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tr("Guide: step {n} of {m}, {title}.", { n, m: of, title: tr(title) })}</span>
      <button type="button" style={btn} onClick={open}>{tr("Back to the guide")}</button>
      <button type="button" onClick={close} aria-label={tr("Close")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", padding: 2 }}><X size={14} /></button>
    </div>
  );
}
