// TASKS.csv #3074 (#2900 (7), WA iron review) — the 3D View Holes list's 'By a collar field…' offered 'DrillholeType = RC' and 'hole type =
// Reverse circulation (RC)': two fields that split the holes the same way, listed twice; and no pick for the 58 holes with no type, which the
// colour legend counts as '(no value)'. For the Holes list only (collarAttrChoices itself is shared by other tools):
//   holeFieldPicks: a field whose values map one-to-one onto an earlier field's, over the same holes, is folded into it (listed as 'also');
//     each field says how many holes have no value in it;
//   noValuePick / holesWithoutField: the pick 'field=(no_value)' and the holes it lists.
export const NO_VALUE_TERM = "(no_value)";
const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/_/g, " ");
const valueOf = (c, key) => { const s = String(c?.attrs?.[key] ?? "").trim(); return s || null; };

function sameSplit(collars, a, b) {
  const ab = new Map(), ba = new Map();
  for (const c of collars || []) {
    const x = valueOf(c, a), y = valueOf(c, b);
    if ((x == null) !== (y == null)) return false;
    if (x == null) continue;
    if ((ab.has(x) && ab.get(x) !== y) || (ba.has(y) && ba.get(y) !== x)) return false;
    ab.set(x, y); ba.set(y, x);
  }
  return ab.size > 0;
}

// choices: collarAttrChoices(collars). -> [{ key, values, also: [keys folded in], missing: holes with no value }]
export function holeFieldPicks(collars, choices) {
  const out = [];
  for (const ch of choices || []) {
    const twin = out.find((o) => sameSplit(collars, o.key, ch.key));
    if (twin) { twin.also.push(ch.key); continue; }
    out.push({ key: ch.key, values: ch.values, also: [], missing: (collars || []).filter((c) => valueOf(c, ch.key) == null).length });
  }
  return out;
}

export const noValuePick = (key) => `${String(key).trim().replace(/\s+/g, "_")}=${NO_VALUE_TERM}`;

// a 'field=(no_value)' filter -> the collars with no value in that field (any field whose name reads the same, #2488); anything else -> null
export function holesWithoutField(collars, filter) {
  const s = String(filter ?? "").trim();
  if (!s.endsWith(`=${NO_VALUE_TERM}`)) return null;
  const k = norm(s.slice(0, s.length - NO_VALUE_TERM.length - 1));
  if (!k) return null;
  return (collars || []).filter((c) => !Object.keys(c?.attrs || {}).some((x) => norm(x) === k && String(c.attrs[x] ?? "").trim()));
}
