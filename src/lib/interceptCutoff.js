// TASKS.csv #2513 (review #2486, WA lithium) — Best intercepts replaced a typed cut-off without a word when the element changed (0.4645 for Li
// became 2 on switching to Li2O). #1387 had made the change reset the cut-off so a number never crosses into another unit; it now resets
// only an untouched suggestion or on a change of unit, keeps a typed cut-off between two elements of one unit, and says what it did.
// state: { cutoff, typed (the user typed or picked it), fromUnit, toUnit, kept (the cut-off last used for the new element, or null),
// suggestion (the new element's suggested cut-off) } -> { cutoff, suggested (the new value is a suggestion), note: null | { kind, value } }
export function cutoffOnElementChange({ cutoff, typed, fromUnit, toUnit, kept = null, suggestion }) {
  if (kept != null) return { cutoff: kept, suggested: false, note: kept !== cutoff ? { kind: "restored", value: kept } : null };
  if (typed && (fromUnit || "ppm") === (toUnit || "ppm")) return { cutoff, suggested: false, note: { kind: "kept", value: cutoff } };
  return { cutoff: suggestion, suggested: true, note: typed && suggestion !== cutoff ? { kind: "reset", value: suggestion } : null };
}

// TASKS.csv #3069 (split from #2912) — Grade stats offers the cut-off last set in Best intercepts for the same element. This session only,
// by project name, element and unit: never saved, so a cut-off never crosses into another project or unit. A suggestion (the opening P90)
// is not remembered, only a cut-off the user typed or picked.
const lastSet = new Map();
const keyOf = (projectName, symbol, unit) => `${projectName ?? ""}\u0000${symbol}\u0000${unit || "ppm"}`;
export function rememberInterceptCutoff(projectName, symbol, unit, value) {
  if (!symbol) return;
  if (Number.isFinite(value) && value > 0) lastSet.set(keyOf(projectName, symbol, unit), value);
}
export function interceptCutoffFor(projectName, symbol, unit) {
  return lastSet.get(keyOf(projectName, symbol, unit)) ?? null;
}
