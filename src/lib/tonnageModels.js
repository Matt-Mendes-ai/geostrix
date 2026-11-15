// TASKS.csv #1577 — the grade estimates a grade-tonnage table is offered for (GeoStrix's own and geoML), not a support index or a kriging
// variance, which are not grades. Moved here from components/GradeTonnageLauncher.jsx (#3594) so it can be tested in Node.
import { isGradeTonnageModel } from "./gradeTonnage.js";
import { isDensityModel } from "./densityFromModel.js";

export const isGradeEstimate = (m) => isGradeTonnageModel(m) && m?.cells?.length > 0 && (/^estimate-|^geoml$/.test(String(m.source || "")) || !!m.params?.element);
// TASKS.csv #3594 (Fireweed rehearsal, Macpass) — the table opened on the last model added, the density estimate: cut-offs in g/cc and a 'mean
// grade (g/cc)'. A density model is not a grade (the table offers it under 'Density by', #3012), so it is not listed; the table opens on the
// latest set's primary element (Zn of a Zn / Ag / Pb set), else the latest model.
export const tonnageModels = (voxelModels) => (voxelModels || []).filter((m) => isGradeEstimate(m) && !isDensityModel(m));
export function openingModel(models) {
  const last = models[models.length - 1], s = last?.params?.set;
  return (s && models.find((m) => m.params?.set?.id === s.id && m.params?.element === s.primary)) || last || null;
}
