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
// withGroupCodes(groups, id, codes) -> the groups with `id`'s codes replaced, and those codes removed from every other group
export function withGroupCodes(groups, id, codes) {
  const mine = new Set(codes || []);
  return (groups || []).map((g) => (g.id === id ? { ...g, codes: [...mine] } : (g.codes || []).some((c) => mine.has(c)) ? { ...g, codes: g.codes.filter((c) => !mine.has(c)) } : g));
}
