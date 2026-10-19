// TASKS.csv #704 — the sidebar's shared control styles, in one place so a new panel imports them instead of
// shipping bare Chromium defaults (the Predictive tab did). Values unchanged from ViewerModule.jsx, where they lived.
export const pBtn = { display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 10px", marginBottom: 6, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: "var(--font-size-base)", cursor: "pointer" };
export const smallSel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text)", fontSize: "var(--font-size-sm)", padding: "3px 4px" };
