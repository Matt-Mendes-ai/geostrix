// TASKS.csv #1128 / #1127 — Matt: "legend should be added in the layout, not in the cross section. as we should be able
// to move it around and edit it" and "let's have the legend subdivided in groups so it doesn't have to have
// \"lithology\" written in every legend". The section window no longer draws a key (#1043 did); a snapshot to Layout
// comes with a Layout legend bound to it, its rows grouped under a heading per layer.
//
// items: buildSectionPayload's legendItems, [["Lithology: Andesite", color], ["Structure planes: FRAC", color],
// ["Model: Unit A", color]] -> Layout legend rows: [heading, null, { heading: true }] then [label, color] for each group
// (no heading when there is one group, as legendGroupsToItems does). Rows already carrying options (a list grouped
// before) are returned unchanged, so this is safe to apply twice.
export function groupSectionLegend(items) {
  const rows = (items || []).filter((it) => it && it[0] != null);
  if (rows.some((it) => it[2])) return rows;
  const groups = new Map();
  for (const [label, color] of rows) {
    const s = String(label), i = s.indexOf(": ");
    const g = i > 0 ? s.slice(0, i) : "", name = i > 0 ? s.slice(i + 2) : s;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push([name, color]);
  }
  const multi = groups.size > 1, out = [];
  for (const [g, list] of groups) {
    if (multi && g) out.push([g, null, { heading: true }]);
    out.push(...list);
  }
  return out;
}
