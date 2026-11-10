// TASKS.csv #2417 / #2542 (reviews #2325 WA uranium, #2486 WA lithium) — the metres of a sampled hole that carry no result for
// an element. Estimation, Grade shell and Variogram read them as "not known" (compositing leaves them out), so a selectively
// sampled hole carried ore grade into core nobody assayed: 22 % of a uranium estimate's metal above the highest sample, 117 m of a
// pegmatite hole inside a 0.5 % Li2O shell over 14.4 m of samples. A geologist often leaves core unsampled because it was judged
// barren, so the reading is the user's choice: "not known" (as before) or "barren", at a value the user types (no number here reads
// as a fact, #264). Only holes that carry the element at least once are filled: a hole with no sample of it says nothing.
import { rawSampleIntervals } from "./geochem.js";

export const ASK_BELOW_SHARE = 0.6; // under this share of the sampled holes' metres carrying the element, the dialog asks (no default)
const EPS = 1e-6;

// a value in `unit` -> the element's stored unit (what valueIn reads back)
function toNative(v, unit, native) {
  const ppm = unit === "%" ? v * 10000 : unit === "ppb" ? v / 1000 : v;
  return native === "%" ? ppm / 10000 : native === "ppb" ? ppm * 1000 : ppm;
}

// per hole carrying `symbol`: its length (the collar's max_depth, or the deepest sample when longer) and its covered intervals
function coverage(assays, collars, symbol, unit, elementUnits) {
  const { intervals } = rawSampleIntervals(assays || [], symbol, unit, elementUnits);
  const byHole = new Map();
  for (const iv of intervals) { let a = byHole.get(iv.hole_id); if (!a) byHole.set(iv.hole_id, (a = [])); a.push(iv); }
  const depth = new Map();
  for (const c of collars || []) if (c && c.hole_id != null && Number(c.max_depth) > 0) depth.set(c.hole_id, Number(c.max_depth));
  const holes = [];
  byHole.forEach((ivs, hole_id) => {
    ivs.sort((a, b) => a.from - b.from);
    const end = Math.max(depth.get(hole_id) || 0, ivs[ivs.length - 1].to);
    let sampled = 0; for (const iv of ivs) sampled += iv.to - iv.from;
    holes.push({ hole_id, end, ivs, sampled, known: depth.has(hole_id) });
  });
  return holes;
}

// -> { holes, drilledM, sampledM, share, holesNoLength } over the holes that carry the element
export function sampledShare(assays, collars, symbol, unit, elementUnits) {
  const holes = coverage(assays, collars, symbol, unit, elementUnits);
  let drilledM = 0, sampledM = 0, holesNoLength = 0;
  for (const h of holes) { drilledM += h.end; sampledM += h.sampled; if (!h.known) holesNoLength++; }
  return { holes: holes.length, drilledM, sampledM, share: drilledM > 0 ? sampledM / drilledM : 1, holesNoLength };
}

// the gaps (0 .. hole end) of every hole carrying the element, as assay rows holding `value` (in `unit`) for that element only.
// -> { assays: the rows plus the fills, filledM, holesFilled, fills }
export function fillUnsampled(assays, collars, symbol, unit, elementUnits, value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v < 0) return { assays, filledM: 0, holesFilled: 0, fills: [] };
  const native = toNative(v, unit, (elementUnits || {})[symbol] || "ppm");
  const fills = [];
  let filledM = 0;
  const holesFilled = new Set();
  for (const h of coverage(assays, collars, symbol, unit, elementUnits)) {
    let at = 0;
    const gap = (from, to) => {
      if (to - from <= EPS) return;
      fills.push({ hole_id: h.hole_id, from, to, values: { [symbol]: native }, unsampledFill: true });
      filledM += to - from; holesFilled.add(h.hole_id);
    };
    for (const iv of h.ivs) { gap(at, iv.from); at = Math.max(at, iv.to); }
    gap(at, h.end);
  }
  return { assays: fills.length ? [...(assays || []), ...fills] : assays, filledM, holesFilled: holesFilled.size, fills };
}

// mode: "unknown" | "barren" | "" (not chosen). A run may go ahead once the choice is made and, for barren, a value typed.
export function unsampledReady(mode, value) {
  return mode === "unknown" || (mode === "barren" && value !== "" && value != null && Number.isFinite(Number(value)) && Number(value) >= 0);
}
// the mode shown before the user picks one: "not known" (as before) unless under ASK_BELOW_SHARE of the metres are sampled
export const defaultUnsampledMode = (share) => (share < ASK_BELOW_SHARE ? "" : "unknown");
