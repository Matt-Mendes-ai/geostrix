// TASKS.csv #3569 (Fireweed rehearsal) — what a Data QC row can be done with: opened in the data table at its interval, its hole found in 3D, and marked as checked (kept
// in the project file as project.qcChecked, shown dimmed or hidden the next time QC runs, reversible). Pure.
import { LAYER_META } from "./layers.js";
import { depthsInMessage } from "./dataTable.js";

// a row's identity across runs: its category, hole and message (the message carries the depths and the value)
export const qcKey = (issue) => `${issue.category}|${issue.holeId || ""}|${issue.message}`;

// the data table a category opens: Assays, or the interval layer whose label it is ('Specific gravity') -> a table source key, or null (collars, survey, custom: not a table here)
export function qcTableSource(category, layerLabels = LAYER_META) {
  if (category === "Assays") return "assays";
  for (const [k, m] of Object.entries(layerLabels)) if (m?.label === category && (m.kind === "interval" || m.kind === "point")) return k;
  return null;
}

// -> the request the data table is opened with: { source, hole, from, to } | null
export function qcTableRequest(issue) {
  const source = qcTableSource(issue.category);
  if (!source || !issue.holeId) return null;
  const d = depthsInMessage(issue.message);
  return { source, hole: String(issue.holeId), ...(d ? { from: d.from, to: d.to } : {}) };
}
