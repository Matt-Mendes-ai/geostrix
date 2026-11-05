// TASKS.csv #1840 (review #1646, Kodiak) — a solid built from hand-picked surfaces quoted its volume as if measured: four picks on
// a chargeability model's faces became a 586.64 Mm3 'unit volume' to the box base, and two such surfaces a 1.07 km3 vein solid
// with a 'true thickness 296.8-660.8 m'. An explicit surface already records how much of it lies beyond its inputs
// (params.extrapolatedPct, #857); a solid built from surfaces that are mostly that says so beside its numbers.
import { errorNotice } from "./notices.js";
import { t as tr } from "./i18n.js";

// surfaces: the generated-surface list entries the solid came from -> [{ name, pct, picks, lines, furthestM }] for the explicit
// surfaces at least minPct % extrapolated
export function extrapolatedInputs(surfaces, minPct = 50) {
  return (surfaces || []).filter((s) => s && /^explicit_surface/.test(s.type || "") && Number(s.params?.extrapolatedPct) >= minPct)
    .map((s) => ({ name: s.name, pct: Math.round(Number(s.params.extrapolatedPct)), picks: Number(s.params.picks) || 0, lines: Number(s.params.sectionLines) || 0, furthestM: Number.isFinite(Number(s.params.furthestFromInputM)) ? Math.round(Number(s.params.furthestFromInputM)) : null }));
}
// -> a warning notice, or null when no input is mostly extrapolation
export function extrapolationNotice(surfaces, minPct = 50) {
  const list = extrapolatedInputs(surfaces, minPct);
  if (!list.length) return null;
  const parts = list.map((s) => tr("\"{name}\" is {p}% beyond its {k} pick(s) and {l} section line(s){far}", { name: s.name, p: s.pct, k: s.picks, l: s.lines, far: s.furthestM != null ? tr(" (up to {d} m from the nearest)", { d: s.furthestM }) : "" }));
  return errorNotice(tr("Mostly extrapolation: {list}. The volume and thickness above are those surfaces extended, not measured; add contacts where the solid matters.", { list: parts.join("; ") }));
}
