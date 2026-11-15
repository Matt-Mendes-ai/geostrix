// TASKS.csv #2584 (Matt's decision, 2026-11-11) — where the ground between the collars stands in for a terrain, a pit's benches put
// collars of different levels side by side; collarGround (lib/pitShell.js collarBenches) then uses the lowest collar there and leaves
// the higher ones out. Every tool that uses that ground says so (components/CollarLevelsNote.jsx), with the check's own thresholds.
// TASKS.csv #2962 — the collars the ground leaves out are named: those whose elevation is not ground (#3004's rule), then those on a
// bench. Pure (moved here from CollarLevelsNote.jsx so it can be tested in Node).
// TASKS.csv #3551 — and first the collars left out as underground drilling (collarGround.js undergroundCollars), with why. From collarGround.js,
// not pitShell.js (the pit solver is not needed for a sentence).
import { collarBenches, undergroundCollars, surfaceCollars } from "./collarGround.js";
import { t as tr } from "./i18n.js";

const idList = (list) => list.slice(0, 8).map((c) => c.hole_id ?? "?").join(", ") + (list.length > 8 ? ", …" : "");
// u: undergroundCollars(...). -> one sentence, or null when none
export function undergroundCollarsText(u) {
  if (!u?.ids?.size) return null;
  const ids = [...u.ids.keys()];
  return tr("{n} collar(s) look like underground drilling: {t} by their hole type (UDDH, UG …), {u} starting upward, {d} drilled flat or upward from a station far below a collar nearby ({ids}).", { n: ids.length.toLocaleString(), t: u.typed.toLocaleString(), u: u.upward.toLocaleString(), d: u.under.toLocaleString(), ids: idList(ids.map((hole_id) => ({ hole_id }))) });
}
export function collarLevelsText(collars, survey) {
  const ug = undergroundCollars(collars, survey);
  const ugText = ug.ids.size ? `${undergroundCollarsText(ug)} ${tr("They are left out of the ground between the collars.")}` : null;
  const b = collarBenches(surfaceCollars(collars, survey));
  const u = b.untrusted || [];
  const untrustedText = u.length ? tr("{n} collar(s) left out of the ground between the collars, their elevation not being ground (assumed at import, or suspect: 0 m among collars far from 0, or a stray): {list}.", { n: u.length, list: u.slice(0, 8).map((c) => `${c.hole_id ?? "?"} (${Number.isFinite(c.z) ? Math.round(c.z * 10) / 10 : "?"} m)`).join(", ") + (u.length > 8 ? ", …" : "") }) : null;
  const n = b.higher.length;
  if (!n) return [ugText, untrustedText].filter(Boolean).join(" ") || null;
  const args = { n, plan: b.planM, rl: b.rlM };
  const benchText = n === 1
    ? tr("1 collar has another collar within {plan} m in plan that is more than {rl} m lower (a pit or benches?): the ground between the collars uses the lower collar there and leaves this one out. A check by those two distances, not a survey: on a steep hillside it lowers real ground too. Load a terrain for the real surface.", args)
    : tr("{n} collars have another collar within {plan} m in plan that is more than {rl} m lower (a pit or benches?): the ground between the collars uses the lowest collar there and leaves these {n} out. A check by those two distances, not a survey: on a steep hillside it lowers real ground too. Load a terrain for the real surface.", args);
  return [ugText, untrustedText, `${benchText} ${tr("Left out: {list}.", { list: idList(b.higher) })}`].filter(Boolean).join(" ");
}
