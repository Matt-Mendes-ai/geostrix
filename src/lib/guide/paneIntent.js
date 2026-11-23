// TASKS.csv #4033 (guided modelling, #4015, docs/ideas/guided-modelling-design.md row 3) — the doors in the panes. The guide opens a modelling pane
// FILLED IN: it leaves what it wants in ONE slot (setPaneIntent) and opens the pane; the pane takes it once, on opening (takePaneIntent(pane)), and
// applies it. A pane takes only an intent that names it (any other pane's call returns null and leaves the slot as it is), and an intent nobody takes
// in time is dropped, so one left behind cannot fill a pane the person opens a minute later. Nothing is run or added by an intent: it sets what the
// person would have set, and the person presses the button. Pure (no React); lib/guide/usePaneIntent.js is the hook the panes use.
//
//   { pane: "settings", area?: "all" | "checked", holes?: [hole ids], resolution?: n }      Model settings: the area, the holes ticked in it, the cells
//   { pane: "stack", addAll?: { mode: "modelling" | "logged" | "share", minPct?: n }, faults?: true | [fault keys] }   Strat. stack: Add all open on a choice; the faults block
//   { pane: "explicit", unit: "DIW" }                                                       Explicit surface: a surface started for the unit, its logged tops offered
export const INTENT_PANES = ["settings", "stack", "explicit"];
export const INTENT_TTL_MS = 30000; // a lazy pane may take a few seconds to load; a pane opened later than this by hand is not the guide's

let slot = null; // { ...intent, _at }
const listeners = new Set();

// the guide's door: leaves the intent (replacing any earlier one), or clears the slot when it names no pane that takes one
export function setPaneIntent(intent, now = Date.now()) {
  slot = intent && typeof intent === "object" && INTENT_PANES.includes(intent.pane) ? { ...intent, _at: now } : null;
  for (const fn of [...listeners]) fn();
}

// the pane's side: the intent when it is this pane's, once (the slot is emptied), else null with the slot untouched
export function takePaneIntent(pane, now = Date.now()) {
  if (!slot || slot.pane !== pane) return null;
  const { _at, ...intent } = slot;
  slot = null;
  return now - _at <= INTENT_TTL_MS ? intent : null;
}

// a pane that is already open learns that an intent arrived (the open-pane action does not remount it): fn() runs on every setPaneIntent; -> unsubscribe
export function subscribePaneIntent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// what each pane reads out of its intent, checked: a value that does not fit is left out rather than guessed
const num = (v) => (v === "" || v == null ? NaN : Number(v));
// Model settings: the slider is 12 - 64 in steps of 4 (cells per side)
// The guide's own words are read too: its Area step's asks carry `suggest` ('whole' | 'group'), `group` ({ ids, n }) and `resolution`
export function settingsIntent(it) {
  const out = {};
  const holes = Array.isArray(it?.holes) ? it.holes : it?.suggest !== "whole" && Array.isArray(it?.group?.ids) ? it.group.ids : null;
  if (it?.area === "all" || it?.area === "checked") out.area = it.area;
  else if (it?.suggest === "whole") out.area = "all";
  if (holes?.length && out.area !== "all") { out.holes = holes.map(String); out.area = "checked"; }
  const r = num(it?.resolution);
  if (Number.isFinite(r)) out.resolution = Math.min(64, Math.max(12, Math.round(r / 4) * 4));
  return out;
}
// Strat. stack: the choice Add all opens on ('share' = the logged codes with at least minPct % of the logged metres), and the faults block (true, or the keys to add)
export function stackIntent(it) {
  const out = {};
  const a = it?.addAll;
  if (a && typeof a === "object" && ["modelling", "logged", "share"].includes(a.mode)) {
    out.addAll = { mode: a.mode };
    const p = num(a.minPct);
    if (Number.isFinite(p)) out.addAll.minPct = Math.min(100, Math.max(0, p));
  }
  if (it?.faults === true) out.faults = [];
  else if (Array.isArray(it?.faults)) out.faults = it.faults.map(String);
  return out;
}
// Explicit surface: the unit's name
export function explicitIntent(it) {
  const unit = typeof it?.unit === "string" ? it.unit.trim() : "";
  return unit ? { unit } : {};
}
