// TASKS.csv #2584 (Matt's decision, 2026-11-11) — where the ground between the collars stands in for a terrain, a pit's benches put
// collars of different levels side by side; collarGround (lib/pitShell.js collarBenches) then uses the lowest collar there and leaves
// the higher ones out. Every tool that uses that ground says so (components/CollarLevelsNote.jsx), with the check's own thresholds.
// TASKS.csv #2962 — the collars the ground leaves out are named: those whose elevation is not ground (#3004's rule), then those on a
// bench. Pure (moved here from CollarLevelsNote.jsx so it can be tested in Node).
import { collarBenches } from "./pitShell.js";
import { t as tr } from "./i18n.js";

const idList = (list) => list.slice(0, 8).map((c) => c.hole_id ?? "?").join(", ") + (list.length > 8 ? ", …" : "");
export function collarLevelsText(collars) {
  const b = collarBenches(collars);
  const u = b.untrusted || [];
  const untrustedText = u.length ? tr("{n} collar(s) left out of the ground between the collars, their elevation not being ground (assumed at import, or suspect: 0 m among collars far from 0, or a stray): {list}.", { n: u.length, list: u.slice(0, 8).map((c) => `${c.hole_id ?? "?"} (${Number.isFinite(c.z) ? Math.round(c.z * 10) / 10 : "?"} m)`).join(", ") + (u.length > 8 ? ", …" : "") }) : null;
  const n = b.higher.length;
  if (!n) return untrustedText;
  const args = { n, plan: b.planM, rl: b.rlM };
  const benchText = n === 1
    ? tr("1 collar has another collar within {plan} m in plan that is more than {rl} m lower (a pit or benches?): the ground between the collars uses the lower collar there and leaves this one out. A check by those two distances, not a survey: on a steep hillside it lowers real ground too. Load a terrain for the real surface.", args)
    : tr("{n} collars have another collar within {plan} m in plan that is more than {rl} m lower (a pit or benches?): the ground between the collars uses the lowest collar there and leaves these {n} out. A check by those two distances, not a survey: on a steep hillside it lowers real ground too. Load a terrain for the real surface.", args);
  return [untrustedText, `${benchText} ${tr("Left out: {list}.", { list: idList(b.higher) })}`].filter(Boolean).join(" ");
}
