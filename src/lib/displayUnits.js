// TASKS.csv #3236 — a per-element display unit kept with the project: project.displayUnits = { [symbol]: "ppm" | "g/t" | "ppb" | "%" }.
// Display only: the stored values, the computations and the stored-unit export columns are unchanged; a tool that shows a converted value
// labels it with the unit shown, and an export that adds a shown-unit column names that unit. Plain units only: a value stored on an oxide
// basis ('% SiO2') or in any other unit is shown as stored. Kept apart from geochem.js (no imports) so the 3D legend can read it at startup.

export const DISPLAY_UNITS = ["ppm", "g/t", "ppb", "%"];
const PPM = { ppm: 1, "g/t": 1, ppb: 1e-3, "%": 1e4 }; // one unit in ppm

export const isPlainUnit = (u) => Object.prototype.hasOwnProperty.call(PPM, u);

// the unit an element is shown in: the project's choice when both it and the stored unit are plain, else the stored unit
export function displayUnitOf(project, symbol, storedUnit) {
  const u = project?.displayUnits?.[symbol];
  return u && isPlainUnit(u) && isPlainUnit(storedUnit) ? u : storedUnit;
}

// the factor from the stored unit to the shown one (1 when either is not plain)
export function displayFactor(storedUnit, shownUnit) {
  if (storedUnit === shownUnit || !isPlainUnit(storedUnit) || !isPlainUnit(shownUnit)) return 1;
  return PPM[storedUnit] / PPM[shownUnit];
}

// a stored value in the shown unit; the inverse, for a value typed in the shown unit (rounded so the box shows what was typed). Into a
// larger unit it divides (7,900 / 10,000 = 0.79, where 7,900 x 0.0001 is 0.7900000000000001)
const scale = (v, from, to) => (PPM[to] >= PPM[from] ? v / (PPM[to] / PPM[from]) : v * (PPM[from] / PPM[to]));
export function toDisplay(v, storedUnit, shownUnit) {
  return v == null || displayFactor(storedUnit, shownUnit) === 1 || !Number.isFinite(Number(v)) ? v : scale(Number(v), storedUnit, shownUnit);
}
export function fromDisplay(v, storedUnit, shownUnit) {
  return v == null || displayFactor(storedUnit, shownUnit) === 1 || !Number.isFinite(Number(v)) ? v : +scale(Number(v), shownUnit, storedUnit).toPrecision(12);
}

// a column-name-safe form of a unit, for an export's shown-unit column: avg_Cu_pct, avg_Au_ppb
export const unitSlug = (u) => ({ "%": "pct", "g/t": "gpt" })[u] || String(u).replace(/[^A-Za-z0-9]+/g, "_");
