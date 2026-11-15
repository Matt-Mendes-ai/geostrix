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
export function joinRefusal(lattice, model) {
  if (!model?.cells?.length) return tr("It has no blocks.");
  const L = blockModelLattice(model);
  if (!L) return tr("Its blocks are not one regular grid (mixed sizes or off a lattice).");
  if (lattice && !sameLattice(lattice, L)) return tr("Its blocks are not on the same grid as the first model's (another cell size or origin).");
  return null;
}

const cancelled = () => Object.assign(new Error("cancelled"), { cancelled: true });

// inputs: [{ var, model }] (the first fixes the lattice); formula: the calcExpr text.
// opts.pause: () => null | Promise (lib/compactTable.js budgetPause), opts.signal: an AbortSignal, opts.onProgress(fraction 0-1) at each slice (#3521).
// -> { cells: [{ x, y, z, dx, dy, dz, value }], read: [vars], blocks, missing (blocks with some read input but not all), blank (the formula gave no number) }
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
    for (const c of x.model.cells) { const v = Number(c.value); if (Number.isFinite(v)) m.set(key(c), v); await step(++n); }
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
    for (let q = 0; q < used.length; q++) { const v = maps[q].get(k); if (v === undefined) { ok = false; break; } row[used[q].var] = v; }
    if (ok) {
      all++;
      const value = fn(row);
      if (Number.isFinite(value)) cells.push({ x: c.x, y: c.y, z: c.z, dx: c.dx, dy: c.dy, dz: c.dz, value }); else blank++;
    }
    await step(++n);
  }
  return { cells, read, blocks: cells.length, missing: union.size - all, blank };
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
      ...(result.missing ? { blocksLeftOutMissingInput: result.missing } : {}),
      ...(result.blank ? { blocksLeftOutNoValue: result.blank } : {}),
      snapshot: "Calculated once from the inputs named here; it does not change when they do.",
    },
  };
}
