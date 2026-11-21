// TASKS.csv #3959 (Matt's first-time test: "I want to be able to split the legend into columns and rearrange it") — a Layout legend's rows
// are [label, colour, options]; a row whose options carry colBreak starts a new column (drawn with CSS break-before: column, counted by
// legendFit.js legendBoxFit). Breaks are kept by 'Load from view / section' (matched by the row's label), until the user clears them. Pure.

const optsOf = (it) => (it && typeof it[2] === "object" && it[2] ? it[2] : null);
export const startsColumn = (it) => !!optsOf(it)?.colBreak;
export const hasColumnBreaks = (items) => (items || []).some(startsColumn);

// a break on row i, or off: -> the new items (the others are the same arrays). The first row never takes one (it starts the first column).
export function toggleColumnBreak(items, i) {
  const list = items || [];
  if (i <= 0 || i >= list.length) return list;
  return list.map((it, j) => {
    if (j !== i) return it;
    const o = { ...(optsOf(it) || {}) };
    if (o.colBreak) delete o.colBreak; else o.colBreak = true;
    const head = [it[0], it[1] ?? null];
    return Object.keys(o).length ? [...head, o, ...it.slice(3)] : it.length > 3 ? [...head, null, ...it.slice(3)] : head;
  });
}

export function clearColumnBreaks(items) {
  if (!hasColumnBreaks(items)) return items;
  return (items || []).map((it, i) => (startsColumn(it) ? toggleColumnBreak([null, it], 1)[1] : it));
}

// 'Load from view' made new rows: the breaks of the rows it had, put back on the rows of the same label (a label gone: its break goes too)
export function carryColumnBreaks(oldItems, newItems) {
  const at = new Set((oldItems || []).filter(startsColumn).map((it) => String(it[0])));
  if (!at.size) return newItems;
  let out = newItems || [];
  out.forEach((it, i) => { if (i > 0 && at.has(String(it?.[0])) && !startsColumn(it)) out = toggleColumnBreak(out, i); });
  return out;
}
