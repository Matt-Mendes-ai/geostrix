// TASKS.csv #3939 — Layout's first screen, pictures first: while the page holds only the starter elements (title, north arrow, scale bar, credits),
// four picture buttons make a whole sheet in one click, as the ribbon's Sheets group does (the same makeSheet, the same disabled reasons), and one
// button starts from the 3D view. A card over the page, not on it: it is never printed or exported. Every word is HTML at a text-size token.
// TASKS.csv #3956 (part 2) — in style A: the shared card (.ge-card, a tinted .ge-card-head), and each sheet's picture is the geology block of DropDiagram's kit.
import React from "react";
import { t as tr } from "../lib/i18n.js";
import { DropPicture } from "./DropDiagram.jsx";

const tile = (disabled) => ({ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 6px 9px", border: `1px solid ${disabled ? "var(--color-border)" : "var(--color-tier-basic)"}`,
  borderRadius: 12, background: disabled ? "var(--color-bg-subtle)" : "linear-gradient(160deg, var(--color-bg) 0%, var(--color-tier-basic-bg) 75%)", color: disabled ? "var(--color-text-disabled)" : "var(--color-tier-basic)",
  boxShadow: disabled ? "none" : "var(--shadow-lift)", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", font: "inherit", opacity: disabled ? 0.7 : 1 });

// sheets: [{ kind, label, disabled, reason, title }] (strings in English: they are translated here, as the ribbon does)
export default function LayoutStartCard({ sheets, onMake, onCurrentView, onClose }) {
  return (
    <div data-layout-start="" role="region" aria-label={tr("A sheet in one click")} onMouseDown={(e) => e.stopPropagation()} className="ge-card"
      style={{ pointerEvents: "auto", width: "min(460px, calc(100% - 32px))", color: "var(--color-text-secondary)", fontSize: "var(--font-size-base)", lineHeight: 1.45, position: "relative", overflow: "hidden" }}>
      <div className="ge-card-head" style={{ padding: "11px 16px 9px", fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)" }}>{tr("A sheet in one click")}</div>
      <button data-btn-own="" type="button" onClick={onClose} aria-label={tr("Close")} title={tr("Close")} style={{ position: "absolute", top: 8, insetInlineEnd: 10, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", fontSize: "var(--font-size-lg)" }}>×</button>
      <div style={{ padding: "12px 16px 14px" }}>
        <div dir="ltr" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {sheets.map((s) => (
            <button data-btn-own="" key={s.kind} type="button" data-layout-start-sheet={s.kind} disabled={s.disabled} title={tr(s.disabled ? s.reason : s.title)} onClick={() => onMake(s.kind)} style={tile(s.disabled)}>
              <DropPicture picture={s.kind === "intercepts" ? "table" : s.kind} style={{ maxHeight: 58, opacity: s.disabled ? 0.55 : 1 }} />
              <span dir="auto" style={{ textAlign: "center", lineHeight: 1.2 }}>{tr(s.label)}</span>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>{tr("Or start from the 3D view:")}</span>
          <button data-btn-own="" type="button" data-layout-start-view="" onClick={onCurrentView} style={{ background: "none", border: "none", padding: 0, color: "var(--color-primary)", cursor: "pointer", font: "inherit", textDecoration: "underline" }}>{tr("Current view")}</button>
        </div>
      </div>
    </div>
  );
}
