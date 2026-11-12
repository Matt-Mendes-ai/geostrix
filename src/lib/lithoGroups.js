// TASKS.csv #1685 (review #1645, Copley) — a lithology code belongs to at most one litho group. The chips of every group listed every
// code, so one click put VOLC in "Intrusive" as well as "Volcanic host"; Modelling codes then read the first group, the Implicit picker
// and the stack each group's own list, and the stack modelled 1,200 m of "intrusive" from 24 m of logged diorite.
// groupOverlaps(groups) -> [{ code, groups: [name, ...] }] for the codes in more than one group (a saved project's slip, said on open)
export function groupOverlaps(groups) {
  const where = new Map();
  for (const g of groups || []) for (const c of new Set(g.codes || [])) (where.get(c) || where.set(c, []).get(c)).push(g.name || "");
  return [...where].filter(([, names]) => names.length > 1).map(([code, names]) => ({ code, groups: names }));
}
// groupOfCode(groups, code, exceptId) -> the group (other than exceptId) that holds the code, or null
export function groupOfCode(groups, code, exceptId = null) {
  return (groups || []).find((g) => g.id !== exceptId && (g.codes || []).includes(code)) || null;
}
// TASKS.csv #2386 / #2427 (review #2325, WA uranium) — codes that differ only by case or surrounding spaces (Dcb / DCB / DCb, 1,032
// intervals) went to every tool as separate units. foldKey: the comparison key; caseVariantGroups(rows, groups): each set of 2+
// spellings of one key, none already in a group -> [{ name (the most logged spelling), codes (most logged first), counts, total }],
// largest first
export const foldKey = (v) => String(v ?? "").trim().toUpperCase();
export function caseVariantGroups(rows, groups = []) {
  const grouped = new Set((groups || []).flatMap((g) => g.codes || []));
  const byKey = new Map();
  for (const r of rows || []) {
    const raw = r?.value == null ? "" : String(r.value);
    const k = foldKey(raw);
    if (!k) continue;
    const m = byKey.get(k) || byKey.set(k, new Map()).get(k);
    m.set(raw, (m.get(raw) || 0) + 1);
  }
  const out = [];
  for (const m of byKey.values()) {
    if (m.size < 2 || [...m.keys()].some((c) => grouped.has(c))) continue;
    const codes = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
    out.push({ name: codes[0].trim(), codes, counts: Object.fromEntries(m), total: [...m.values()].reduce((s, n) => s + n, 0) });
  }
  return out.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
// withGroupCodes(groups, id, codes) -> the groups with `id`'s codes replaced, and those codes removed from every other group
export function withGroupCodes(groups, id, codes) {
  const mine = new Set(codes || []);
  return (groups || []).map((g) => (g.id === id ? { ...g, codes: [...mine] } : (g.codes || []).some((c) => mine.has(c)) ? { ...g, codes: g.codes.filter((c) => !mine.has(c)) } : g));
}
