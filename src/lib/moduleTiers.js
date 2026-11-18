// TASKS.csv #3890 (Matt, 2026-11-17) — the module tabs in two groups: Basic (StrixViewer, Maps, Layout) first, a thin divider, then
// Advanced (Geological Mapping, 3D Modelling, Geochem, Geophysics, Targeting). Nothing folds: every tab shows, in Simple mode too. Each
// group has a caption and a 3 px stripe on its tabs (green Basic, blue Advanced: --color-tier-*), so the meaning never rests on colour
// alone. Pure (no React): App.jsx draws what groupModules returns, and Ctrl+1..n follow tabOrder (electron/main.js and
// ShortcutsModal.jsx list the same order; test/menu pins it). Tab ids are unchanged, so projects and links are unaffected.

export const TIERS = ["basic", "advanced"];
export const TIER_CAPTION = { basic: "Basic", advanced: "Advanced" }; // English keys, translated where drawn
export const TIER_GROUP_LABEL = { basic: "Basic modules", advanced: "Advanced modules" };

// modules: [{ id, tier, ... }] in their drawing order; hidden: tab ids switched off (src/lib/features.js HIDDEN_TABS, #3897)
// -> [{ tier, modules }] Basic then Advanced, each in the given order; a hidden tab or an empty group left out
export function groupModules(modules, hidden = []) {
  for (const m of modules) if (!TIERS.includes(m.tier)) throw new Error(`module ${m.id} has no tier`);
  return TIERS.map((tier) => ({ tier, modules: modules.filter((m) => m.tier === tier && !hidden.includes(m.id)) }))
    .filter((g) => g.modules.length);
}

// the tab ids as drawn, left to right in English: what Ctrl+1, Ctrl+2, ... open
export const tabOrder = (modules, hidden = []) => groupModules(modules, hidden).flatMap((g) => g.modules.map((m) => m.id));
