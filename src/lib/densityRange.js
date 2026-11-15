// TASKS.csv #3587 (Matt: '1-6 in both, editable') — the one plausible range of a density in t/m³ for Data QC, the import check and the tonnage tools (Grade-tonnage, Pit shell, Stopes, the
// tonnage of a solid): 1 to 6 by default, a project setting (project.densityRange = { min, max }) a user can raise for barite or massive sulphide. A value outside it is flagged in Data QC
// AND left out of the density mean, and the tonnage line says how many were left out. Before this Data QC used 1-6 and the tonnage tools 1-8, so six Macpass values above 6 went into the mean.
export const DEFAULT_DENSITY_RANGE = { min: 1, max: 6 };

// the range a project uses: its own when it is a sensible one (0 <= min < max), else the default
export function densityRangeOf(project) {
  const r = project?.densityRange, min = Number(r?.min), max = Number(r?.max);
  return r && Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max > min ? { min, max } : DEFAULT_DENSITY_RANGE;
}
export const isDefaultDensityRange = (r) => r?.min === DEFAULT_DENSITY_RANGE.min && r?.max === DEFAULT_DENSITY_RANGE.max;
