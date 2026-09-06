import React from "react";

// TASKS.csv #309 — one shared empty state for every "there's nothing here yet" screen in the app.
//
// WHY THIS EXISTS. A visual-design review loaded the 37-hole sample project and tabbed across all
// seven module tabs. The four data-import tabs each answered "there is nothing here yet" in a
// DIFFERENT visual language: 3D View had a proper bordered card with an explanation and a
// Load-sample-project button (TASKS.csv #293/#294); Geochem had one line of centred grey text;
// Raster had two lines of centred grey text and no icon; Geophysics had a large faint icon over a
// twelve-line centre-aligned paragraph of ~10px grey technical prose about GeoTIFF/GXF/UBC formats
// — reference material rather than an invitation to do anything, and close to unreadable as a block
// because both edges are ragged. Three of the four gave the user nothing to click.
//
// The 3D View card was named as the model the others should follow, so this component IS that card,
// extracted verbatim rather than redesigned — same 520px max width, same near-opaque white ground,
// same border/radius/shadow/padding, same 14px semibold headline over 12px body at 1.55 line height,
// same primary button. ViewerModule now renders through this component too, so the pattern can't
// drift back apart: change the card here and all four tabs move together.
//
// SHAPE. icon + headline + one short sentence + one primary action, with two escape hatches:
//   • `children` — extra explanatory paragraphs, for a tab that genuinely needs them (3D View's
//     three paragraphs from #294 are exactly that case, and are NOT trimmed here — the review
//     called that screen the best in the app).
//   • `footnote` — the small muted caveat line under the button (3D View's "some layers in the
//     sample data are synthesized" note).
// Everything except `headline` is optional, so a tab with nothing to say beyond one sentence gets a
// one-sentence card rather than padding out to fill the template.
//
// LAYOUT NOTE: the wrapper is pointerEvents:none and only the card re-enables them, because on 3D
// View this card floats over a live WebGL canvas and must never swallow an orbit drag aimed at the
// scene behind it. Harmless on the tabs whose background is inert.
export default function EmptyState({ icon, headline, children, actionLabel, onAction, actionDisabled, actionTitle, footnote, secondary }) {
  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
          {icon ? <span style={{ display: "flex", color: "var(--color-text-muted)", flexShrink: 0 }}>{icon}</span> : null}
          <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-text)", fontWeight: 600 }}>{headline}</div>
        </div>
        {children}
        {(actionLabel || secondary) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {actionLabel && (
              <button onClick={onAction} disabled={actionDisabled} title={actionTitle} style={{ ...primaryBtn, cursor: actionDisabled ? "default" : "pointer", opacity: actionDisabled ? 0.6 : 1 }}>
                {actionLabel}
              </button>
            )}
            {secondary}
          </div>
        )}
        {footnote && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 7 }}>{footnote}</div>}
      </div>
    </div>
  );
}

const wrap = { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", padding: 20 };
// #ffffffee (not a token): a deliberately TRANSLUCENT white so the 3D grid stays faintly visible
// behind the card. No token exists for a translucent surface and inventing one for a single use
// would be worse than this literal — see theme.js's adoption-status note (TASKS.csv #310).
const card = {
  pointerEvents: "auto", maxWidth: 520, background: "#ffffffee", border: "1px solid var(--color-border)",
  borderRadius: 8, padding: "18px 20px", color: "var(--color-text-secondary)", fontSize: "var(--font-size-base)", lineHeight: 1.55,
  boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
};
const primaryBtn = {
  background: "#2f6f9f", border: "1px solid #2a6291", color: "#fff", borderRadius: 6,
  padding: "8px 12px", fontSize: "var(--font-size-base)", fontFamily: "inherit",
};
// Exported so a tab offering a second, equally-valid entry point (Geochem's "Import pXRF" next to
// "Import assays") gets a button that is visibly SECONDARY to the primary one rather than a second
// filled blue button competing with it. Same metrics as primaryBtn so the pair sits on one baseline.
export const emptyStateSecondaryBtn = {
  background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", color: "var(--color-text)",
  borderRadius: 6, padding: "8px 12px", fontSize: "var(--font-size-base)", fontFamily: "inherit", cursor: "pointer",
};
