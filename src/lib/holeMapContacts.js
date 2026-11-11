// TASKS.csv #1718 (review #1645, Copley) — the drillholes' logged contacts in Model from map, beside the mapped ones. A hole logs its
// own codes (VANSS, LMST, ...) and the map its units (Hazelton Group, Limestone, ...): each code is assigned a map unit (an exact
// match, ignoring case and spaces, is suggested; the geologist sets the rest), then every change downhole from one modelled unit
// to another is a contact at that depth, and Model from map gives it to the same top as a map contact between those two units.
// Intervals with no unit (overburden, a dyke, an unlogged stretch) are passed over: the two units around them still meet, at the
// middle of the gap when it is short (MAX_GAP_M); a longer gap leaves the contact unplaced (counted). Pure: no React, no 3D.

export const MAX_GAP_M = 10;
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");

// codes: the logged codes; units: the map's units -> { code: unit | "" } (exact matches; "" = not used)
export function suggestCodeUnits(codes, units) {
  const byNorm = new Map(units.map((u) => [norm(u), u]));
  return Object.fromEntries(codes.map((c) => [c, byNorm.get(norm(c)) || ""]));
}

// the logged codes with their interval counts, most logged first -> [{ code, n }]
export function loggedCodes(rows) {
  const m = new Map();
  for (const r of rows || []) { const c = r?.value; if (c == null || c === "") continue; m.set(c, (m.get(c) || 0) + 1); }
  return [...m].map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n || String(a.code).localeCompare(String(b.code)));
}

// rows: litho intervals { hole_id, from, to, value }; codeUnit: { code: unit }; inStack(unit): the unit is in the order.
// -> { contacts: [{ hole_id, depth, upper, lower, row }], gaps (contacts left unplaced: the gap between the two was longer than
// maxGap), holes (holes with at least one contact) }
// TASKS.csv #2408 (review #2325, WA uranium) — the logged contacts against an order (youngest first): a contact agrees when its upper unit
// comes before its lower unit. -> { agree, against, worst: { upper, lower, n } | null } (worst: the commonest pair the other way up)
export function contactsAgainstOrder(contacts, order) {
  const at = new Map((order || []).map((u, i) => [u, i]));
  let agree = 0, against = 0;
  const pairs = new Map();
  for (const c of contacts || []) {
    const a = at.get(c.upper), b = at.get(c.lower);
    if (a === undefined || b === undefined) continue;
    if (a < b) { agree++; continue; }
    against++;
    const k = `${c.upper}\u0000${c.lower}`;
    pairs.set(k, (pairs.get(k) || 0) + 1);
  }
  let worst = null;
  for (const [k, n] of pairs) if (!worst || n > worst.n) { const [upper, lower] = k.split("\u0000"); worst = { upper, lower, n }; }
  return { agree, against, worst };
}

export function holeContacts(rows, codeUnit, inStack = () => true, { maxGap = MAX_GAP_M } = {}) {
  const byHole = new Map();
  for (const r of rows || []) {
    if (!Number.isFinite(r?.from) || !Number.isFinite(r?.to) || r.to <= r.from) continue;
    const u = codeUnit[r.value];
    if (!u || !inStack(u)) continue;
    if (!byHole.has(r.hole_id)) byHole.set(r.hole_id, []);
    byHole.get(r.hole_id).push({ ...r, unit: u });
  }
  const contacts = [];
  let gaps = 0;
  const holes = new Set();
  // TASKS.csv #2567 (review #2486) — a unit met in several runs down one hole (stacked pegmatite sheets: up to 45 contacts in a hole) gave
  // tops and bases alike to ONE stratigraphic top; counted here so the pane can say so: unit -> { holes, runs, maxRuns }
  const repeats = new Map();
  for (const [hole, list] of byHole) {
    list.sort((a, b) => a.from - b.from);
    // runs of one unit merged (two codes of one unit, or a unit logged in several intervals)
    const runs = [];
    for (const r of list) {
      const last = runs[runs.length - 1];
      if (last && last.unit === r.unit && r.from - last.to <= maxGap) { last.to = Math.max(last.to, r.to); continue; }
      runs.push({ unit: r.unit, from: r.from, to: r.to, row: r });
    }
    const perUnit = new Map();
    for (const r of runs) { const p = perUnit.get(r.unit) || { k: 0, m: 0 }; p.k++; p.m += r.to - r.from; perUnit.set(r.unit, p); }
    for (const [u, p] of perUnit) if (p.k >= 2) { const e = repeats.get(u) || { holes: 0, runs: 0, maxRuns: 0, metres: 0 }; e.holes++; e.runs += p.k; e.maxRuns = Math.max(e.maxRuns, p.k); e.metres += p.m; repeats.set(u, e); }
    for (let i = 1; i < runs.length; i++) {
      const a = runs[i - 1], b = runs[i];
      if (a.unit === b.unit) continue; // the same unit after a long gap: no contact between them
      const gap = b.from - a.to;
      if (gap > maxGap) { gaps++; continue; }
      contacts.push({ hole_id: hole, depth: gap > 0 ? (a.to + b.from) / 2 : b.from, upper: a.unit, lower: b.unit, row: b.row });
      holes.add(hole);
    }
  }
  return { contacts, gaps, holes: holes.size, repeats };
}
