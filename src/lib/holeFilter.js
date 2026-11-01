// TASKS.csv #1316 — the hole list's filter: parts of a hole id, separated by commas or spaces; a hole matches any of them.
export function holesMatching(ids, filter) {
  const terms = String(filter || "").toLowerCase().split(/[,\s]+/).filter(Boolean);
  if (!terms.length) return ids;
  return ids.filter((id) => { const s = String(id).toLowerCase(); return terms.some((t) => s.includes(t)); });
}

// The visibility map after an action on the listed holes. A hole is hidden only when its entry is false, so "show" clears the listed ones.
export function visibilityPatch(visible, ids, listed, mode) {
  const next = { ...visible };
  if (mode === "only") { const keep = new Set(listed); for (const id of ids) next[id] = keep.has(id); return next; }
  for (const id of listed) next[id] = mode !== "hide";
  return next;
}

// TASKS.csv #1315 — the holes a tool should use when it follows the hole list. No entry means shown.
export const tickedHoles = (rows, visible, key = "hole_id") => rows.filter((r) => visible?.[r[key]] !== false);
