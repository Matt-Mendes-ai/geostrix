// TASKS.csv #3794 — the top-cut note as one sentence in the reader's language: { text, heavy } | null (no estimate record: imported, calculated). topCutOf: side 2's #3783.
import { topCutOf } from "./topCutNote.js";
import { gradeUnitText } from "./pitShell.js";
import { t as tr } from "./i18n.js";

export function topCutText(params) {
  const t = topCutOf(params);
  if (!t) return null;
  if (t.kind === "uncapped") return { text: tr("Grades not top-cut: the highest samples entered the estimate at full grade."), heavy: false };
  const u = gradeUnitText(params?.unit || "", params?.element) || "";
  const head = tr("Grades top-cut at {cap} {unit} before estimating", { cap: t.cap, unit: u }).replace(/\s+/g, " ").trim();
  const tail = t.nSamples != null ? " " + tr("({n} of {m} samples cut{pct}).", { n: t.nCapped, m: t.nSamples, pct: t.pctMetal != null ? tr(", {p} % of the metal removed", { p: Math.round(t.pctMetal * 10) / 10 }) : "" }) : ".";
  return { text: head + tail, heavy: t.heavy };
}
