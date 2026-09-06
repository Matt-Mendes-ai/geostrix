// TASKS.csv #238 — shared modal-chrome style objects. grep for `const overlay = { position: "fixed",
// inset: 0` found 24 components independently re-declaring the same overlay object — the single most
// duplicated inline-style literal in the whole codebase, and `overlay` below IS actually migrated
// into all 24 (verified byte-identical in every one before doing so, not assumed).
//
// header/label/sel/inp/th/td/btn are also exported here, built from theme.js's tokens, but were NOT
// force-migrated into those same 24 files: checking each file's actual local copy turned up real,
// meaningful per-file variation (different padding, position:sticky in some th's, an extra width or
// fontFamily here and there, GeoreferencerModal's `label` missing marginBottom, StripLog's `btn`
// missing `padding`, StereonetModal's `sel` using an entirely different size/radius) — forcing all of
// those through one shared shape would have been a silent behavior/appearance change dressed up as a
// safe refactor, not a true no-op. They're exported here as the intended shape for NEW modal code and
// for incremental future migration, one file at a time with its own real comparison against what it
// already had, not a blind batch find-replace. See this row's own TASKS.csv notes.
import { colors } from "./theme.js";

export const overlay = { position: "fixed", inset: 0, background: "rgba(8,10,14,0.75)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" };

export function panel(sizing) {
  return { background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Exo 2', system-ui, sans-serif", ...sizing };
}

export const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${colors.border}` };
export const label = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: colors.textMuted, marginBottom: 8 };
export const sel = { background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, padding: "6px 8px", color: colors.text, fontSize: "var(--font-size-base)", fontFamily: "inherit" };
export const inp = sel; // AssayImportModal-family `sel` and other files' `inp` are the same object wherever both exist
export const th = { padding: "4px 8px", color: colors.textSecondary, fontWeight: 500, textAlign: "right", borderBottom: `1px solid ${colors.border}` };
export const td = { padding: "4px 8px", color: colors.text, textAlign: "right" };
export function btn(primary) {
  return { padding: "8px 0", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? `1px solid ${colors.successBorder}` : `1px solid ${colors.borderLight}`, background: primary ? colors.successBg : "transparent", color: primary ? colors.successText : colors.textSecondary };
}
