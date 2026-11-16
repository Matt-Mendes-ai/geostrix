import { rowsOf, lengthOf } from "./rowTable.js"; // TASKS.csv #3554
import { LAYER_META } from "./layers.js"; // TASKS.csv #3775 (3) — a layer's own name for has: / no:
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
// TASKS.csv #3278 (Galore review) — the menu's 'DH_HOLE_PURPOSE = Resource' listed 12 holes (Resource, Resource Confidence, Resource
// Expansion: the word match), and 'DH_AREA=CZNGL, DH_AREA=CZRPL' 0 (every field term had to match). For the 3D View's Holes list: a value
// some hole holds exactly matches exactly (a typed word that is no whole value still matches as a word, #1504), and terms on one field are
// joined by OR, different fields by AND. collarsMatching (the Layout drill plan, the Atlas) is unchanged.
export function collarsMatchingList(collars, filter) {
  const terms = String(filter || "").split(/[,\s]+/).filter(Boolean);
  const byField = new Map();
  for (const t of terms) { const i = t.indexOf("="); if (i < 0) continue; const k = norm(t.slice(0, i)); if (k) (byField.get(k) || byField.set(k, []).get(k)).push(norm(t.slice(i + 1))); }
  if (!byField.size) return collarsMatching(collars, filter);
  const idTerms = terms.filter((t) => !t.includes("=")).map(norm);
  const attrsOf = (c, k) => { const a = c?.attrs || {}; return Object.keys(a).filter((x) => norm(x) === k).map((x) => norm(a[x])); }; // #2488
  const fields = Array.from(byField, ([k, vs]) => {
    const held = new Set(); for (const c of collars || []) for (const got of attrsOf(c, k)) held.add(got);
    return [k, vs.map((v) => [v, held.has(v)])];
  });
  return (collars || []).filter((c) => {
    if (idTerms.length && !idTerms.some((t) => norm(c.hole_id).includes(t))) return false;
    return fields.every(([k, vs]) => attrsOf(c, k).some((got) => vs.some(([v, exact]) => got === v || (!exact && got.split(/[^a-z0-9.]+/).includes(v)))));
  });
}

// TASKS.csv #3554 (Fireweed rehearsal, Macpass) — 'year >= 2017' took seven menu picks, a typed 'year>=2017' listed nothing without a word, and the
// 127 holes with no assays could not be picked at all. Terms the box now reads besides ids and 'field=value':
//   year>=2017  year>2016  length<=300  length>300   a number compared with a collar field whose value reads as one (a collar's own length,
//                                                    depth, z, x, y too); the terms AND together, so 'year>=2017 year<=2019' is a range;
//   year=2017..2023                                  the same range in one term (both ends in);
//   has:assays  no:assays  has:litho  no:sg ...      holes that do / do not appear in the assays or in a layer (holeSets, below).
// -> { numeric: [{ key, op, a, b }], sets: [{ has, name }], rest: the other terms as the text the existing rules read }
const CMP = /^([^<>=:,\s]+?)(>=|<=|>|<)(-?\d+(?:\.\d+)?)$/, RANGE = /^([^<>=:,\s]+?)=(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/, SETT = /^(has|no):(.+)$/i;
export function parseFilterTerms(filter) {
  const numeric = [], sets = [], rest = [];
  for (const t of String(filter || "").split(/[,\s]+/).filter(Boolean)) {
    let m;
    if ((m = SETT.exec(t))) sets.push({ has: m[1].toLowerCase() === "has", name: norm(m[2]) });
    else if ((m = RANGE.exec(t))) numeric.push({ key: norm(m[1]), op: "..", a: Math.min(+m[2], +m[3]), b: Math.max(+m[2], +m[3]) });
    else if ((m = CMP.exec(t))) numeric.push({ key: norm(m[1]), op: m[2], a: +m[3] });
    else rest.push(t);
  }
  return { numeric, sets, rest: rest.join(" ") };
}
// the number a collar holds in a field: its own (length, depth, z, x, y, elevation) or a collar attribute that reads as a number
const OWN = { length: "length", depth: "length", z: "z", elevation: "z", rl: "z", x: "x", y: "y", easting: "x", northing: "y" };
export function collarNumber(c, key) {
  const vals = [];
  const a = c?.attrs || {};
  for (const k of Object.keys(a)) if (norm(k) === key) vals.push(a[k]);
  if (!vals.length && OWN[key] && c?.[OWN[key]] != null) vals.push(c[OWN[key]]);
  // TASKS.csv #3775 (3) — on fan drilling a filter by direction is the natural one: 'dip<-60' (steeper than 60° down, as the collar table prints it: negative down) and 'azimuth>180' read the collar's own
  // dip and azimuth (from its first survey station when the file gave none, as the collar table does: collarsWithSurveyOrient)
  if (!vals.length && (key === "dip" || key === "inclination") && Number.isFinite(c?.dip)) vals.push(-c.dip);
  if (!vals.length && (key === "azimuth" || key === "az" || key === "bearing") && Number.isFinite(c?.azimuth)) vals.push(c.azimuth);
  for (const v of vals) { const t = String(v ?? "").trim(); if (t !== "" && Number.isFinite(+t)) return +t; }
  return NaN;
}
const passes = (n, { op, a, b }) => Number.isFinite(n) && (op === ">=" ? n >= a : op === "<=" ? n <= a : op === ">" ? n > a : op === "<" ? n < a : n >= a && n <= b);
// the ids of the holes that appear in the assays and in each layer: { assays: Set, litho: Set ... } (rows with a hole_id), for 'has:' / 'no:'
const SETS_SEEN = new WeakMap();
export function holeSetsOf(assays, layers) {
  const key = Array.isArray(assays) || (assays && typeof assays === "object") ? assays : NO_SETS_KEY;
  const lm = layers && typeof layers === "object" ? layers : NO_SETS_KEY;
  let byLayers = SETS_SEEN.get(key);
  if (byLayers?.has(lm)) return byLayers.get(lm);
  const ids = (rows) => { const out = new Set(); for (const r of rowsOf(rows) || []) if (r?.hole_id != null) out.add(String(r.hole_id)); return out; };
  const out = { assays: ids(assays) };
  for (const k of Object.keys(lm)) { const rows = lm[k]; if (lengthOf(rows) > 0) out[norm(k)] = ids(rows); }
  if (!byLayers) SETS_SEEN.set(key, (byLayers = new Map()));
  byLayers.set(lm, out);
  return out;
}
const NO_SETS_KEY = {};

// TASKS.csv #3555 / #3561 — the holes hidden in the Holes list (a hole is hidden only when its entry is false), and the traces of those shown
// (the same array when none is hidden)
export function hiddenHoleCount(collars, visibleHoles) { let n = 0; for (const c of collars || []) if (visibleHoles?.[c.hole_id] === false) n++; return n; }
export const fenceTracesOf = (traces, visibleHoles) => { const t = traces || []; return t.some((x) => visibleHoles?.[x.hole_id] === false) ? t.filter((x) => visibleHoles?.[x.hole_id] !== false) : t; };

// TASKS.csv #3690 (Fireweed rehearsal round 3) — 'year >= 2017' with spaces and 'prospect=Tom West' found nothing: the box split on every space. Spaces around an
// operator (>=, <=, >, <, =, ..) are dropped, and the words after a 'field=' that are plain words ('Tom West') are the rest of its value, joined as the menu
// writes it ('Tom_West'); an id term (it has a digit or a dash) or a term with an operator of its own ends the value.
export function tidyFilter(filter) {
  const s = String(filter || "").replace(/\s*(>=|<=|>|<)\s*/g, "$1").replace(/\s*\.\.\s*/g, "..").replace(/\s*=\s*/g, "=");
  return s.split(",").map((part) => {
    const toks = part.trim().split(/\s+/).filter(Boolean), out = [];
    for (let i = 0; i < toks.length; i++) {
      let tk = toks[i];
      if (/^[^<>=:]+=[^<>=:]*$/.test(tk) && !/\.\./.test(tk)) { while (i + 1 < toks.length && /^[A-Za-z][A-Za-z'’]*$/.test(toks[i + 1])) tk += "_" + toks[++i]; }
      out.push(tk);
    }
    return out.join(" ");
  }).join(",");
}

// TASKS.csv #3775 (3) — a has: / no: name that is a layer's label ('lithology' for litho, 'specific gravity' for sg) -> that layer's set key, else null
export function setKeyByLabel(name, holeSets) {
  const want = norm(name);
  for (const k of Object.keys(holeSets || {})) { const label = k === "assays" ? k : LAYER_META[k.replace(/ /g, "_")]?.label; if (label && norm(label) === want) return k; }
  return null;
}
// ctx: { holeSets } (holeSetsOf). -> { holes, byField, hint }: hint = null, or { kind: "set", names: [unknown set names] } / { kind: "none" } when a typed number or has / no term matched nothing
export function holesForFilter(collars, filter, ctx = {}) {
  filter = tidyFilter(filter); // #3690
  const p = parseFilterTerms(filter);
  if (!p.numeric.length && !p.sets.length) return plain(collars, filter);
  const base = plain(collars, p.rest);
  let holes = base.holes;
  for (const n of p.numeric) holes = holes.filter((c) => passes(collarNumber(c, n.key), n));
  const unknown = [];
  for (const s of p.sets) {
    const set = ctx.holeSets?.[s.name] || ctx.holeSets?.[setKeyByLabel(s.name, ctx.holeSets)]; // #3775 (3) — the menu says 'Holes with Lithology': the layer's own name finds its key (litho)
    if (!set) { unknown.push(s.name); holes = []; continue; }
    holes = holes.filter((c) => set.has(String(c.hole_id)) === s.has);
  }
  return { holes, byField: base.byField && !!holes.length, hint: unknown.length ? { kind: "set", names: unknown } : null };
}
function plain(collars, filter) {
  const holes = collarsMatchingList(collars, filter); // #3278
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
