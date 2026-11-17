// TASKS.csv #3596 (Fireweed rehearsal, Macpass) — an estimate of an element was drawn on its own purple-to-yellow log ramp, so its blocks could
// not be read against the drillholes' classes of that element (cream to brown, <= 0.3 / 0.3-1 / 1-3 / 3-10 / > 10 % Zn); and a density model and
// a calculated model added later were drawn on the same blocks over the Zn model, so what showed was whichever drew last.
//   classStops(breaks, min) — the holes' classes ([{ max, color }], the element's assayStyle breaks, in its stored unit) as a block model's
//   stepped legend: { colorMode: "discrete", stops } (a block takes the class whose range holds it; a value equal to a class's top takes the
//   next class, where the holes take the lower one: the classes' limits are typed values, a block rarely equals one).
//   visibleOnLattice(voxelModels, cells, { latticeOf, sameLattice }) — the visible models on the same blocks as `cells` (latticeOf: estimationMeta
//   blockModelLattice; sameLattice: densityFromModel's): the model added is shown, these are hidden.
//   elementClasses(assayStyle, element, { rows, unit, elements }) — #3596 reopened (round 3: Ag and Pb stayed on the ramp, only Zn took the holes'
//   classes): the element's breaks on the holes, else, for an element never shown on them, the classes GeoStrix seeds when it is shown
//   (ViewerModule toggleAssayElement: seedBreaks over the lab assays' class range, in the element's colour) -> { breaks, seeded } | null
import { seedBreaks } from "../colorRamp.js";
import { assayClassRange } from "../assayClasses.js";
import { assayHue } from "../legendGroups.js"; // TASKS.csv #3879 — the element's own hue
export function elementClasses(assayStyle, element, { rows = [], unit = null, elements = [] } = {}) {
  const own = assayStyle?.[element]?.breaks;
  if (Array.isArray(own) && own.length >= 2) return { breaks: own, seeded: false };
  const r = assayClassRange(rows, element);
  if (!r) return null;
  const color = assayStyle?.[element]?.color || assayHue(element, (elements || []).map((e) => (typeof e === "string" ? { symbol: e } : e))); // #3879: the elements may be symbols or { symbol, unit }
  const breaks = seedBreaks({ ...r, unit }, color);
  return breaks.length >= 2 ? { breaks, seeded: true } : null;
}
export function classStops(breaks, min) {
  const b = (breaks || []).filter((x) => x && typeof x.color === "string");
  if (b.length < 2) return null;
  const lo = Number.isFinite(min) ? Math.min(min, Number(b[0].max) || 0) : 0;
  const stops = [{ value: lo, color: b[0].color }];
  for (let i = 1; i < b.length; i++) { const v = Number(b[i - 1].max); if (Number.isFinite(v)) stops.push({ value: v, color: b[i].color }); }
  return stops.length >= 2 ? { colorMode: "discrete", stops } : null;
}
export function visibleOnLattice(voxelModels, cells, { latticeOf, sameLattice }) {
  const L = cells?.length ? latticeOf({ cells }) : null;
  if (!L) return [];
  return (voxelModels || []).filter((m) => m.visible !== false && m.cells?.length && sameLattice(L, latticeOf(m)));
}
