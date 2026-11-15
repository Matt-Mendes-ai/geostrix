// TASKS.csv #2584 (Matt's decision, 2026-11-11) — where the ground between the collars stands in for a terrain, a pit's benches put
// collars of different levels side by side; collarGround (lib/pitShell.js collarBenches) then uses the lowest collar there and leaves
// the higher ones out. Every tool that uses that ground says so (components/CollarLevelsNote.jsx), with the check's own thresholds.
// TASKS.csv #2962 — the collars the ground leaves out are named: those whose elevation is not ground (#3004's rule), then those on a
// bench. Pure (moved here from CollarLevelsNote.jsx so it can be tested in Node).
// TASKS.csv #3654 (3) — '(steep ground, benches or a pit?)': Macpass's four were surface holes on 25-29° slopes, not benches.
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
    ? tr("1 collar has another collar within {plan} m in plan that is more than {rl} m lower (steep ground, benches or a pit?): the ground between the collars uses the lower collar there and leaves this one out. A check by those two distances, not a survey: on a steep hillside it lowers real ground too. Load a terrain for the real surface.", args)
    : tr("{n} collars have another collar within {plan} m in plan that is more than {rl} m lower (steep ground, benches or a pit?): the ground between the collars uses the lowest collar there and leaves these {n} out. A check by those two distances, not a survey: on a steep hillside it lowers real ground too. Load a terrain for the real surface.", args);
  return [ugText, untrustedText, `${benchText} ${tr("Left out: {list}.", { list: idList(b.higher) })}`].filter(Boolean).join(" ");
}

// TASKS.csv #3653 (Fireweed re-test R1, Macpass) — the block model's record (params.cutAtTerrain) said '35 collar(s) with another collar within
// 15 m in plan over 5 m lower left out ... (benches)': collarBenches over EVERY collar, while the dialog (collarLevelsText) and the cut itself
// use the surface collars once the underground ones are set aside (53, then 4 on the bench check). The record's clause, from the same collars
// and the same checks, in English (a project record, not interface text). -> "" when the ground leaves no collar out
export function collarGroundRecord(collars, survey) {
  const ug = undergroundCollars(collars, survey);
  const b = collarBenches(surfaceCollars(collars, survey));
  const parts = [];
  if (ug.ids.size) parts.push(`${ug.ids.size} collar(s) set aside as underground drilling (${ug.typed} by hole type, ${ug.upward} starting upward, ${ug.under} drilled flat or upward from a station far below a collar nearby: ${idList([...ug.ids.keys()].map((hole_id) => ({ hole_id })))})`);
  const u = b.untrusted || [];
  if (u.length) parts.push(`${u.length} collar(s) left out whose elevation is not ground (${idList(u)})`);
  if (b.higher.length) parts.push(`${b.higher.length} surface collar(s) with another collar within ${b.planM} m in plan over ${b.rlM} m lower left out of that ground, so the lowest collar is used there (steep ground, benches or a pit: ${idList(b.higher)})`);
  return parts.length ? `; ${parts.join("; ")}` : "";
}
