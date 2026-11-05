// TASKS.csv #1966 — offline help. This file is small and loads at startup: which tool pane opens which help page (so the "?" in a
// pane header only shows where a page exists) and the event that opens the Help panel. The pages themselves (src/help/) load with
// the Help panel, on first use. Nothing here or there touches the network.

// The English pane title (as passed to TaskPaneHeader / paneHeader) -> help page id. test/help1966 checks that every pane title in
// the source has an entry here and that every id has a page.
export const PANE_HELP = {
  // Geophysics
  "Mag / gravity inversion (SimPEG)": "mag-grav-inversion",
  "DC resistivity / IP line (2D, SimPEG)": "dcip",
  "Voxel / block models": "block-models",
  "Point survey (CSV / XYZ)": "point-survey",
  "Terrain (SRTM / DEM)": "terrain",
  "3D view cell budget": "cell-budget",
  "Open Mining Format (.omf)": "omf",
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
  "geoML models": "geoml",
  "Section correlation": "section-correlation",
  "Model from map": "model-from-map",
  // 3D View and sections
  "3D slice": "slice-3d",
  "Section by coordinates": "section-by-coordinates",
  "Slice series (fence sections)": "slice-series",
  "Interpretation lines": "interpretation-lines",
  // Surface Geology
  "Geology map": "geology-map",
  "Outcrop structures": "outcrop-structures",
  // Targeting
  "Evidence overlay": "evidence-overlay",
  "Undrilled zones": "undrilled-zones",
  "Planned drillholes": "planned-drillholes",
  "Voxel value ranges": "voxel-ranges",
};

// The order the contents list shows the areas in
export const HELP_AREAS = ["Getting started", "Geophysics", "Maps", "Mine Design", "3D Modelling", "3D View", "Surface Geology", "Targeting"];

export const helpIdForPane = (title) => PANE_HELP[title] || null;

const EVENT = "geostrix:help";
// open the Help panel at a page (or at the contents with no id)
export function openHelp(id = null) {
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: { id } })); } catch (_) { /* no window (tests) */ }
}
export function onHelpOpen(cb) {
  const h = (e) => cb(e.detail?.id ?? null);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
