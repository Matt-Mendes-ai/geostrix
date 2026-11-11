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
