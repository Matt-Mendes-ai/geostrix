// TASKS.csv #3941 (Matt's first-time test: 'We need a total sulphides column in the mineralization layer') — the sum of the sulphide minerals'
// per cents in each interval of a Mineralization layer. Which codes count is read from the layer's OWN codes against a broad list of sulphide
// minerals from every deposit style (base-metal, precious-metal, magmatic nickel, porphyry, epithermal, sediment-hosted, mercury / antimony),
// shown to the user as a tick list they can change; nothing about the deposit is assumed. Pure (no React): the rules and the numbers.
//   long form: one row per mineral per interval (code in value, its per cent in extra); several minerals in one interval sum, two overlapping
//              rows of the SAME mineral count once (the larger), so a repeated row is not double-counted
//   wide form: one row per interval with a number field per mineral (the per-mineral import, lib/perMineralColumns.js); the ticked fields sum
// A layer with codes but no per cent at all is said ('no percentage column'), never a column of zeros.

import { fieldRamp } from "./customColour.js";

// [name, codes]: the codes as logging databases write them (upper case, no spaces); names in English, Spanish and Portuguese are matched too
export const SULPHIDE_MINERALS = [
  ["pyrite", ["PY", "PYR", "PYRITE", "PIRITA"]],
  ["pyrrhotite", ["PO", "PYRR", "PYH", "PYRRHOTITE", "PIRROTITA"]],
  ["chalcopyrite", ["CPY", "CP", "CCP", "CHALCOPYRITE", "CALCOPIRITA"]],
  ["sphalerite", ["SPH", "SP", "SL", "SPHAL", "SPHALERITE", "ESFALERITA", "BLENDE"]],
  ["galena", ["GAL", "GN", "GA", "GALENA"]],
  ["arsenopyrite", ["APY", "ASPY", "ASP", "ARSENOPYRITE", "ARSENOPIRITA"]],
  ["molybdenite", ["MO", "MOL", "MOLY", "MOLYB", "MOLYBDENITE", "MOLIBDENITA"]],
  ["bornite", ["BN", "BO", "BORN", "BORNITE", "BORNITA"]],
  ["chalcocite", ["CC", "CHC", "CHALCOCITE", "CALCOCITA", "CALCOSINA"]],
  ["covellite", ["CV", "COV", "COVELLITE", "COVELITA", "COVELINA"]],
  ["digenite", ["DG", "DIG", "DIGENITE"]],
  ["enargite", ["EN", "ENG", "ENARGITE", "ENARGITA"]],
  ["tetrahedrite", ["TT", "TD", "TET", "TETRAHEDRITE", "TETRAEDRITA"]],
  ["tennantite", ["TN", "TEN", "TENNANTITE", "TENANTITA"]],
  ["sulphosalts", ["SFS", "SS", "SULFOSALT", "SULFOSALTS", "SULPHOSALT", "SULPHOSALTS", "SULFOSAL", "SULFOSSAL"]],
  ["stibnite", ["STB", "STIB", "STIBNITE", "ESTIBINA", "ESTIBNITA"]],
  ["cinnabar", ["CIN", "CINN", "CINNABAR", "CINABRIO"]],
  ["marcasite", ["MC", "MRC", "MARC", "MARCASITE", "MARCASITA"]],
  ["pentlandite", ["PN", "PENT", "PENTLANDITE", "PENTLANDITA"]],
  ["millerite", ["MIL", "MILL", "MILLERITE"]],
  ["violarite", ["VIO", "VIOL", "VIOLARITE"]],
  ["cubanite", ["CUB", "CUBANITE"]],
  ["cobaltite", ["COB", "CBT", "COBALTITE", "COBALTITA"]],
  ["realgar", ["RLG", "REAL", "REALGAR", "REJALGAR"]],
  ["orpiment", ["ORP", "ORPIMENT", "OROPIMENTE"]],
  ["acanthite / argentite", ["ACA", "ARG", "ACANTHITE", "ARGENTITE", "ACANTITA", "ARGENTITA"]],
  ["bismuthinite", ["BIS", "BMT", "BISMUTHINITE"]],
  ["sulphide (not named)", ["SUL", "SULF", "SULPH", "SULP", "SULPHIDE", "SULPHIDES", "SULFIDE", "SULFIDES", "SULFURO", "SULFUROS", "SULFETO", "SULFETOS", "MSUL", "SMSUL"]],
];
const BY_CODE = new Map();
for (const [name, codes] of SULPHIDE_MINERALS) for (const c of codes) BY_CODE.set(c, name);

// a code as written ('Cpy', 'MN_CPY_pct', 'cpy %', 'Pyrite') -> the key it is matched by ('CPY', 'PYRITE')
export function normCode(v) {
  return String(v ?? "").trim().replace(/[\s_-]*(vis_?pct|pct|percent|perc)$/i, "").replace(/[\s_-]*\(?\s*%\s*\)?$/, "").replace(/[\s_-]*(sum|total|tot)$/i, "")
    .replace(/^(mn|min|mnl|sul|sulph)[\s_-]+(?=.)/i, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
// -> the sulphide's name, or null (magnetite, hematite, visible gold, quartz ... are not)
export function sulphideName(code) { return BY_CODE.get(normCode(code)) || null; }

const LIST = /[;,/+&]/;
const parts = (v) => String(v ?? "").split(LIST).map((p) => p.trim()).filter(Boolean);

// the codes a layer logs, for the tick list -> { form: "long" | "wide", codes: [{ code, n, sulphide }], hasPct, rows }
// fields: the layer's numeric mineral fields for the wide form ([{ key, name }]); none -> the long form (value + extra)
export function layerMineralCodes(rows, fields = null) {
  const list = rows || [];
  if (fields && fields.length) {
    const codes = fields.map((f) => { let n = 0; for (const r of list) { const v = Number(fieldOf(r, f.key)); if (Number.isFinite(v) && v > 0) n++; } return { code: f.name || f.key, key: f.key, n, sulphide: sulphideName(f.name || f.key) }; });
    return { form: "wide", codes, hasPct: true, rows: list.length };
  }
  const count = new Map(); let pct = 0;
  for (const r of list) {
    if (Number.isFinite(Number(r?.extra)) && r?.extra !== null && r?.extra !== "") pct++;
    const v = r?.value;
    if (v == null || v === "") continue;
    const ps = parts(v);
    for (const p of ps.length > 1 ? ps : [String(v).trim()]) count.set(p, (count.get(p) || 0) + 1);
  }
  const codes = [...count].map(([code, n]) => ({ code, key: code, n, sulphide: sulphideName(code) })).sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
  return { form: "long", codes, hasPct: pct > 0, rows: list.length };
}
export const fieldOf = (r, key) => (r?.fields && key in r.fields ? r.fields[key] : r?.[key]);

// the ticks a layer starts with: every code the list knows as a sulphide
export const defaultSulphideTicks = (info) => (info?.codes || []).filter((c) => c.sulphide).map((c) => c.key);

const round = (x) => Math.round(x * 1e4) / 1e4;

// per row, the interval's total of the ticked minerals' per cents -> { values: number[] (NaN: not counted), status, counted, mixed }
//   status: "ok" | "no-pct" (codes but no per cent: say so) | "none-ticked" | "empty"
//   mixed: long-form rows whose value lists several minerals of which only some are ticked (one per cent for all: not split, left out)
export function totalSulphides(rows, ticked, info = layerMineralCodes(rows)) {
  const list = rows || [], values = new Array(list.length).fill(NaN);
  if (!list.length) return { values, status: "empty", counted: 0, mixed: 0 };
  const on = new Set(ticked || []);
  if (!on.size) return { values, status: "none-ticked", counted: 0, mixed: 0 };
  if (info.form === "wide") {
    const keys = info.codes.filter((c) => on.has(c.key)).map((c) => c.key);
    let counted = 0;
    list.forEach((r, i) => { let t = 0, any = false; for (const k of keys) { const raw = fieldOf(r, k); if (raw == null || raw === "") continue; const v = Number(raw); if (Number.isFinite(v) && v > 0) { t += v; any = true; } else if (Number.isFinite(v)) any = true; } if (any) { values[i] = round(t); counted++; } });
    return { values, status: "ok", counted, mixed: 0 };
  }
  if (!info.hasPct) return { values, status: "no-pct", counted: 0, mixed: 0 };
  // long form: per hole, the breakpoints of every row; on each piece, per ticked mineral the largest per cent of the rows covering it (a repeated
  // row of one mineral counts once), summed; each row then takes the length-weighted total over its own from-to (exact when rows share intervals)
  const byHole = new Map(); let mixed = 0;
  list.forEach((r, i) => {
    const from = Number(r?.from), to = Number(r?.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) return;
    const ps = parts(r?.value), codes = ps.length > 1 ? ps : [String(r?.value ?? "").trim()];
    const tickedParts = codes.filter((c) => on.has(c));
    let code = null;
    if (tickedParts.length === codes.length && codes.length) code = codes.join("; ");
    else if (tickedParts.length) mixed++;
    if (!byHole.has(r.hole_id)) byHole.set(r.hole_id, []);
    byHole.get(r.hole_id).push({ i, from, to, code, pct: Number(r?.extra) });
  });
  let counted = 0;
  for (const segs of byHole.values()) {
    const cuts = [...new Set(segs.flatMap((s) => [s.from, s.to]))].sort((a, b) => a - b);
    const pieceTotal = new Float64Array(Math.max(0, cuts.length - 1));
    for (let p = 0; p + 1 < cuts.length; p++) {
      const a = cuts[p], b = cuts[p + 1], best = new Map();
      for (const s of segs) if (s.code && s.from < b && s.to > a && Number.isFinite(s.pct) && s.pct > 0) best.set(s.code, Math.max(best.get(s.code) || 0, s.pct));
      let t = 0; for (const v of best.values()) t += v;
      pieceTotal[p] = t;
    }
    for (const s of segs) {
      let w = 0, sum = 0;
      for (let p = 0; p + 1 < cuts.length; p++) { const a = Math.max(cuts[p], s.from), b = Math.min(cuts[p + 1], s.to); if (b > a) { w += b - a; sum += pieceTotal[p] * (b - a); } }
      if (w > 0) { values[s.i] = round(sum / w); counted++; }
    }
  }
  return { values, status: "ok", counted, mixed };
}

// the field the total is kept in on each row (project data: English); Identify, the Data table and exports show it like any field
export const TOTAL_SULPHIDES_FIELD = "Total sulphides (%)";
const STANDARD = new Set(["hole_id", "from", "to", "depth", "value", "extra", "as_logged", "all_codes", "codes", "description", "intensity", "alpha", "modelColor", TOTAL_SULPHIDES_FIELD]);
const AMOUNT_NAME = /(pct|percent|perc|%\)?|_sum|_total|_tot)$/i;
// the wide form's per-mineral number fields (a per-mineral import keeps each ticked column as a field): numbers, named like an amount or a sulphide
export function wideMineralFields(rows) {
  const seen = new Map(), list = rows || [], n = Math.min(list.length, 2000);
  for (let i = 0; i < n; i++) for (const [k, v] of Object.entries(list[i] || {})) {
    if (STANDARD.has(k) || k.startsWith("_")) continue;
    let s = seen.get(k); if (!s) seen.set(k, (s = { filled: 0, num: 0 }));
    if (v == null || v === "") continue;
    s.filled++; if (Number.isFinite(Number(v))) s.num++;
  }
  return [...seen].filter(([k, s]) => s.filled && s.num >= 0.8 * s.filled && (AMOUNT_NAME.test(k) || sulphideName(k))).map(([k]) => ({ key: k, name: k }));
}
// the layer's codes, wide form when it has per-mineral fields
export const mineralCodesOf = (rows) => layerMineralCodes(rows, wideMineralFields(rows));

// the rows with the total written in (null where an interval has none of the ticked minerals logged) -> { rows, status, counted, mixed }
export function withTotalSulphides(rows, ticked, info = mineralCodesOf(rows)) {
  const t = totalSulphides(rows, ticked, info);
  if (t.status === "no-pct" || t.status === "empty") return { ...t, rows };
  return { ...t, rows: (rows || []).map((r, i) => ({ ...r, [TOTAL_SULPHIDES_FIELD]: Number.isFinite(t.values[i]) ? t.values[i] : null })) };
}

// how a coded layer's style draws it by a number field (the scene's part): -> null (as before) | { colourOf (or null: its codes' colours), shown(row) }
//   colourBy: a number field of the rows (its ramp); sulphideMin: only intervals whose Total sulphides reaches it
export function fieldStyler(rows, st) {
  if (!st || (!st.colourBy && !(st.sulphideMin > 0))) return null;
  const ramp = st.colourBy ? fieldRamp(rows, st.colourBy, st) : null, min = st.sulphideMin > 0 ? st.sulphideMin : null;
  if (!ramp && min == null) return null;
  return { colourOf: ramp ? ramp.colourOf : null, shown: min == null ? () => true : (r) => Number(r?.[TOTAL_SULPHIDES_FIELD]) >= min };
}
