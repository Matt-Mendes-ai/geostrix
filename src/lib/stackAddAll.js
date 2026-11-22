// TASKS.csv #3999 (Matt, v0.2.6, WA zinc-copper: "needs an option here to add all modelling codes or codes at once") — Strat. stack, "Add all": every modelling code, every logged code, or the
// logged codes that make up at least a minimum share of the logged metres, put in the stack already in the order the holes give (lib/holesOrder.js, #3994) with its preview and Undo. What the
// stack does not take stays out and is said in one line: a code the person set to 'other (left out)', cover and casing (overburden), no recovery, and cross-cutting bodies (faults, dykes,
// breccia, veins: they break the stack's non-crossing rule). Units already in the stack are kept. Over GemPy's limit (16 units) the plan offers a cut-down: the units with the most logged metres
// stay (the existing ones always), the rest are listed with their figures (the logged counterpart of Model from map's #3936). Pure; nothing deposit-specific.
import { holesOrderPlan } from "./holesOrder.js";
import { GEMPY_MAX_SURFACES } from "./gempyLimits.js";

export const DEFAULT_MIN_PCT = 1; // codes under about 1 % of the logged metres are left out of 'at least a share', and it is said

// the metres each logged code covers and the holes that log it: Map(code -> { metres, holes })
export function loggedMetres(rows) {
  const m = new Map();
  for (const r of rows || []) {
    const code = r?.value == null ? "" : String(r.value); if (!code) continue;
    const f = Number(r.from), t = Number(r.to); if (!(t > f)) continue;
    const e = m.get(code) || { metres: 0, holes: new Set() }; e.metres += t - f; e.holes.add(r.hole_id); m.set(code, e);
  }
  return new Map([...m].map(([k, e]) => [k, { metres: e.metres, holes: e.holes.size }]));
}

// why a code the stack does not take stays out: 'left out' (role ignore), 'cover' (overburden: cover and casing), 'no recovery', 'cross-cutting', or null
export function leftOutWhy(role) {
  if (role === "ignore" || role === "ignored" || role === "other") return "left out";
  if (role === "overburden") return "cover / casing";
  if (role === "no recovery") return "no recovery";
  if (["cross-cutting", "fault", "dyke", "breccia", "vein", "intrusion"].includes(role)) return "cross-cutting";
  return null;
}

// what could be added. rows: Lithology; litho_units: the logged codes; modellingCodeList: [{ name, role }] (Modelling codes); roleOf(code): a raw code's role; stackUnits: the stack now;
// groupOf(code): true when the code belongs to a group already in the stack; twinInStack(name): the modelling code's group twin is in it; codesOf(unit): the logged values that are that unit
// -> { modelling: [{ unit, label, metres, holes }], logged: [...same], leftOut: [{ unit, label, why }], total: metres logged }
export function addAllCandidates({ rows, litho_units = [], modellingCodeList = [], roleOf = () => "stratigraphic", stackUnits = [], groupOf = () => false, twinInStack = () => false, codesOf = (u) => [u] }) {
  const stats = loggedMetres(rows), have = new Set(stackUnits), mcodeNames = new Set(modellingCodeList.map((c) => c.name));
  const sum = (codes) => codes.reduce((a, c) => { const s = stats.get(String(c)); return s ? { metres: a.metres + s.metres, holes: Math.max(a.holes, s.holes) } : a; }, { metres: 0, holes: 0 });
  const modelling = [], logged = [], leftOut = [];
  for (const c of modellingCodeList) {
    const unit = `mcode:${c.name}`;
    if (have.has(unit) || twinInStack(c.name)) continue;
    const why = leftOutWhy(c.role);
    const s = sum(codesOf(unit) || []);
    if (why) leftOut.push({ unit, label: c.name, why }); else if (c.role === "stratigraphic") modelling.push({ unit, label: c.name, ...s });
  }
  for (const u of litho_units) {
    if (have.has(u) || mcodeNames.has(u) || groupOf(u)) continue; // a code with its own Modelling codes entry is that unit's: listed under modelling
    const why = leftOutWhy(roleOf(u)), s = stats.get(String(u)) || { metres: 0, holes: 0 };
    if (why) leftOut.push({ unit: u, label: String(u), why }); else logged.push({ unit: u, label: String(u), ...s });
  }
  let total = 0; for (const s of stats.values()) total += s.metres;
  return { modelling, logged, leftOut, total };
}

// the units to add for one choice -> { add: [units], kept: [units left out for being rare], note }
//  mode: 'modelling' | 'logged' | 'share'; minPct: for 'share' (the share of the logged metres a code must reach; at the default, codes under it are left out and said)
export function chooseUnits(c, mode, minPct = DEFAULT_MIN_PCT) {
  if (mode === "modelling") return { add: c.modelling, rare: [] };
  const pool = mode === "share" ? [...c.logged, ...c.modelling] : c.logged;
  if (mode !== "share") return { add: pool, rare: [] };
  const need = (Math.max(0, Number(minPct) || 0) / 100) * c.total;
  return { add: pool.filter((x) => x.metres >= need && x.metres > 0), rare: pool.filter((x) => !(x.metres >= need && x.metres > 0)) };
}

// the stack after adding `add` to `stackUnits`, in the order the holes give, and what changed
// -> { order, added: [units], plan (holesOrderPlan of the whole list), over: n units over GemPy's limit or 0, cut: null | { keep: [units], dropped: [{ unit, label, metres, holes }] } }
export function planAddAll(rows, stackUnits, add, codesOf = (u) => [u], { max = GEMPY_MAX_SURFACES } = {}) {
  const start = [...stackUnits, ...add.map((x) => x.unit).filter((u) => !stackUnits.includes(u))];
  const plan = holesOrderPlan(rows, start, codesOf);
  const over = start.length > max ? start.length - max : 0;
  let cut = null;
  if (over) {
    const info = new Map(add.map((x) => [x.unit, x])), kept = new Set(stackUnits);
    const rank = add.filter((x) => !kept.has(x.unit)).sort((a, b) => b.metres - a.metres || b.holes - a.holes || (a.label < b.label ? -1 : 1));
    const room = Math.max(0, max - stackUnits.length), keepNew = new Set(rank.slice(0, room).map((x) => x.unit));
    const keep = start.filter((u) => kept.has(u) || keepNew.has(u));
    cut = { keep, dropped: start.filter((u) => !kept.has(u) && !keepNew.has(u)).map((u) => ({ unit: u, label: info.get(u)?.label || String(u), metres: info.get(u)?.metres || 0, holes: info.get(u)?.holes || 0 })).sort((a, b) => b.metres - a.metres) };
  }
  return { order: plan.order, added: start.filter((u) => !stackUnits.includes(u)), plan, over, cut };
}

// the cut-down stack, in the holes' order
export function cutOrder(rows, stackUnits, add, codesOf, opts) {
  const p = planAddAll(rows, stackUnits, add, codesOf, opts);
  if (!p.cut) return p;
  const keep = new Set(p.cut.keep), plan = holesOrderPlan(rows, p.cut.keep, codesOf);
  return { ...p, order: plan.order, added: p.cut.keep.filter((u) => !stackUnits.includes(u)), plan, over: 0, kept: keep };
}

// the left-out line: 'CAS, OVB (cover / casing); CSG (left out)' — grouped by reason, at most `max` codes shown
export function leftOutLine(leftOut, max = 8) {
  const by = new Map();
  for (const x of leftOut) (by.get(x.why) || by.set(x.why, []).get(x.why)).push(x.label);
  return [...by].map(([why, names]) => ({ why, names: names.slice(0, max), more: Math.max(0, names.length - max) }));
}
