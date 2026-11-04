// TASKS.csv #599 — modelling codes: what each logged interval IS for modelling, separate from what it was
// logged as. Matt: "assign a modelling code for each unit, keeping in mind there could be alternations of
// flows eg dacite and andesite alternating numerous times ... click on the unit in the modelling tab and
// connect to other unit in another drill hole". By default an interval's code is its logged code (or its
// #176 lithology group), so a project without overrides models exactly as before; the geologist overrides
// intervals (DAC -> DAC1 / DAC2 ...) and correlates them between holes.
// Contacts are taken where the code CHANGES down-hole, and only where the unit above is a real younger
// stratigraphic unit: the base of an intrusion, the foot of casing / overburden, a hole start or an unlogged
// gap are never "the top of X" (#495), and roles come from the code list, not from four hard-coded sample
// codes (#496). Pure (no three.js / React), tested in test/modellingCodes.test.mjs.
//
// The stored value (project field `modellingCodes`):
//   { codes:  [{ name, color, role, order }]   // order: smaller = younger (higher in the pile)
//     assign: { [rowKey]: codeName }            // per-interval overrides only
//     ties:   [{ a: rowKey, b: rowKey }] }      // drawn correlations between holes (display)

export const EMPTY_MODELLING_CODES = { codes: [], assign: {}, ties: [] };
export const CODE_ROLES = ["stratigraphic", "intrusion", "cross-cutting", "overburden", "ignore"];
// a unit with one of these roles directly above does NOT make the interval below it a stratigraphic top. TASKS.csv #1684 (review
// #1645, Copley) — overburden is the exception the callers choose: the contact under it is an erosional surface, the BASE of
// overburden, which is what the stack's unit directly below the overburden takes as its top (`underOverburden`), and what
// overburdenBases() lists for the overburden unit itself; on its own a unit's top is still not taken there (#495).
const NOT_A_TOP_ABOVE = new Set(["intrusion", "cross-cutting", "overburden", "ignore"]);
const EPS = 1e-3;

// An interval's identity: hole + depths (millimetre rounding), NOT its logged code, so an override
// survives a corrected lithology code.
export const rowKey = (r) => `${r.hole_id}|${Number(r.from).toFixed(3)}|${Number(r.to).toFixed(3)}`;

export function effectiveCode(row, mc, groupOf) {
  const o = mc?.assign?.[rowKey(row)];
  if (o) return o;
  const g = groupOf ? groupOf(row.value) : null;
  return g || String(row.value ?? "").trim();
}

// TASKS.csv #810 — does a row belong to a raw-code or group target (codes, named unitName)? Only an explicit override
// in `assign` changes the answer: re-coded INTO the unit it does, re-coded AWAY it does not; the default group
// mapping of effectiveCode is deliberately NOT applied (a group target already lists its member codes).
export function inTargetUnit(row, codes, unitName, assign) {
  const ov = assign?.[rowKey(row)];
  return ov ? (ov === unitName || codes.has(ov)) : codes.has(row.value);
}

export function codeInfo(mc, name, defaultRole = () => "stratigraphic") {
  const c = (mc?.codes || []).find((x) => x.name === name);
  return { name, role: c?.role || defaultRole(name), order: Number.isFinite(c?.order) ? c.order : null, color: c?.color || null };
}

// Per hole, top-down runs of one code: touching rows with the same effective code merge (row splits are
// not contacts, #354). A run records whether something touches it from above (`above`: the run above, or
// null at a hole start or below an unlogged gap).
export function codedRuns(lithoRows, mc, groupOf) {
  const byHole = new Map();
  (lithoRows || []).forEach((r) => {
    if (r == null || r.hole_id == null || !Number.isFinite(Number(r.from)) || !Number.isFinite(Number(r.to)) || !(Number(r.to) > Number(r.from))) return;
    if (!byHole.has(r.hole_id)) byHole.set(r.hole_id, []);
    byHole.get(r.hole_id).push(r);
  });
  const runs = [];
  byHole.forEach((rows, hole_id) => {
    rows.sort((a, b) => Number(a.from) - Number(b.from));
    let cur = null;
    rows.forEach((r) => {
      const code = effectiveCode(r, mc, groupOf);
      const from = Number(r.from), to = Number(r.to);
      if (cur && cur.code === code && Math.abs(from - cur.to) < EPS) { cur.to = Math.max(cur.to, to); cur.rows.push(r); return; }
      const touching = cur && Math.abs(from - cur.to) < EPS;
      const run = { hole_id, code, from, to, rows: [r], above: touching ? cur : null, holeStart: !cur };
      runs.push(run);
      cur = run;
    });
  });
  return runs;
}

// TASKS.csv #1367 — for a raw code or a lithology group: does this interval start right under rows that are never a younger unit
// (a fault, breccia, vein, dyke, no recovery, casing)? Then its start is not a top, as topsForCode decides for a modelling code.
// aboveValues: the logged codes that end where it starts (down-hole) or start where it ends (up-hole). Roles: the code's own
// in Modelling codes (by its group's name when grouped), else defaultRole(name).
export function startsBelowNonUnit(aboveValues, mc, groupOf, defaultRole, { underOverburden = false } = {}) {
  if (!aboveValues?.length) return false;
  return aboveValues.every((v) => {
    const role = codeInfo(mc, (groupOf && groupOf(v)) || String(v ?? "").trim(), defaultRole).role;
    return role === "overburden" ? !underOverburden : NOT_A_TOP_ABOVE.has(role);
  });
}
// TASKS.csv #1684 — does the interval start right under overburden only (its start is the base of overburden)?
export function startsBelowOverburden(aboveValues, mc, groupOf, defaultRole) {
  if (!aboveValues?.length) return false;
  return aboveValues.every((v) => codeInfo(mc, (groupOf && groupOf(v)) || String(v ?? "").trim(), defaultRole).role === "overburden");
}

// TASKS.csv #1684 — the BASES of overburden: where an overburden-role run ends and a logged run begins right below it, whatever
// that unit is (the one contact every hole shares: an erosional surface). `match`: the overburden code's name, a predicate on
// a run, or nothing (every run whose role is overburden). A run that ends at the hole end or above an unlogged gap has no base
// there (skipped.holeEnd); overburden directly on another overburden code continues it.
// -> { bases: [{ hole_id, md, above, below, row (the first row below), ovbRow (the last overburden row) }], skipped: { holeEnd } }
export function overburdenBases(runs, mc, defaultRole, match = null) {
  const isOvb = typeof match === "function" ? match : match ? (r) => r.code === match : (r) => codeInfo(mc, r.code, defaultRole).role === "overburden";
  const belowOf = new Map();
  runs.forEach((r) => { if (r.above) belowOf.set(r.above, r); });
  const bases = [], skipped = { holeEnd: 0 };
  runs.forEach((run) => {
    if (!isOvb(run)) return;
    const b = belowOf.get(run);
    if (!b) { skipped.holeEnd++; return; }
    if (codeInfo(mc, b.code, defaultRole).role === "overburden") return;
    bases.push({ hole_id: run.hole_id, md: run.to, above: run.code, below: b.code, row: b.rows[0], ovbRow: run.rows[run.rows.length - 1] });
  });
  return { bases, skipped };
}

// The tops ("Top of <code>" interface points) of one code, and why the other starts were not used. #1684: a start directly
// under overburden is counted apart (skipped.underOverburden), and is a top when `underOverburden` is on.
export function topsForCode(runs, code, mc, defaultRole, { underOverburden = false } = {}) {
  const me = codeInfo(mc, code, defaultRole);
  const tops = [];
  const skipped = { holeStart: 0, gap: 0, belowRole: 0, olderAbove: 0, underOverburden: 0 };
  runs.forEach((run) => {
    if (run.code !== code) return;
    if (run.holeStart) { skipped.holeStart++; return; }
    if (!run.above) { skipped.gap++; return; }
    const above = codeInfo(mc, run.above.code, defaultRole);
    if (above.role === "overburden") { if (!underOverburden) { skipped.underOverburden++; return; } }
    else if (NOT_A_TOP_ABOVE.has(above.role)) { skipped.belowRole++; return; }
    // both placed in the pile and the one above is OLDER: overturned, faulted repeat, or an up-hole
    if (me.order != null && above.order != null && above.order > me.order) { skipped.olderAbove++; return; }
    tops.push(run);
  });
  return { tops, skipped };
}

// Optional starting point for alternating sequences: within each hole, top-down, every run of a chosen
// base code gets base + n (DAC1, DAC2 ...). Only the intervals of `baseCodes` are touched; the numbering
// is per hole, so a flow that pinches out makes the numbers disagree between holes — which is what the
// geologist then fixes by connecting intervals. Returns a NEW assign map.
export function autoNumber(lithoRows, baseCodes, mc, groupOf) {
  const want = new Set(baseCodes);
  const assign = { ...(mc?.assign || {}) };
  const plain = { ...(mc || EMPTY_MODELLING_CODES), assign: {} }; // number from the logged / grouped code
  const counters = new Map(); // `${hole}|${base}` -> n
  codedRuns(lithoRows, plain, groupOf).forEach((run) => {
    if (!want.has(run.code)) return;
    const k = `${run.hole_id}|${run.code}`;
    const n = (counters.get(k) || 0) + 1;
    counters.set(k, n);
    run.rows.forEach((r) => { assign[rowKey(r)] = `${run.code}${n}`; });
  });
  return assign;
}

// Connect interval B (another hole) to interval A: B — and the touching rows of B's run — take A's code, and
// the pair is kept as a tie for drawing. Returns the new value.
export function connectIntervals(mc, rowA, rowB, lithoRows, groupOf) {
  const base = mc || EMPTY_MODELLING_CODES;
  const code = effectiveCode(rowA, base, groupOf);
  const run = codedRuns((lithoRows || []).filter((r) => r.hole_id === rowB.hole_id), base, groupOf)
    .find((x) => x.rows.some((r) => rowKey(r) === rowKey(rowB)));
  const assign = { ...base.assign };
  (run ? run.rows : [rowB]).forEach((r) => { assign[rowKey(r)] = code; });
  const ties = (base.ties || []).filter((t) => !(t.a === rowKey(rowA) && t.b === rowKey(rowB)) && !(t.b === rowKey(rowA) && t.a === rowKey(rowB)));
  ties.push({ a: rowKey(rowA), b: rowKey(rowB) });
  const codes = (base.codes || []).some((c) => c.name === code) ? base.codes : [...(base.codes || []), { name: code }];
  return { ...base, assign, ties, codes };
}

// A stack's own top-to-bottom order as the pile order, for the codes the code list hasn't placed. Every
// other entry of the code list (roles, colours, explicit orders) is kept as it is.
export function withPileOrder(mc, names) {
  const base = mc || EMPTY_MODELLING_CODES;
  if (!names?.length) return base;
  const list = (base.codes || []).map((c) => (names.includes(c.name) && !Number.isFinite(c.order) ? { ...c, order: 1000 + names.indexOf(c.name) } : c));
  names.forEach((n, i) => { if (!list.some((c) => c.name === n)) list.push({ name: n, order: 1000 + i }); });
  return { ...base, codes: list };
}

// Every code in use (effective codes of the rows), in pile order then name.
export function codesInUse(lithoRows, mc, groupOf, defaultRole) {
  const names = new Set();
  (lithoRows || []).forEach((r) => { const c = effectiveCode(r, mc, groupOf); if (c) names.add(c); });
  return [...names].map((n) => codeInfo(mc, n, defaultRole))
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}
