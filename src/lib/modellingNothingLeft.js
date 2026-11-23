// TASKS.csv #4024 (Matt, WA bedded iron, v0.2.8) — a run that ends with 'Nothing left to model' said only 'see notices above for which columns to check', and the notices
// above sat behind 'Show all N messages' (the toast over the view shows the newest one). The reasons are collected as the run drops units, and the final message says them:
// which unit, how many points, and the columns. Pure (no React); modules/viewer/modellingRuns.js collects the reasons and says them.
import { t as tr } from "./i18n.js";

// -> { key: how many rows have a missing / non-numeric value in it } for the keys with at least one
export function invalidCounts(rows, keys, isFiniteNum) {
  const out = {};
  for (const r of rows || []) for (const k of keys) if (!isFiniteNum(r?.[k])) out[k] = (out[k] || 0) + 1;
  return out;
}

// { z: 3, dip: 2 } -> "z (3), dip (2)"; two maps (points', orientations') add up by column
export function columnsText(...maps) {
  const sum = {};
  for (const m of maps) for (const [k, n] of Object.entries(m || {})) if (n) sum[k] = (sum[k] || 0) + n;
  return Object.entries(sum).map(([k, n]) => `${k} (${n})`).join(", ");
}

// one reason a unit was left out -> a sentence
//   { kind: "invalid", label, n, columns }   every one of its n points had a missing / non-numeric value in these columns
//   { kind: "empty", label }                 it was given no contact points
//   { kind: "suspect", label, n, holes }     its n contacts were all on holes with a suspect collar elevation
//   { kind: "tooFew", label, before, after } after repeats and points on another surface were removed, `after` of its `before` points were left
export function reasonText(r) {
  if (r.kind === "invalid") return tr("{label}: all {n} point(s) have a missing or non-numeric value in {columns}; check those columns in the source file.", { label: r.label, n: r.n, columns: r.columns });
  if (r.kind === "suspect") return tr("{label}: its {n} contact(s) are on {holes} hole(s) whose collar elevation looks like a missing value, so they were left out.", { label: r.label, n: r.n, holes: r.holes });
  if (r.kind === "tooFew" && r.before === r.after) return tr("{label}: it has {after} contact point(s); a surface needs at least 2.", { label: r.label, after: r.after });
  if (r.kind === "tooFew") return tr("{label}: {after} of its {before} contact point(s) were left after removing repeated points and points on another surface; a surface needs at least 2.", { label: r.label, after: r.after, before: r.before });
  return tr("{label}: it has no contact points to use.", { label: r.label });
}

// -> the whole message: every unit that was left out and why (none given: the run was handed no units at all)
export function nothingLeftText(reasons) {
  const list = (reasons || []).map(reasonText);
  return tr("Nothing left to model: {why}", { why: list.length ? list.join(" ") : tr("no unit has contact points to use.") });
}
