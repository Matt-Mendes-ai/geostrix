// TASKS.csv #238 — software-design-specialist audit finding: "no design system (116 hardcoded hex
// colors, ~1000 inline style objects, zero CSS custom properties)." This is the foundation piece: a
// single source of truth for the color palette GeoStrix already actually uses (extracted from real
// usage counts across src/ — grep for quoted hex literals, not invented/guessed values), as plain JS
// constants rather than CSS classes, because the overwhelming majority of this codebase's styling is
// inline `style={{...}}` objects (a deliberate prior choice, not something this pass changes), where
// a CSS custom property is used exactly the same way as a plain string (`color: colors.text` instead
// of `color: "var(--text)"` instead of `color: "#1a2028"` — all three work in an inline style, this
// file picks the plain-JS-constant form since it's what every existing call site already expects).
// The exact same values are also declared as CSS custom properties in styles/app.css, for the smaller
// share of styling that IS real CSS (app.css's own class rules) — the two are meant to stay in sync;
// if you change a value here, change it there too (and vice versa).
//
// NOT a rebrand: every value below is copied from its current, already-shipped usage, not redesigned.
// This pass's job is centralizing what already exists so it has one editable source of truth and a
// name, not changing how the app looks. Values are grouped by the semantic role they already play
// (checked against real call sites, not guessed from the hex code alone) rather than alphabetically.
export const colors = {
  // Core surfaces
  bg: "#ffffff",
  bgSubtle: "#f4f5f7", // input fields, hover backgrounds, subtle panels
  bgSubtlest: "#fafbfc", // sub-toolbar background

  // Borders
  border: "#d9dce1", // the standard border color — by far the most common single value in the app
  borderLight: "#c7ccd3", // secondary/lighter border (e.g. a disabled or de-emphasized control)
  divider: "#dde1e6", // tab bar / section divider, close to `border` but used distinctly

  // Text
  text: "#1a2028", // primary text
  textSecondary: "#55606e", // labels, secondary body text — the single most-used color in the app
  textMuted: "#94a1b0", // placeholders, section-label uppercase captions, disabled text
  textFaint: "#6b7684", // a third, slightly different muted tone (tab labels, some captions)

  // Accent (gold — this app's primary brand/highlight color, used for active states and emphasis)
  accent: "#e2a63c",
  accentDark: "#8a6a1f", // modal titles, stronger emphasis on light backgrounds

  // Selection / info (blue)
  selectedBg: "#eaf1fa",
  selectedBorder: "#a9c6e0",
  info: "#4a9be0",

  // Success / positive / primary-action (green) — this app's "primary button" color pair
  successBg: "#1e3629",
  successText: "#8fd9ab",
  successBorder: "#3d6b52",

  // Danger / destructive / error (red)
  dangerBg: "#2a1f1f",
  dangerText: "#e0a0a0",
  dangerBorder: "#4a2f2f",
  dangerIcon: "#8a5555",
  dangerSolid: "#c0392b", // a stronger, solid red used for e.g. fault/structure symbology and hard errors

  // Misc surfaces
  hoverBg: "#eef1f5",
  tooltipBg: "#dde1e6",
};
