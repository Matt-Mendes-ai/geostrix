// TASKS.csv #3939 — Layout's first screen, pictures first: while the page holds only the starter elements (title, north arrow, scale bar, credits),
// four picture buttons make a whole sheet in one click, as the ribbon's Sheets group does (the same makeSheet, the same disabled reasons), and one
// button starts from the 3D view. A card over the page, not on it: it is never printed or exported. Drawn in DropDiagram's kit (green is what
// you do, greys the result); every word is HTML at a text-size token.
import React from "react";
import { t as tr } from "../lib/i18n.js";

const stroke = (c, w = 1) => ({ style: { stroke: `var(--color-${c})` }, strokeWidth: w, fill: "none", vectorEffect: "non-scaling-stroke" });
const fill = (c, o = 1) => ({ style: { fill: `var(--color-${c})`, fillOpacity: o } });

const PICS = {
  // a drill plan: collars in a frame, a north arrow
  plan: () => (<>
    <rect x={4} y={4} width={92} height={56} {...stroke("text-muted")} />
    {[[20, 18], [34, 30], [50, 22], [62, 40], [44, 46], [76, 28], [28, 48]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.6} {...fill("tier-basic")} />)}
    <path d="M86 20 L86 10 M82 14 L86 10 L90 14" {...stroke("text", 1.4)} />
  </>),
  // a section: ground line, holes cut by the section
  section: () => (<>
    <path d="M4 16 L30 12 L56 18 L96 10" {...stroke("text-muted", 1.4)} />
    {[[24, 13, 30, 56], [52, 17, 46, 58], [78, 13, 84, 54]].map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} {...stroke("tier-basic", 2)} />)}
    <path d="M10 40 Q50 30 92 44" {...stroke("accent-dark", 1.2)} strokeDasharray="3 2" />
  </>),
  // a hole log: a depth column of logged intervals beside a grade trace
  log: () => (<>
    {[[4, 14, "tier-basic", 0.35], [18, 10, "accent", 0.45], [28, 16, "tier-basic", 0.2], [44, 16, "accent", 0.3]].map(([y, h, c, o], i) => <rect key={i} x={34} y={y} width={16} height={h} {...fill(c, o)} />)}
    <rect x={34} y={4} width={16} height={56} {...stroke("text-muted")} />
    <path d="M58 4 L62 14 L60 22 L74 30 L64 40 L66 50 L60 60" {...stroke("tier-basic", 1.6)} />
  </>),
  // a table of intercepts
  table: () => (<>
    <rect x={4} y={6} width={92} height={52} {...stroke("text-muted")} />
    <rect x={4} y={6} width={92} height={10} {...fill("tier-basic", 0.25)} />
    {[16, 26, 36, 46].map((y) => <line key={y} x1={4} y1={y} x2={96} y2={y} {...stroke("border-light")} />)}
    {[34, 64].map((x) => <line key={x} x1={x} y1={6} x2={x} y2={58} {...stroke("border-light")} />)}
  </>),
};

const tile = (disabled) => ({ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 6px", border: `1px solid ${disabled ? "var(--color-border)" : "var(--color-tier-basic)"}`,
  borderRadius: 8, background: disabled ? "var(--color-bg-subtle)" : "var(--color-tier-basic-bg)", color: disabled ? "var(--color-text-disabled)" : "var(--color-tier-basic)",
  fontWeight: 600, fontSize: "var(--font-size-base)", cursor: disabled ? "not-allowed" : "pointer", font: "inherit", opacity: disabled ? 0.75 : 1 });

// sheets: [{ kind, label, disabled, reason, title }] (strings in English: they are translated here, as the ribbon does)
export default function LayoutStartCard({ sheets, onMake, onCurrentView, onClose }) {
  return (
    <div data-layout-start="" role="region" aria-label={tr("A sheet in one click")} onMouseDown={(e) => e.stopPropagation()}
      style={{ pointerEvents: "auto", width: "min(440px, calc(100% - 32px))", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8,
        boxShadow: "var(--shadow-card)", padding: "14px 16px", color: "var(--color-text-secondary)", fontSize: "var(--font-size-base)", lineHeight: 1.45, position: "relative" }}>
      <button type="button" onClick={onClose} aria-label={tr("Close")} title={tr("Close")} style={{ position: "absolute", top: 6, insetInlineEnd: 8, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", fontSize: "var(--font-size-lg)" }}>×</button>
      <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)", marginBottom: 10 }}>{tr("A sheet in one click")}</div>
      <div dir="ltr" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {sheets.map((s) => {
          const Pic = PICS[s.kind === "intercepts" ? "table" : s.kind];
          return (
            <button key={s.kind} type="button" data-layout-start-sheet={s.kind} disabled={s.disabled} title={tr(s.disabled ? s.reason : s.title)} onClick={() => onMake(s.kind)} style={tile(s.disabled)}>
              <svg viewBox="0 0 100 64" width="100%" aria-hidden="true" style={{ display: "block", maxHeight: 56 }}><Pic /></svg>
              <span dir="auto" style={{ textAlign: "center", lineHeight: 1.2 }}>{tr(s.label)}</span>
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span>{tr("Or start from the 3D view:")}</span>
        <button type="button" data-layout-start-view="" onClick={onCurrentView} style={{ background: "none", border: "none", padding: 0, color: "var(--color-primary)", cursor: "pointer", font: "inherit", textDecoration: "underline" }}>{tr("Current view")}</button>
      </div>
    </div>
  );
}
