// TASKS.csv #830 / #831 / #832 — which modelling unit an explicit surface bounds, whether it is that unit's upper or
// lower contact, and which layer of the unit (A, B, C... when one unit occurs as several separate layers in the stack).
// Matt: "tell the software whether a contact is upper or lower contact … reassign a surface to another modelling unit …
// split the unit into A, B, C, etc. Considering there could be numerous individual layers of the same unit".
// A surface made before #830 has none of these fields: it is the upper contact of a unit named after itself, as before.
// Pure: no React, no three.js.

export const unitOf = (def) => (def?.unit || def?.name || "").trim();
export const contactOf = (def) => (def?.contact === "lower" ? "lower" : "upper");
// the unit as the block model names it: "Basalt A" for layer A of Basalt, "Basalt" when it is not split
export const layerLabel = (def) => (def?.layer ? `${unitOf(def)} ${def.layer}` : unitOf(def));

// A, B, ... Z, AA, AB, ...
export function layerLetter(i) {
  let s = "";
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
}

// The units in use, each once (first-made first), with their surfaces grouped by layer:
// [{ unit, layers: [{ layer, upper: [def], lower: [def] }] }]; the unsplit part of a unit has layer "".
export function unitSummary(defs) {
  const out = new Map();
  for (const d of defs || []) {
    const u = unitOf(d);
    if (!u) continue;
    if (!out.has(u)) out.set(u, new Map());
    const L = out.get(u), k = d.layer || "";
    if (!L.has(k)) L.set(k, { layer: k, upper: [], lower: [] });
    L.get(k)[contactOf(d)].push(d);
  }
  return [...out].map(([unit, L]) => ({ unit, layers: [...L.values()].sort((a, b) => (a.layer.length - b.layer.length) || (a.layer < b.layer ? -1 : a.layer > b.layer ? 1 : 0)) }));
}

// Split one unit into layers by elevation: items [{ id, contact: "upper" | "lower", z (a typical elevation) }] ->
// { [id]: letter }. Walking down the stack, an upper contact opens a new layer; a lower contact closes the open layer
// (or is a layer of its own when that layer already has a lower contact, or when there is none). So
// upper, lower, upper, lower -> A, A, B, B; upper, upper -> A, B; lower, lower -> A, B.
export function splitByElevation(items) {
  const sorted = [...items].filter((it) => Number.isFinite(it.z)).sort((a, b) => b.z - a.z);
  const out = {};
  let n = -1, cur = null; // cur: { upper, lower } of the open layer
  for (const it of sorted) {
    if (it.contact === "lower") {
      if (!cur || cur.lower) { n++; cur = { upper: false, lower: false }; }
      cur.lower = true;
    } else {
      if (!cur || cur.upper || cur.lower) { n++; cur = { upper: false, lower: false }; }
      cur.upper = true;
    }
    out[it.id] = layerLetter(n);
  }
  return out;
}

// The next unused layer letter of a unit
export function nextLayer(defs, unit) {
  const used = new Set((defs || []).filter((d) => unitOf(d) === unit && d.layer).map((d) => d.layer));
  for (let i = 0; ; i++) if (!used.has(layerLetter(i))) return layerLetter(i);
}

// TASKS.csv #867 — the explicit surfaces that feed an implicit run of a unit: every surface whose unit (or name) is one
// of the run's tags and which is that unit's UPPER contact. Its points: the picks, the section lines tagged with its
// name (vertices, densified every `spacing` m) and the lines drawn on section images (likewise). -> { used: [{ name,
// points: [{ x, y, z }] }], lower: [names of matching lower contacts, left out] }
export function explicitInterfacePoints(defs, sections, tags, { spacing = 25, sectionLinesTaken = false } = {}) {
  const used = [], lower = [];
  const dens = (pts) => {
    const out = [];
    pts.forEach((p, i) => {
      out.push({ x: p.x, y: p.y, z: p.z });
      const q = pts[i + 1];
      if (!q) return;
      const k = Math.max(0, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) / spacing) - 1);
      for (let j = 1; j <= k; j++) { const t = j / (k + 1); out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t }); }
    });
    return out;
  };
  const ok = (p) => [p?.x, p?.y, p?.z].every(Number.isFinite);
  for (const d of defs || []) {
    if (!tags.has(unitOf(d)) && !tags.has(d.name)) continue;
    if (contactOf(d) === "lower") { lower.push(d.name); continue; }
    const pts = (d.picks || []).filter(ok).map((p) => ({ x: p.x, y: p.y, z: p.z }));
    // sectionLinesTaken: the run already took the section lines tagged with this name (the name is one of its tags)
    if (!(sectionLinesTaken && tags.has(d.name))) for (const s of sections || []) for (const c of s.contacts || []) if (c.unit === d.name && c.isUpperContact !== false && (!c.kind || c.kind === "contact")) pts.push(...dens((c.points || []).filter(ok)));
    for (const l of d.lines || []) if (l.pts?.length >= 2) pts.push(...dens(l.pts.filter(ok)));
    if (pts.length) used.push({ name: d.name, points: pts });
  }
  return { used, lower };
}
