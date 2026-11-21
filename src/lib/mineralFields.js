// TASKS.csv #3941 — the little of Total sulphides the 3D build and the legend need at startup: the field's name and how a coded layer is drawn
// by a number field. The sulphide list, the totals and the panel are in lib/totalSulphides.js and load when the Mineralization panel opens.
import { fieldRamp } from "./customColour.js";

// the field the total is kept in on each row (project data: English); Identify, the Data table and exports show it like any field
export const TOTAL_SULPHIDES_FIELD = "Total sulphides (%)";

// how a coded layer's style draws it by a number field (the scene's part): -> null (as before) | { colourOf (or null: its codes' colours), shown(row) }
//   colourBy: a number field of the rows (its ramp); sulphideMin: only intervals whose Total sulphides reaches it
export function fieldStyler(rows, st) {
  if (!st || (!st.colourBy && !(st.sulphideMin > 0))) return null;
  const ramp = st.colourBy ? fieldRamp(rows, st.colourBy, st) : null, min = st.sulphideMin > 0 ? st.sulphideMin : null;
  if (!ramp && min == null) return null;
  return { colourOf: ramp ? ramp.colourOf : null, shown: min == null ? () => true : (r) => Number(r?.[TOTAL_SULPHIDES_FIELD]) >= min };
}
