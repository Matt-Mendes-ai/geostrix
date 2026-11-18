// TASKS.csv #3897 (Matt, 2026-11-17: hide Mine Design, keep the code) — features that are built but switched off. The ONE switch is
// electron/features.json: the main process reads it for the native menu, and vite.config.js copies it into the app at build time as
// __GEOSTRIX_FEATURES__. Plain Node (the tests) has no build step, so there the switch reads as off, the shipped default.
/* global __GEOSTRIX_FEATURES__ */
const FEATURES = typeof __GEOSTRIX_FEATURES__ === "object" && __GEOSTRIX_FEATURES__ ? __GEOSTRIX_FEATURES__ : {};

// Mine Design (pit shell, pit design, nested pits, stopes, drifts / ramps, dumps, design strings): off, the tab, its menu item, its
// Help pages and the links into it are gone. Projects that hold its data still open, keep that data and save it back unchanged.
export const MINE_DESIGN_ENABLED = FEATURES.mineDesign === true;

// the tab ids switched off; a link, menu item or old request naming one opens the 3D View instead
export const HIDDEN_TABS = MINE_DESIGN_ENABLED ? [] : ["minedesign"];
