// TASKS.csv #3748 (Scottie Gold review) — one reading of the half-limit floor for every Geochem tool. Grade statistics, Thresholds and QAQC read it
// (qaqc.js fileCensoring: half-detection-limit values substituted in the file sit on one repeated minimum); Anomaly score, Correlation and Calc. element did
// not: the anomaly score ticked Ag, Bi and Cd (84, 84 and 73 % one value) as if they had few below detection and flagged 28 % of the samples, a correlation
// on Ag / Bi / Sn gave coefficients with no caution, and 8,232 of the 9,777 Ag / Au ratios had the silver floor as numerator. Pure.
import { fileCensoring } from "./qaqc.js";

export const FLOOR_MAX_SHARE = 0.25; // an element with more of its results than this on the floor is mostly the detection limit

// the share of the element's results (those not flagged '<', positive) on the file's censoring floor, 0 when the file has none
// -> { share, floor, dl } | null
export function floorOf(rows, symbol, unit = "ppm", units = {}) {
  const f = fileCensoring(rows, symbol, unit, units).floor;
  return f ? { share: f.share, floor: f.floor, dl: f.dl } : null;
}

// the elements of `symbols` with at least `minShare` of their results on the floor: [{ symbol, share, floor, dl }] by share, largest first
export function floorElements(rows, symbols, units = {}, minShare = FLOOR_MAX_SHARE) {
  const out = [];
  for (const s of symbols || []) { const f = floorOf(rows, s, units[s] || "ppm", units); if (f && f.share >= minShare) out.push({ symbol: s, ...f }); }
  return out.sort((a, b) => b.share - a.share);
}

// a calculated element's inputs on the floor: the rows whose value of any element the expression reads is on that element's floor
// -> { rows, of, inputs: [{ symbol, n }] } | null  (null when no input has a floor or no row uses one)
export function floorInputs(rows, expr, symbols, units = {}) {
  const read = (symbols || []).filter((s) => new RegExp(`(^|[^A-Za-z0-9_])${String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9_]|$)`).test(String(expr || "")));
  const floors = new Map();
  for (const s of read) { const f = floorOf(rows, s, units[s] || "ppm", units); if (f) floors.set(s, f.floor); }
  if (!floors.size) return null;
  const per = new Map([...floors.keys()].map((s) => [s, 0]));
  let hit = 0, of = 0;
  for (const r of rows || []) {
    let any = false, seen = false;
    for (const [s, fl] of floors) { const v = r?.values?.[s]; if (typeof v === "number") { seen = true; if (Math.abs(v - fl) <= fl * 1e-9) { per.set(s, per.get(s) + 1); any = true; } } }
    if (seen) { of++; if (any) hit++; }
  }
  return hit ? { rows: hit, of, inputs: [...per].filter(([, n]) => n).map(([symbol, n]) => ({ symbol, n })) } : null;
}

// TASKS.csv #3788 (Scottie Gold review) — the half-limit floor modelled as grade: 86 % of the silver values were exactly 1 g/t (half the limit) and the model printed 7.7 Moz of silver, three
// quarters of it the detection floor. What the user may do with such an element's floor values in an estimate: keep them (the default: low grades, as they are), leave them out, or set them
// to a value they state. modes: { [symbol]: { mode: "keep" | "out" | "set", value } }; found: floorElements()'s answer. Returns the same rows when nothing changes.
// -> assay rows (copies only where a value changed)
export function applyFloorModes(rows, found, modes = {}) {
  const todo = (found || []).map((f) => ({ f, m: modes[f.symbol] })).filter(({ m }) => m && (m.mode === "out" || (m.mode === "set" && String(m.value ?? "").trim() !== "" && Number.isFinite(Number(m.value)) && Number(m.value) >= 0)));
  if (!todo.length || !rows?.length) return rows;
  return rows.map((r) => {
    let out = null;
    for (const { f, m } of todo) {
      const v = r?.values?.[f.symbol];
      if (typeof v !== "number" || !(Math.abs(v - f.floor) <= f.floor * 1e-9)) continue;
      if (!out) out = { ...r, values: { ...r.values } };
      if (m.mode === "out") delete out.values[f.symbol]; else out.values[f.symbol] = Number(m.value);
    }
    return out || r;
  });
}
