// TASKS.csv #3110 (split from #2916) — the undo of a calculated element's Add as 'remove this element' instead of a snapshot of the whole
// assay table (about 60 MB at 148,000 samples). Its own small module: the store (startup) uses it, calcElement.js (the expression parser)
// loads with the Geochem tab. Pure.
// Safe only for an element that is NEW. True when any row already carries the symbol (a value, a below-detection mark or a qualifier):
// a re-run under the same name, or a name clashing with an imported element, where removing it would delete real data.
export function symbolPresent(assays, symbol) {
  const s = String(symbol);
  for (const a of assays || []) {
    if (a?.values && Object.prototype.hasOwnProperty.call(a.values, s)) return true;
    if (Array.isArray(a?.bdl) && a.bdl.includes(s)) return true;
    if (a?.qualifiers && Object.prototype.hasOwnProperty.call(a.qualifiers, s)) return true;
  }
  return false;
}

// the inverse of an Add: every row without the symbol's value, below-detection mark and qualifier (a row the Add left alone is returned as
// it is). The undo checks the token first (applyCalcUndo): the same table length, and the same number of rows carrying the symbol.
export function removeCalculatedElement(assays, symbol) {
  const s = String(symbol);
  return (assays || []).map((a) => {
    const hasV = a?.values && Object.prototype.hasOwnProperty.call(a.values, s), hasB = Array.isArray(a?.bdl) && a.bdl.includes(s), hasQ = a?.qualifiers && Object.prototype.hasOwnProperty.call(a.qualifiers, s);
    if (!hasV && !hasB && !hasQ) return a;
    const out = { ...a };
    if (hasV) { const { [s]: _v, ...rest } = a.values; out.values = rest; }
    if (hasB) out.bdl = a.bdl.filter((x) => x !== s);
    if (hasQ) { const { [s]: _q, ...rest } = a.qualifiers; out.qualifiers = rest; }
    return out;
  });
}

// how many rows carry the symbol (a value, a below-detection mark or a qualifier): the undo token records it after the Add, and the undo
// removes nothing unless the live table still has that many and the same length
export function rowsWithSymbol(assays, symbol) {
  const s = String(symbol);
  let n = 0;
  for (const a of assays || []) if ((a?.values && Object.prototype.hasOwnProperty.call(a.values, s)) || (Array.isArray(a?.bdl) && a.bdl.includes(s)) || (a?.qualifiers && Object.prototype.hasOwnProperty.call(a.qualifiers, s))) n++;
  return n;
}

// the undo token of an Add (store.jsx): the symbol, the table's length and the rows that carry the symbol after it
export const calcUndoToken = (assays, symbol) => ({ __inverse: { removeElement: String(symbol), rows: (assays || []).length, withSymbol: rowsWithSymbol(assays, symbol) } });

// the token applied to the live table: { assays } removed, or { failed: true } (the table no longer matches what the Add left: left as it is)
export function applyCalcUndo(token, live) {
  const t = token?.__inverse;
  if (!t || !Array.isArray(live) || live.length !== t.rows || rowsWithSymbol(live, t.removeElement) !== t.withSymbol) return { failed: true };
  return { assays: removeCalculatedElement(live, t.removeElement) };
}
