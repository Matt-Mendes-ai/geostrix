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

// TASKS.csv #3959 part B — a legend's groups: a heading row and the rows after it until the next heading (rows before the first heading are
// a group with no label). -> [{ label, rows }]
export function legendGroupsOf(items) {
  const out = [];
  for (const it of items || []) {
    if (optsOf(it)?.heading) out.push({ label: String(it[0]), rows: [it] });
    else { if (!out.length) out.push({ label: null, rows: [] }); out[out.length - 1].rows.push(it); }
  }
  return out.filter((g) => g.rows.length);
}
// only the rows of the named groups (a split legend's own, when Load from view refills it); no names: all of them
export function keepGroups(items, labels) {
  if (!Array.isArray(labels) || !labels.length) return items;
  const want = new Set(labels);
  return legendGroupsOf(items).filter((g) => want.has(g.label)).flatMap((g) => g.rows);
}
const noBreakFirst = (rows) => (startsColumn(rows[0]) ? toggleColumnBreak([null, ...rows], 1).slice(1) : rows);

// 'Split into one legend per group': the legend becomes one legend element per group, bound to the same view, side by side to its right
// (a row of them; the next row when the paper's edge is reached). Each keeps its group's name (groupsShown) so Load from view refills it
// with that group only; its own height and columns start again. size(items) -> { w, h } of a legend of these rows (legendFit legendBoxSize).
// -> the new elements (fewer than two groups: null)
export function splitLegendByGroup(legend, { pageW = 1123, pageH = 794, margin = 20, gap = 12, size, newId = (i) => `${legend.id}_g${i + 1}` } = {}) {
  const groups = legendGroupsOf(legend?.items);
  if (groups.length < 2) return null;
  const parts = groups.map((g) => { const rows = noBreakFirst(g.rows); return { g, rows, ...size(rows) }; });
  // rows of them from (x0, y0), a new row when the paper's right edge is reached: -> the boxes, and whether all are on the paper
  const lay = (x0, y0) => {
    let x = x0, y = y0, rowH = 0, fits = true;
    const at = parts.map((p, i) => {
      if (i > 0 && x + p.w > pageW - margin) { x = x0; y += rowH + gap; rowH = 0; }
      const box = { x, y };
      if (x + p.w > pageW - margin || y + p.h > pageH - margin) fits = false;
      x += p.w + gap; rowH = Math.max(rowH, p.h);
      return box;
    });
    return { at, fits };
  };
  // where the legend is; else moved left, then up, until every part is on the paper (none such: where the legend is, the user moves them)
  const lx = Number(legend.x) || 0, ly = Number(legend.y) || 0;
  let best = lay(lx, ly);
  for (const y0 of [ly, margin]) {
    if (best.fits) break;
    for (let x0 = lx; x0 >= margin; x0 -= 40) { const t = lay(x0, y0); if (t.fits) { best = t; break; } }
    if (!best.fits && lay(margin, y0).fits) best = lay(margin, y0);
  }
  return parts.map((p, i) => ({ ...legend, id: i === 0 ? legend.id : newId(i), items: p.rows, loadedItems: p.rows, x: best.at[i].x, y: best.at[i].y, w: p.w, h: undefined, legendCols: undefined, groupsShown: p.g.label != null ? [p.g.label] : [] }));
}

// 'Join legends': the legends bound to the same view, in reading order (top to bottom, then left to right), become the first one again with
// all their rows; the others go. -> { joined, removed: [ids] } (fewer than two: null)
export function joinLegends(legends) {
  const list = (legends || []).filter(Boolean).slice().sort((a, b) => (Math.abs((a.y || 0) - (b.y || 0)) > 8 ? (a.y || 0) - (b.y || 0) : (a.x || 0) - (b.x || 0)));
  if (list.length < 2) return null;
  const items = list.flatMap((l) => l.items || []);
  const first = list[0], joined = { ...first, items, loadedItems: items, w: undefined, h: undefined }; // sized by its rows again
  delete joined.groupsShown;
  return { joined, removed: list.slice(1).map((l) => l.id) };
}

// 'Load from view' made new rows: the breaks of the rows it had, put back on the rows of the same label (a label gone: its break goes too)
export function carryColumnBreaks(oldItems, newItems) {
  const at = new Set((oldItems || []).filter(startsColumn).map((it) => String(it[0])));
  if (!at.size) return newItems;
  let out = newItems || [];
  out.forEach((it, i) => { if (i > 0 && at.has(String(it?.[0])) && !startsColumn(it)) out = toggleColumnBreak(out, i); });
  return out;
}
