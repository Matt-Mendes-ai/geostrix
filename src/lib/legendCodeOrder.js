// TASKS.csv #3130 (split from #3021, review #2876 WA iron) — a legend loaded from a view lists each layer's codes alphabetically, so a strand
// log's stratigraphic order (hangingwall to footwall) had to be set again with the row arrows on every legend and after every 'Load from
// view'. The order the user sets with the arrows is recorded on the legend element (codeOrder: { group label: [row labels] }), saved with
// the layout, and every legend loaded from a view in the project takes it. Pure.

// rows: a legend's items ([label, colour, opt]); a { heading } row starts a group; notes, ramps and images are not codes.
// single: the group's label when the legend has one group (no heading). -> { label: [row labels in order] }
export function groupOrdersFromItems(items, single = null) {
  const out = {};
  let cur = single;
  for (const [label, , opt] of items || []) {
    if (opt?.heading) { cur = label; continue; }
    if (opt?.note || opt?.ramp || opt?.image || cur == null) continue;
    (out[cur] || (out[cur] = [])).push(label);
  }
  return out;
}

// groups (legendGroups' { label, items: [[label, colour, opt]], counts }) with each group's items in its recorded order: the recorded
// labels first, in that order, then the rest as they were (a code the order does not name, a new one, keeps its place after them)
export function applyCodeOrder(groups, orders) {
  if (!orders || !Object.keys(orders).length) return groups;
  return (groups || []).map((g) => {
    const order = orders[g.label];
    if (!order?.length || !g.items?.length || g.ramp || g.image) return g;
    const rank = new Map(order.map((l, i) => [l, i]));
    const idx = g.items.map((_, i) => i).sort((a, b) => (rank.get(g.items[a][0]) ?? Infinity) - (rank.get(g.items[b][0]) ?? Infinity) || a - b);
    return { ...g, items: idx.map((i) => g.items[i]), ...(g.counts ? { counts: idx.map((i) => g.counts[i]) } : {}) };
  });
}

// the orders recorded on every legend of the project's pages (layoutPages, with the open page's live elements in place of its stored ones);
// the legend being loaded is read last, so its own order wins. -> { label: [row labels] }
export function projectCodeOrders(pages, openPageId, openElements, legendId) {
  const all = [];
  for (const pg of pages || []) for (const el of (pg.id === openPageId ? openElements : pg.elements) || []) if (el?.type === "legend" && el.codeOrder) all.push(el);
  all.sort((a, b) => (a.id === legendId) - (b.id === legendId));
  return Object.assign({}, ...all.map((el) => el.codeOrder));
}
