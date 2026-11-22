// TASKS.csv #1966 — offline help. This file is small and loads at startup: which tool pane opens which help page (so the "?" in a
// pane header only shows where a page exists) and the event that opens the Help panel. The pages themselves (src/help/) load with
// the Help panel, on first use. Nothing here or there touches the network.

// The English pane title (as passed to TaskPaneHeader / paneHeader) -> help page id. test/help1966 checks that every pane title in
// the source has an entry here and that every id has a page.
import { MINE_DESIGN_ENABLED } from "./features.js"; // TASKS.csv #3897

export const PANE_HELP = {
  // Geophysics
  "Mag / gravity inversion (SimPEG)": "mag-grav-inversion",
  "DC resistivity / IP line (2D, SimPEG)": "dcip",
  "Voxel / block models": "block-models",
  "Point survey (CSV / XYZ)": "point-survey",
  "Terrain (SRTM / DEM)": "terrain",
  "3D view cell budget": "cell-budget",
  "Downhole logs": "downhole-logs", // TASKS.csv #1425
  "MT / AMT soundings (.edi)": "mt-soundings", // TASKS.csv #1989
  "FDEM 1D (DUALEM, GEM-2)": "fdem-1d", // TASKS.csv #1986
  "Open Mining Format (.omf)": "omf",
  "Magnetic survey (CSV / XYZ)": "magnetics", // TASKS.csv #3400 — the Surveys method buttons
  "Gravity survey (CSV / XYZ)": "gravity",
  "Radiometric survey (CSV / XYZ)": "radiometrics",
  "Electromagnetic surveys (EM)": "em-surveys",
  "TEM line data (multi-channel)": "tem-lines", // TASKS.csv #1986 step 1
  // Maps
  "Boundaries": "boundaries",
  "Map layers & outcrop structures": "map-layers",
  "Mineral claims / tenure": "claims",
  "Web layers (WMS / WFS)": "web-layers",
  // Mine Design
  "Pit shell": "pit-shell",
  "Pit design": "pit-design",
  "Nested pits": "nested-pits",
  "Stope outlines": "stope-outlines",
  "Drifts and ramps": "drifts-ramps",
  "Dump / stockpile": "dump-stockpile",
  "Design strings": "design-strings",
  // 3D Modelling
  "Model settings": "model-settings",
  "Lithology groups": "lithology-groups",
  "Modelling codes": "modelling-codes",
  "Implicit surface": "implicit-surface",
  "Stratigraphic stack": "stratigraphic-stack",
  "Explicit surface": "explicit-surface",
  "Structural modelling": "structural-modelling",
  "Vein / dyke modelling": "vein-dyke",
  "Alteration modelling": "alteration-modelling",
  "Grade shell": "grade-shell",
  "Grade estimation": "grade-estimation",
  "Grade × thickness": "grade-thickness", // TASKS.csv #3121 — opened from the Grade estimation pane; F1 and the Help search find it
  "geoML models": "geoml",
  "Section correlation": "section-correlation",
  "Model from map": "model-from-map",
  // 3D View and sections
  "3D slice": "slice-3d",
  "Section by coordinates": "section-by-coordinates",
  "Slice series (fence sections)": "slice-series",
  "Section window": "section-window", // TASKS.csv #4003 — the settings every section window offers
  "Interpretation lines": "interpretation-lines",
  "Unit polygons": "unit-polygons", // TASKS.csv #1439
  // Surface Geology
  "Geology map": "geology-map",
  "Outcrop structures": "outcrop-structures",
  // Targeting
  "Evidence overlay": "evidence-overlay",
  "Undrilled zones": "undrilled-zones",
  "Planned drillholes": "planned-drillholes",
  "Drill program": "drill-program", // TASKS.csv #3962 (P2) — the suggested program, in Planned drillholes
  "Voxel value ranges": "voxel-ranges",
  // Getting started and the data pages (TASKS.csv #3528) — the dialogs' own titles; their "?" opens them
  "First project": "first-project",
  "Import drillhole data": "import-drillholes",
  "Import assays": "import-assays",
  "Import density (Specific gravity)": "import-density",
  "Drillhole data QA/QC": "data-qc",
  "3D view basics": "view-basics", // TASKS.csv #3556 / #3578 — the everyday 3D view and the Geochem report tools
  "Downhole compositing": "downhole-compositing",
  "Best-intercept report": "best-intercepts", "Best intercepts": "best-intercepts", // TASKS.csv #3687 — the dialog and its page are both Best intercepts
  "Grade statistics": "grade-statistics",
  "QAQC — lab quality control": "qaqc",
  // TASKS.csv #3597 / #3603 / #3622 — the dialogs' own titles; their "?" opens them
  "Grade-tonnage": "grade-tonnage",
  "Block calculator": "block-calculator",
  "Unsampled metres inside a sampled hole": "unsampled-metres",
  "Layout": "layout",
  "Title block and tokens": "layout-title-block",
  "Plan view of the drillholes": "maps-plan-view",
  "Export: what goes where (Leapfrog, Micromine, GIS, Google Earth)": "export-formats",
  "Save, autosave and recovery; Undo": "save-recovery",
};

// The order the contents list shows the areas in
export const HELP_AREAS = ["Getting started", "Geophysics", "Maps", "Mine Design", "3D Modelling", "StrixViewer", "Geochem", "Layout", "Geological Mapping", "Targeting"]
  .filter((a) => a !== "Mine Design" || MINE_DESIGN_ENABLED); // TASKS.csv #3897 — Mine Design switched off

export const helpIdForPane = (title) => PANE_HELP[title] || null;

const EVENT = "geostrix:help";
// open the Help panel at a page (or at the contents with no id)
export function openHelp(id = null) {
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: { id } })); } catch (_) { /* no window (tests) */ }
}
// TASKS.csv #3534 — the shortcuts / About dialog, opened from inside the Help panel (the status bar's "?" opens Help itself now)
const SHORTCUTS_EVENT = "geostrix:shortcuts";
export function openShortcuts(tab = "shortcuts") {
  try { window.dispatchEvent(new CustomEvent(SHORTCUTS_EVENT, { detail: { tab } })); } catch (_) { /* no window (tests) */ }
}
export function onShortcutsOpen(cb) {
  const h = (e) => cb(e.detail?.tab || "shortcuts");
  window.addEventListener(SHORTCUTS_EVENT, h);
  return () => window.removeEventListener(SHORTCUTS_EVENT, h);
}
export function onHelpOpen(cb) {
  const h = (e) => cb(e.detail?.id ?? null);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
