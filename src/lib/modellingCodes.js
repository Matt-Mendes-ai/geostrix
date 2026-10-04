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
// a unit with one of these roles directly above does NOT make the interval below it a stratigraphic top
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

// The tops ("Top of <code>" interface points) of one code, and why the other starts were not used.
export function topsForCode(runs, code, mc, defaultRole) {
  const me = codeInfo(mc, code, defaultRole);
  const tops = [];
  const skipped = { holeStart: 0, gap: 0, belowRole: 0, olderAbove: 0 };
  runs.forEach((run) => {
    if (run.code !== code) return;
    if (run.holeStart) { skipped.holeStart++; return; }
    if (!run.above) { skipped.gap++; return; }
    const above = codeInfo(mc, run.above.code, defaultRole);
    if (NOT_A_TOP_ABOVE.has(above.role)) { skipped.belowRole++; return; }
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

// Every code in use (effective codes of the rows), in pile order then name.
export function codesInUse(lithoRows, mc, groupOf, defaultRole) {
  const names = new Set();
  (lithoRows || []).forEach((r) => { const c = effectiveCode(r, mc, groupOf); if (c) names.add(c); });
  return [...names].map((n) => codeInfo(mc, n, defaultRole))
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}
