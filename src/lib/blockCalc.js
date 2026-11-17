// TASKS.csv #3164 (part 2, Matt 2026-11-13) — the block calculator: a NEW block model whose value is a formula over block models on one
// lattice (calcined Fe, a metal equivalent, an NSR, #3178's pit revenue with penalties), in the field calculator's language (calcExpr.js,
// #344 / #554: no eval). Pure: the variable names, the lattice join, the evaluation in slices, the counts and the model record. The dialog is
// components/BlockCalculatorModal.jsx. No default formula, price, recovery or penalty (#264): the formula is the user's.
// A block gets a value only where every input the formula reads has one; elsewhere it is left out, never zero. A formula that gives no
// number there (a division by zero, a blank comparison) leaves the block out too, and both are counted.
import { compileCalc } from "./calcExpr.js";
import { blockModelLattice } from "./estimationMeta.js";
import { sameLattice } from "./densityFromModel.js";
import { t as tr } from "./i18n.js";

const RESERVED = new Set(["and", "or", "not", "if"]);
export const BLOCK_CALC_SLICE = 4096; // blocks between budget checks
export const MAX_CALC_INPUTS = 12;

// a name the formula can use bare: letters, digits and _, not starting with a digit, not and / or / not / if
export const isCalcVar = (s) => typeof s === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !RESERVED.has(s.toLowerCase());

// a model's variable: its element (Fe, SiO2, LOI), else its property, else the first word of its name; made a valid name, unique among taken
export function calcVarFor(model, taken = []) {
  const first = (t) => String(t || "").trim().split(/\s+/)[0];
  const raw = String(model?.params?.element || first(model?.property) || first(model?.name) || "m");
  let base = raw.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "m";
  if (/^[0-9]/.test(base)) base = `m_${base}`;
  if (RESERVED.has(base.toLowerCase())) base = `${base}_m`;
  const used = new Set(taken.map((t) => String(t).toLowerCase()));
  let name = base, k = 2;
  while (used.has(name.toLowerCase())) name = `${base}_${k++}`;
  return name;
}

// the variables a formula reads: bare names (not a function call) and [quoted] names, outside 'text' literals
export function formulaVars(formula, vars) {
  const src = String(formula || "").replace(/'[^']*'|"[^"]*"/g, " ");
  const set = new Set(vars), out = new Set();
  for (const m of src.matchAll(/\[([^\]]*)\]/g)) if (set.has(m[1])) out.add(m[1]);
  const bare = src.replace(/\[[^\]]*\]/g, " ");
  for (const m of bare.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*(\()?/g)) if (!m[2] && set.has(m[1])) out.add(m[1]);
  return vars.filter((v) => out.has(v));
}

// can this model join a calculation whose first input has lattice L? -> null (yes) or the reason (no)
// TASKS.csv #3852 (#3809) — a model whose blocks are not one regular grid (a UBC mesh with two cell heights) can still be the ONLY input: a formula of one
// model is worked block by block and needs no lattice. opts.first: it would be the first input; opts.firstIrregular: the first input is such a model.
export function joinRefusal(lattice, model, { first = false, firstIrregular = false } = {}) {
  if (!model?.cells?.length) return tr("It has no blocks.");
  if (firstIrregular) return tr("The first model's blocks are not one regular grid: it can be worked alone, not joined with another model.");
  const L = blockModelLattice(model);
  if (!L) return first ? null : tr("Its blocks are not one regular grid (mixed sizes or off a lattice).");
  if (lattice && !sameLattice(lattice, L)) return tr("Its blocks are not on the same grid as the first model's (another cell size or origin).");
  return null;
}

const cancelled = () => Object.assign(new Error("cancelled"), { cancelled: true });

// inputs: [{ var, model }] (the first fixes the lattice); formula: the calcExpr text.
// opts.pause: () => null | Promise (lib/compactTable.js budgetPause), opts.signal: an AbortSignal, opts.onProgress(fraction 0-1) at each slice (#3521).
// -> { cells: [{ x, y, z, dx, dy, dz, value, support?, nHoles?, beyond?, fromLog? }], read: [vars], blocks, missing (blocks with some read input but not all), blank (the formula gave no number) }
// TASKS.csv #3685 — each block keeps what its inputs' estimates said of it, so Grade-tonnage reads a calculated model as it reads an estimate
// (a 'Zn + Pb' model had no Interpolated column and no 'carried outward' caution): the WEAKEST support of its inputs' blocks, the fewest
// holes, beyond the samples when any input's block is, and the most metres filled from a log.
// Throws a readable Error before any block for an empty formula, an unknown name, a formula that reads no model or a model off the lattice.
export async function blockCalc(inputs, formula, { pause = null, signal = null, onProgress = null } = {}) {
  if (!String(formula || "").trim()) throw new Error(tr("Enter a formula."));
  const vars = inputs.map((x) => x.var);
  const bad = vars.find((v) => !isCalcVar(v));
  if (bad !== undefined) throw new Error(tr("\"{v}\" can't be a name in the formula: use letters, digits and _, starting with a letter.", { v: bad }));
  if (new Set(vars.map((v) => v.toLowerCase())).size !== vars.length) throw new Error(tr("Each model needs its own name in the formula."));
  const fn = compileCalc(formula, vars);
  const read = formulaVars(formula, vars);
  if (!read.length) throw new Error(tr("The formula reads no block model: use the names listed beside the models."));
  const used = inputs.filter((x) => read.includes(x.var));
  const L = blockModelLattice(inputs[0].model) || blockModelLattice(used[0].model);
  // TASKS.csv #3852 (#3809) — one model off a lattice, alone: each of its blocks as it is (1 / x of a conductivity model on a UBC mesh with two cell heights)
  if (!L && used.length === 1) {
    const cells = [], row = Object.fromEntries(vars.map((v) => [v, NaN])), src = used[0];
    let blank = 0, n = 0;
    const total = src.model.cells.length;
    for (const c of src.model.cells) {
      if (signal?.aborted) throw cancelled();
      if (++n % BLOCK_CALC_SLICE === 0) { onProgress?.(n / total); if (pause) { const w = pause(); if (w) await w; } }
      const v = Number(c.value);
      if (!Number.isFinite(v)) continue;
      row[src.var] = v;
      const value = fn(row);
      if (!Number.isFinite(value)) { blank++; continue; }
      const out = { x: c.x, y: c.y, z: c.z, dx: c.dx, dy: c.dy, dz: c.dz, value };
      if (typeof c.support === "string") out.support = c.support;
      if (Number.isFinite(c.nHoles)) out.nHoles = c.nHoles;
      if (c.beyond) out.beyond = true;
      if (c.fromLog > 0) out.fromLog = c.fromLog;
      cells.push(out);
    }
    return { cells, read, blocks: cells.length, missing: 0, blank };
  }
  for (const x of used) { const why = joinRefusal(L, x.model); if (why) throw new Error(tr("{name}: {why}", { name: x.model.name, why })); }
  const { dx, dy, dz, ox, oy, oz } = L;
  const ix = (c) => Math.round((c.x - ox) / dx - 0.5), iy = (c) => Math.round((c.y - oy) / dy - 0.5), iz = (c) => Math.round((c.z - oz) / dz - 0.5);
  // one integer key per lattice cell over the inputs' extent (exact: no float collisions)
  let i0 = Infinity, j0 = Infinity, k0 = Infinity, i1 = -Infinity, j1 = -Infinity;
  for (const x of used) for (const c of x.model.cells) { const i = ix(c), j = iy(c), k = iz(c); if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; if (k < k0) k0 = k; }
  const nx = i1 - i0 + 1, ny = j1 - j0 + 1;
  const key = (c) => (ix(c) - i0) + nx * ((iy(c) - j0) + ny * (iz(c) - k0));
  // TASKS.csv #3521 — the work: every input's blocks once (the maps), then the blocks of the input with the fewest (the evaluation)
  const total = used.reduce((a, x) => a + x.model.cells.length, 0) + used.reduce((a, x) => Math.min(a, x.model.cells.length), Infinity); // no Math.min(...spread): #371
  const step = async (n) => { if (signal?.aborted) throw cancelled(); if (n % BLOCK_CALC_SLICE === 0) { onProgress?.(Math.min(1, n / total)); if (pause) { const w = pause(); if (w) await w; } } };
  const maps = [];
  let n = 0;
  for (const x of used) {
    const m = new Map();
    for (const c of x.model.cells) { if (Number.isFinite(Number(c.value))) m.set(key(c), c); await step(++n); }
    maps.push(m);
  }
  // the blocks with at least one read input; those with all of them are evaluated
  const union = new Set();
  for (const m of maps) for (const k of m.keys()) union.add(k);
  const base = used.reduce((a, x, q) => (maps[q].size < maps[a].size ? q : a), 0); // walk the input with the fewest blocks
  const row = Object.fromEntries(vars.map((v) => [v, NaN]));
  const cells = [];
  let all = 0, blank = 0;
  for (const c of used[base].model.cells) {
    const k = key(c);
    if (!maps[base].has(k)) { await step(++n); continue; }
    let ok = true;
    for (let q = 0; q < used.length; q++) { const b = maps[q].get(k); if (b === undefined) { ok = false; break; } row[used[q].var] = Number(b.value); }
    if (ok) {
      all++;
      const value = fn(row);
      if (Number.isFinite(value)) cells.push(withInputsBasis({ x: c.x, y: c.y, z: c.z, dx: c.dx, dy: c.dy, dz: c.dz, value }, maps, k)); else blank++;
    }
    await step(++n);
  }
  return { cells, read, blocks: cells.length, missing: union.size - all, blank };
}

const SUPPORT_RANK = { unsupported: 0, extrapolated: 1, interpolated: 2 }; // estimation.js SUPPORT_CODES
function withInputsBasis(out, maps, k) {
  let sup = null, holes = Infinity, beyond = false, log = 0;
  for (const m of maps) {
    const b = m.get(k);
    if (typeof b.support === "string" && (sup == null || (SUPPORT_RANK[b.support] ?? 0) < (SUPPORT_RANK[sup] ?? 0))) sup = b.support;
    if (Number.isFinite(b.nHoles) && b.nHoles < holes) holes = b.nHoles;
    if (b.beyond) beyond = true;
    if (b.fromLog > log) log = b.fromLog;
  }
  if (sup != null) out.support = sup;
  if (Number.isFinite(holes)) out.nHoles = holes;
  if (beyond) out.beyond = true;
  if (log > 0) out.fromLog = log;
  return out;
}

// TASKS.csv #3685 — the inputs' basis on the new model's record: the holes they were estimated from (the union, said when they differ), whether
// their blocks were flagged beyond the samples, the metres filled from a log, and the domain or the volume they were restricted to when they share one
export function inputsBasis(models) {
  const ms = (models || []).filter(Boolean), out = {};
  if (!ms.length) return out;
  if (ms.every((m) => Array.isArray(m.params?.holeIds) && m.params.holeIds.length)) {
    const u = new Set(); for (const m of ms) for (const h of m.params.holeIds) u.add(h);
    out.holeIds = [...u];
    const sizes = ms.map((m) => new Set(m.params.holeIds).size);
    out.holesFrom = sizes.every((n) => n === u.size) ? `the same ${u.size} holes as its inputs` : `the union of its inputs' holes (${ms.map((m, i) => `${m.name}: ${sizes[i]}`).join("; ")})`;
  }
  if (ms.some((m) => m.params?.beyondFlagged)) out.beyondFlagged = true;
  const logM = ms.reduce((a, m) => Math.max(a, Number(m.params?.unsampledLogFilledM) || 0), 0);
  if (logM > 0) out.unsampledLogFilledM = logM;
  for (const f of ["domain", "restrictedToVolumeName"]) {
    const vals = new Set(ms.map((m) => m.params?.[f] || null));
    if (vals.size === 1) { const v = [...vals][0]; if (v) out[f] = v; } else out[`${f}Differs`] = ms.map((m) => `${m.name}: ${m.params?.[f] || "none"}`).join("; ");
  }
  return out;
}

// the new model: an ordinary block model on that lattice, a snapshot that names its inputs (it does not follow them)
export function calcModelRecord({ name, unit, formula, inputs, result }) {
  const n = String(name || "").trim(), u = String(unit || "").trim();
  if (!n) throw new Error(tr("Give the new model a name."));
  if (!u) throw new Error(tr("State the unit of the new value (%, g/t, $/t, none…)."));
  const read = new Set(result.read);
  return {
    name: n, source: "calc", cells: result.cells,
    params: {
      tool: "Block calculator", element: n, unit: u,
      calc: { formula: String(formula).trim(), unit: u, inputs: inputs.filter((x) => read.has(x.var)).map((x) => ({ var: x.var, model: x.model.name, element: x.model.params?.element || null, unit: x.model.params?.unit || null })) },
      blocksCalculated: result.blocks,
      ...inputsBasis(inputs.filter((x) => read.has(x.var)).map((x) => x.model)), // #3685
      ...(result.missing ? { blocksLeftOutMissingInput: result.missing } : {}),
      ...(result.blank ? { blocksLeftOutNoValue: result.blank } : {}),
      snapshot: "Calculated once from the inputs named here; it does not change when they do.",
    },
  };
}
