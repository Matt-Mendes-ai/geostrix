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
export function splitLegendByGroup(legend, { pageW = 1123, pageH = 794, margin = 20, gap = 12, size, newId = (i) => `${legend.id}_g${i + 1}`, obstacles = [] } = {}) {
  const groups = legendGroupsOf(legend?.items);
  if (groups.length < 2) return null;
  const parts = groups.map((g) => { const rows = noBreakFirst(g.rows); return { g, rows, ...size(rows) }; });
  // the area of the page's other elements a box lies over (part C: the split parts go clear of the section, the title block ...)
  const cover = (x, y, w, h) => (obstacles || []).reduce((a, o) => (o ? a + Math.max(0, Math.min(x + w, o.x + o.w) - Math.max(x, o.x)) * Math.max(0, Math.min(y + h, o.y + o.h) - Math.max(y, o.y)) : a), 0);
  // from (x0, y0): in rows (the next row at the paper's right edge), or in columns (the next column at its bottom) -> the boxes, whether all
  // are on the paper, and how much of the page's other elements they cover
  const lay = (x0, y0, cols = false) => {
    let x = x0, y = y0, band = 0, fits = true, covered = 0;
    const at = parts.map((p, i) => {
      if (i > 0 && !cols && x + p.w > pageW - margin) { x = x0; y += band + gap; band = 0; }
      if (i > 0 && cols && y + p.h > pageH - margin) { y = y0; x += band + gap; band = 0; }
      const box = { x, y };
      if (x + p.w > pageW - margin || y + p.h > pageH - margin) fits = false;
      covered += cover(x, y, p.w, p.h);
      if (cols) { y += p.h + gap; band = Math.max(band, p.w); } else { x += p.w + gap; band = Math.max(band, p.h); }
      return box;
    });
    return { at, fits, covered };
  };
  // where the legend is; else moved left, then up, in rows or in columns: the first on the paper and clear of the page's other elements;
  // none clear: the one on the paper that covers the least; none on the paper: where the legend is (the user moves them)
  const lx = Number(legend.x) || 0, ly = Number(legend.y) || 0;
  const tries = [];
  for (const y0 of [ly, margin]) { for (let x0 = lx; x0 >= margin; x0 -= 40) tries.push([x0, y0]); tries.push([margin, y0]); }
  for (let y0 = ly + 40; y0 < pageH - margin; y0 += 40) tries.push([lx, y0], [margin, y0]);
  const laid = [...tries.map(([x0, y0]) => lay(x0, y0)), ...tries.map(([x0, y0]) => lay(x0, y0, true))];
  const onPaper = laid.filter((t) => t.fits);
  const best = onPaper.find((t) => t.covered === 0) || onPaper.sort((m, n) => m.covered - n.covered)[0] || lay(lx, ly);
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

// TASKS.csv #3959 part C — drag and drop. A row dragged onto another lands before it (onto the end: after the last row); a group heading
// dragged takes its whole group: dragged up, before the group the target row is in; dragged down, after it (or at the end). -> the new items (the same list when nothing
// moves). `to` is an index in the list as it is before the move; to === items.length means 'at the end'.
const groupSpan = (items, i) => { // [start, end) of the group holding row i
  let s = i; while (s > 0 && !optsOf(items[s])?.heading) s--;
  if (!optsOf(items[s])?.heading) s = 0;
  let e = i + 1; while (e < items.length && !optsOf(items[e])?.heading) e++;
  return [s, e];
};
export function moveLegendRow(items, from, to) {
  const list = items || [];
  if (from < 0 || from >= list.length || to < 0 || to > list.length) return list;
  if (optsOf(list[from])?.heading) return moveLegendGroup(list, from, to);
  if (to === from || to === from + 1) return list;
  const out = list.slice(), [row] = out.splice(from, 1);
  out.splice(to > from ? to - 1 : to, 0, row);
  return out;
}
export function moveLegendGroup(items, headingIndex, to) {
  const list = items || [];
  const [s, e] = groupSpan(list, headingIndex);
  if (s !== headingIndex) return list;
  // dragged up: before the group the target row is in; dragged down: after it (as a list's drag and drop goes)
  const [ts, te] = to >= list.length ? [list.length, list.length] : groupSpan(list, to);
  const dest = to >= list.length ? list.length : ts > s ? te : ts;
  if (dest >= s && dest <= e) return list; // onto itself
  const block = list.slice(s, e), rest = [...list.slice(0, s), ...list.slice(e)];
  const at = dest > s ? dest - block.length : dest;
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

// 'Load from view' made new rows: the breaks of the rows it had, put back on the rows of the same label (a label gone: its break goes too)
export function carryColumnBreaks(oldItems, newItems) {
  const at = new Set((oldItems || []).filter(startsColumn).map((it) => String(it[0])));
  if (!at.size) return newItems;
  let out = newItems || [];
  out.forEach((it, i) => { if (i > 0 && at.has(String(it?.[0])) && !startsColumn(it)) out = toggleColumnBreak(out, i); });
  return out;
}
