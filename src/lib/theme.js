// TASKS.csv #238 — software-design-specialist audit finding: "no design system (116 hardcoded hex
// colors, ~1000 inline style objects, zero CSS custom properties)." This file is the single source
// of truth for the color palette GeoStrix actually uses (extracted from real usage counts across
// src/ — grep'd quoted hex literals, not invented/guessed values).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE TWO FORMS, AND WHICH ONE TO USE WHERE  (the CSS-vs-JS boundary — read this before adding a
// color anywhere)
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Every value below exists in TWO forms that must stay in sync:
//   1. a CSS custom property `--color-<kebab-name>` declared on `:root` in styles/app.css
//   2. the JS constant `colors.<camelName>` in this file
//
// USE FORM 1 — `"var(--color-border)"` — for anything the BROWSER will style: app.css class rules,
// and inline `style={{}}` objects (a `var()` reference works fine as an inline style value, and is
// resolved by the CSS engine at computed-value time). This is the default and covers the large
// majority of the app. It is also the form that makes theming cheap: swapping the values on :root
// restyles the whole app with ZERO React re-renders, which matters for this project's standing
// performance priority — JS constants baked into inline styles would need every component to
// re-render to change a theme.
//
// USE FORM 2 — `colors.border` — only where the color is consumed as a JS *value* rather than by
// the CSS engine, because a `var()` reference is meaningless in those places:
//   • three.js material/scene colors (`new THREE.Color(...)`, `material.color.set(...)`,
//     `renderer.setClearColor(...)`) — WebGL, not CSS.
//   • canvas 2D drawing (`ctx.fillStyle`, `ctx.strokeStyle`).
//   • SVG *presentation attributes* in JSX (`fill="#..."`, `stroke="#..."`). Attributes don't
//     resolve `var()`; only the `style` property does. Use `fill={colors.textMuted}` there.
//   • any color that gets SERIALIZED OUT OF THE DOCUMENT — see the next paragraph.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE EXPORT BOUNDARY (a real trap this migration hit — don't undo it)
// ─────────────────────────────────────────────────────────────────────────────────────────────
// A CSS custom property does not survive leaving the document. Several components serialize a live
// <svg> subtree to a STANDALONE file (XMLSerializer -> .svg, or -> PNG via a blob URL): StripLog,
// SectionWindow, StereonetModal, FenceDiagramModal, DownholeStructurePlot, GeochemModule, and
// lib/striplogSvg.js (which builds SVG as a string). In an exported file there is no :root to
// resolve `var(--color-*)` against, so those colors would render unstyled. Those files therefore
// keep literal hex on purpose and were deliberately excluded from the var() migration. If you ever
// need a token there, inline the resolved value (form 2) — never a `var()` reference.
// Electron's printToPDF / window.print() paths (LayoutModule, the cross-section pop-out) are NOT
// affected: those print the live document, where :root is present.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// NOT A REBRAND
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Every value below is copied verbatim from its current, already-shipped usage. No color was
// changed, merged, or "cleaned up" — near-duplicate greys that differ by a shade got their own
// distinct names rather than being unified, because unifying them would be a visual change and this
// pass is a refactor, not a redesign. Values are grouped by the semantic role they already play
// (checked against real call sites, not guessed from the hex code alone).
//
// KNOWN NEAR-DUPLICATE CLUSTERS, left alone deliberately (documented here as the inventory output
// so a future pass can decide about them explicitly rather than by accident):
//   • muted greys: textSecondary #55606e / textFaint #6b7684 / textCaption #7b8794 /
//     textDisabled #9aa5b3 / textMuted #94a1b0 — five tones within ~20 units of each other.
//   • light rules/surfaces: border #d9dce1 / divider #dde1e6 / borderSubtle #e6e8eb /
//     hoverBg #eef1f5, plus a long tail of one-to-three-use light greys (#eceef1, #e0e3e8,
//     #eef1f4, #eef0f3, #f0f2f4, #e7e9ec, #e3e6ea, #f0f1f3) NOT tokenized here at all.
//   • bg #ffffff / bgSubtlest #fafbfc / bgInset #fbfbfc — the last two differ by one unit on one
//     channel and are almost certainly the same intent, but merging them is a (tiny) visual change
//     and so is out of scope for a refactor pass.
export const colors = {
  // Core surfaces
  bg: "#ffffff",
  bgSubtle: "#f4f5f7", // input fields, hover backgrounds, subtle panels
  bgSubtlest: "#fafbfc", // sub-toolbar background
  bgInset: "#fbfbfc", // chart/plot backdrop, inset note boxes

  // Borders
  border: "#d9dce1", // the standard border color — by far the most common single value in the app
  borderLight: "#c7ccd3", // secondary/lighter border (e.g. a disabled or de-emphasized control)
  divider: "#dde1e6", // tab bar / section divider, close to `border` but used distinctly
  borderSubtle: "#e6e8eb", // the lightest rule — table row separators

  // Text
  text: "#1a2028", // primary text
  textStrong: "#2a3340", // a slightly softer near-black used for table body text
  textSecondary: "#55606e", // labels, secondary body text — the single most-used color in the app
  textMuted: "#94a1b0", // placeholders, section-label uppercase captions, disabled text
  textFaint: "#6b7684", // a third, slightly different muted tone (tab labels, some captions)
  textCaption: "#7b8794", // small explanatory captions under controls
  textDisabled: "#9aa5b3", // the "hidden"/off state of a visibility toggle

  // Accent (gold — this app's primary brand/highlight color, used for active states and emphasis)
  accent: "#e2a63c",
  accentDark: "#8a6a1f", // modal titles, stronger emphasis on light backgrounds

  // Selection / info (blue)
  selectedBg: "#eaf1fa",
  selectedBorder: "#a9c6e0",
  info: "#4a9be0",
  primary: "#2f6fe0", // the solid/active blue (an engaged tool button, a bbox highlight)

  // Success / positive / primary-action (green) — this app's "primary button" color pair
  successBg: "#1e3629",
  successText: "#8fd9ab",
  successBorder: "#3d6b52",
  successBorderSoft: "#4a6b4a", // the softer green outline on the updater's own buttons

  // Danger / destructive / error (red)
  dangerBg: "#2a1f1f",
  dangerText: "#e0a0a0",
  dangerBorder: "#4a2f2f",
  dangerBorderStrong: "#5a2a2a", // an unmapped/invalid field's own border
  dangerIcon: "#8a5555",
  dangerIconStrong: "#a95555", // a brighter destructive icon (row delete)
  dangerSolid: "#c0392b", // a stronger, solid red used for e.g. fault/structure symbology and hard errors
  dangerAlt: "#d9534f", // an alternate error red used in residual/QA readouts

  // Warning / advisory (amber on cream — the "heads up, not an error" note box)
  warnBg: "#fdf4e6",
  warnBorder: "#edd9b7",
  warnText: "#7a4a1f",
  warnTextStrong: "#6b4e20",

  // Misc surfaces
  hoverBg: "#eef1f5",
  tooltipBg: "#dde1e6",
};
