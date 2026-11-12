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

// TASKS.csv #1504 (review #1497, Lawyers) — the collar file's other columns are kept on each hole (attrs: year, drill_type, zone,
// status...), but nothing could pick holes by them. A filter term 'field=value' matches a collar attribute (field name and value
// case-insensitive, the value as a whole word or the whole value); id terms match any one of them, attribute terms must all match.
const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/_/g, " "); // "_" stands for a space in a typed term
export function collarsMatching(collars, filter) {
  const terms = String(filter || "").split(/[,\s]+/).filter(Boolean);
  const attrTerms = terms.filter((t) => t.includes("=")).map((t) => { const i = t.indexOf("="); return [norm(t.slice(0, i)), norm(t.slice(i + 1))]; }).filter(([k]) => k);
  const idTerms = terms.filter((t) => !t.includes("=")).map(norm);
  // TASKS.csv #2488 — every field whose name reads the same ('hole_type', the file's column, and 'hole type', the class beside it): the
  // first one found answered alone, so the class's picks matched 0 holes on a project that has both
  const attrsOf = (c, k) => { const a = c?.attrs || {}; return Object.keys(a).filter((x) => norm(x) === k).map((x) => norm(a[x])); };
  return (collars || []).filter((c) => {
    const id = norm(c.hole_id);
    if (idTerms.length && !idTerms.some((t) => id.includes(t))) return false;
    return attrTerms.every(([k, v]) => attrsOf(c, k).some((got) => got === v || got.split(/[^a-z0-9.]+/).includes(v)));
  });
}
// TASKS.csv #2960 (review #2876, WA iron) — one 'field=value' pick from a list of collar fields (collarAttrChoices), taken whole: the grade
// card's Holes list kept 'hole type=Reverse circulation (RC)' and collarsMatching split it on the spaces, so 'hole', 'circulation' and '(RC)'
// became hole-id terms and the card read no hole ('No hole of this set has a value of Si' on 6,029 assayed RC holes). Field and value are
// compared as collarsMatching does (case, '_' for a space, every field reading the same: #2488), the value as a whole. A pick with no '='
// is a typed filter (collarsMatching).
export function collarsWithPick(collars, pick) {
  const s = String(pick ?? ""), i = s.indexOf("=");
  if (i <= 0) return collarsMatching(collars, s);
  const k = norm(s.slice(0, i)), v = norm(s.slice(i + 1));
  return (collars || []).filter((c) => { const a = c?.attrs || {}; return Object.keys(a).some((x) => norm(x) === k && norm(a[x]) === v); });
}
// The same pick written as a typed filter term (spaces as '_', as the 3D View's hole list writes it, #2488), for a box that takes typed text
export const pickTerm = (key, value) => `${String(key).trim().replace(/\s+/g, "_")}=${String(value).trim().replace(/\s+/g, "_")}`;

// TASKS.csv #1703 (review #1645, Copley) — 'East Dome' typed in the 3D View's Holes filter found nothing although every collar carries
// PROSPECT. When plain text (no 'field=value' term) matches no hole id, the holes whose collar fields contain that text (case-insensitive,
// '_' as a space) are listed instead. -> { holes, byField } (byField: true when the fallback answered). The Layout drill plan keeps
// collarsMatching as it is.
export function holesForFilter(collars, filter) {
  const holes = collarsMatching(collars, filter);
  const text = norm(filter).replace(/\s+/g, " ");
  if (holes.length || !text || String(filter).includes("=")) return { holes, byField: false };
  const hits = (collars || []).filter((c) => Object.values(c?.attrs || {}).some((v) => norm(v).replace(/\s+/g, " ").includes(text)));
  return { holes: hits, byField: hits.length > 0 };
}

// The collar fields worth offering as a pick: 2 to 30 distinct values over the holes. -> [{ key, values: [...] }]
export function collarAttrChoices(collars, maxValues = 30) {
  const by = new Map();
  for (const c of collars || []) for (const [k, v] of Object.entries(c?.attrs || {})) { const s = String(v ?? "").trim(); if (!s) continue; if (!by.has(k)) by.set(k, new Set()); if (by.get(k).size <= maxValues) by.get(k).add(s); }
  return [...by.entries()].filter(([, s]) => s.size >= 2 && s.size <= maxValues).map(([key, s]) => ({ key, values: [...s].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) }));
}

// TASKS.csv #2536 — the holes whose collars lie in an E / N range (bounds in either order). -> { ids, width, height }
export function holesInRange(collars, { e0, e1, n0, n1 }) {
  const ea = Math.min(e0, e1), eb = Math.max(e0, e1), na = Math.min(n0, n1), nb = Math.max(n0, n1);
  const ids = (collars || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y) && c.x >= ea && c.x <= eb && c.y >= na && c.y <= nb).map((c) => c.hole_id);
  return { ids, width: eb - ea, height: nb - na };
}
