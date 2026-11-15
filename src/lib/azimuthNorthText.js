// TASKS.csv #3588 (6) (Fireweed rehearsal, Macpass) — which north a survey's azimuths were measured from was said once, in the import notice; a reopened
// project showed it nowhere and did not keep it. The import now records it on the project (project.azimuthNorth[target] = { ref, date }; saved with
// the project file as part of `project`, like dataCredit: old files simply have no such key), and the Survey row's tooltip reads it back.
import { t as tr } from "./i18n.js";

export function azimuthNorthText(project, target = "survey") {
  const a = project?.azimuthNorth?.[target];
  if (!a?.ref) return "";
  if (a.ref === "magnetic") return " " + tr("Azimuths were read from magnetic north ({date}) and converted to grid north.", { date: a.date || "?" });
  if (a.ref === "true") return " " + tr("Azimuths were read from true north and converted to grid north.");
  return " " + tr("Azimuths were read as grid north (no conversion).");
}
