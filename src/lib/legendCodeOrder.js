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

// TASKS.csv #3199 (split from #3130) — a recorded order only changed when the rows were moved again: 'Clear the set order' forgets it for
// the given groups on every legend of `elements` (the open page's; a legend left with no order loses the field). -> elements
export function clearCodeOrders(elements, groups) {
  const drop = new Set(groups || []);
  if (!drop.size) return elements;
  return (elements || []).map((el) => {
    if (el?.type !== "legend" || !el.codeOrder || !Object.keys(el.codeOrder).some((g) => drop.has(g))) return el;
    const rest = Object.fromEntries(Object.entries(el.codeOrder).filter(([g]) => !drop.has(g)));
    const { codeOrder: _gone, ...base } = el;
    return Object.keys(rest).length ? { ...base, codeOrder: rest } : base;
  });
}

// the other pages whose legends still record an order for one of `groups` (they would bring it back on the next 'Load from view': every
// legend of the project lends its order, projectCodeOrders). -> [page name]
export function pagesHoldingOrder(pages, openPageId, groups) {
  const want = new Set(groups || []);
  return (pages || []).filter((pg) => pg.id !== openPageId && (pg.elements || []).some((el) => el?.type === "legend" && el.codeOrder && Object.keys(el.codeOrder).some((g) => want.has(g)))).map((pg) => pg.name || pg.id);
}

// the groups a legend's rows are ordered by: its own record, and those of its loaded groups that `orders` (projectCodeOrders) names -> [label]
export function orderedGroupsOf(legend, orders) {
  const own = Object.keys(legend?.codeOrder || {});
  const lent = (legend?.loadedGroups || []).filter((g) => orders?.[g]?.length && !own.includes(g));
  return [...own, ...lent];
}

// TASKS.csv #3296 (from #2940, review #2876 WA iron) — the 3D View listed a layer's codes by count in its inspector and alphabetically on
// the figure legend (14 of 34 shown), and neither took the order set on a Layout legend (#3130). Both now use one order: the codes the
// project's set order names first, in that order, then the rest by count (commonest first), so the figure's cut keeps the commonest.
// groups: legendGroups' { label, items, counts } -> the same groups reordered (a group without counts keeps its order before the set one)
export function viewCodeOrder(groups, orders) {
  const byCount = (groups || []).map((g) => {
    if (!g?.counts || !g.items?.length || g.ramp || g.image) return g;
    const idx = g.items.map((_, i) => i).sort((a, b) => g.counts[b] - g.counts[a] || a - b);
    return { ...g, items: idx.map((i) => g.items[i]), counts: idx.map((i) => g.counts[i]) };
  });
  return applyCodeOrder(byCount, orders);
}

// the inspector's [value, count] entries (by count) with the group's set order first: labelOf(value) is the row label the order names
export function entriesInCodeOrder(entries, order, labelOf = (v) => v) {
  if (!order?.length || !entries?.length) return entries;
  const rank = new Map(order.map((l, i) => [l, i]));
  return entries.map((e, i) => [e, i]).sort((a, b) => (rank.get(labelOf(a[0][0])) ?? Infinity) - (rank.get(labelOf(b[0][0])) ?? Infinity) || a[1] - b[1]).map(([e]) => e);
}
