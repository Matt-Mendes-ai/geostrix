// TASKS.csv #3234 (split from #2673) — Select by location took a whole boundary; a claims file of several named blocks (#1767's partNames) could
// not be narrowed to one. Side 6's design: the part names offered when two or more are named; one part's polylines are the rings carrying
// that name (a feature's rings share one name, so a block with a hole keeps its hole). Pure.
// -> the distinct part names, in file order ([] when fewer than two)
export function partChoices(b) {
  const names = [...new Set((b?.partNames || []).filter(Boolean).map(String))];
  return names.length >= 2 ? names : [];
}
// -> the boundary narrowed to one named part ("" or an unknown name: the whole boundary)
export function boundaryPart(b, part) {
  if (!b || !part || !(b.partNames || []).some((n) => String(n) === part)) return b;
  return { ...b, name: `${b.name}: ${part}`, polylines: (b.polylines || []).filter((_, i) => String(b.partNames[i]) === part) };
}
