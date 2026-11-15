// TASKS.csv #3595 (Fireweed rehearsal, Macpass) — what a density rests on, by the file's method column (lib/gradeTonnage.js sgSummary methods):
// at Tom West 1,760 of the 4,239 densities are REG (regressed from the grades), and the tonnage called them all 'measured'.
import { t as tr } from "./i18n.js";

// methods: { field, measured, calculated, other } -> one sentence
export function sgMethodsText(methods) {
  if (!methods) return "";
  const total = methods.measured + methods.calculated + methods.other;
  if (!total) return "";
  const pct = Math.round((100 * methods.calculated) / total);
  return methods.other
    ? tr("By the file's \"{field}\" column: {m} measured, {c} calculated ({p} %), {o} other.", { field: methods.field, m: methods.measured.toLocaleString(), c: methods.calculated.toLocaleString(), p: pct, o: methods.other.toLocaleString() })
    : tr("By the file's \"{field}\" column: {m} measured, {c} calculated ({p} %).", { field: methods.field, m: methods.measured.toLocaleString(), c: methods.calculated.toLocaleString(), p: pct });
}
