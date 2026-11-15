// TASKS.csv #3419 (#3383 (12)) — Insert > Legend on a page whose only map is a drill plan took its rows from the 3D View (lithology, alteration
// ...), which says nothing about the plan. The rows are the plan's own key: its title (what the colours are), the note under it, each colour
// class, each collar symbol shape and the planned hole. A static copy, as a legend loaded from a view is. Pure.
// d: drillPlanDrawing's result ({ colouring: { title, note, key }, shapeKey, plannedKey }) -> legend items [[label, colour | null, { heading? }]]
import { colors } from "./theme.js";
import { crossPath } from "./drillPlan.js";
const GREY = "#55606e";
export function planKeyItems(d) {
  const c = d?.colouring || {}, out = [];
  if (c.title) out.push([c.title, null, { heading: true }]);
  if (c.note) out.push([c.note, null, { heading: true }]);
  // TASKS.csv #3609 — a colour class that the plan draws as a dot, a hollow ring or a crossed ring keeps that symbol in the legend row (it was a filled square for all three)
  const symbol = (k) => {
    if (!(k.rMm > 0) || !k.colour) return null;
    const col = k.colour, r = Math.max(2.5, Math.min(6, 3 + (k.rMm - 0.6) * 5));
    return { svg: `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="${r.toFixed(1)}" fill="${k.hollow ? "none" : col}" stroke="${col}" stroke-width="1.4"/>${k.cross ? `<path d="${crossPath(8, 8, r)}" stroke="${col}" stroke-width="1.2" fill="none"/>` : ""}</svg>` };
  };
  const row = (k) => (k.note ? [k.label, null, { heading: true }] : symbol(k) ? [k.label, k.colour, symbol(k)] : [k.label, k.colour || GREY]);
  for (const k of c.key || []) if (k.label) out.push(row(k));
  for (const k of d?.shapeKey || []) if (k.label) out.push([k.label, k.colour || GREY]);
  for (const k of d?.plannedKey || []) if (k.label) out.push([k.label, k.colour || colors.planned]);
  return out;
}
