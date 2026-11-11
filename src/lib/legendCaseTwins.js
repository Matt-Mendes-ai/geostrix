// TASKS.csv #2609 (review #2486, WA lithium) — a sheet legend listed a code once per spelling with the same swatch (Weathering: e, E, fr, FR,
// h, H ...: ten rows for five colours). Within a group, items whose labels differ only by case and share a colour become one row, under the
// spelling with the most intervals (else the first); their counts are added. Groups: legendGroups' { items: [[label, color, opt]], counts }.
export function mergeCaseTwins(groups) {
  return (groups || []).map((g) => {
    if (g.ramp || !Array.isArray(g.items) || g.items.length < 2) return g;
    const seen = new Map(), items = [], counts = g.counts ? [] : null;
    g.items.forEach((it, i) => {
      const [label, color, opt] = it;
      if (opt || typeof label !== "string") { items.push(it); if (counts) counts.push(g.counts[i]); return; }
      const key = `${label.toLowerCase()}|${color ?? ""}`;
      if (!seen.has(key)) { seen.set(key, items.length); items.push(it); if (counts) counts.push(g.counts[i] || 0); return; }
      const j = seen.get(key);
      if (counts) {
        const mine = g.counts[i] || 0;
        if (mine > counts[j]) items[j] = it; // the commoner spelling names the row
        counts[j] += mine;
      }
    });
    return items.length === g.items.length ? g : { ...g, items, ...(counts ? { counts } : {}) };
  });
}
