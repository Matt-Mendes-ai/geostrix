// TASKS.csv #3419 (#3383 (12)) — Insert > Legend on a page whose only map is a drill plan took its rows from the 3D View (lithology, alteration
// ...), which says nothing about the plan. The rows are the plan's own key: its title (what the colours are), the note under it, each colour
// class, each collar symbol shape and the planned hole. A static copy, as a legend loaded from a view is. Pure.
// d: drillPlanDrawing's result ({ colouring: { title, note, key }, shapeKey, plannedKey }) -> legend items [[label, colour | null, { heading? }]]
import { colors } from "./theme.js";
const GREY = "#55606e";
export function planKeyItems(d) {
  const c = d?.colouring || {}, out = [];
  if (c.title) out.push([c.title, null, { heading: true }]);
  if (c.note) out.push([c.note, null, { heading: true }]);
  const row = (k) => (k.note ? [k.label, null, { heading: true }] : [k.label, k.colour || GREY]);
  for (const k of c.key || []) if (k.label) out.push(row(k));
  for (const k of d?.shapeKey || []) if (k.label) out.push([k.label, k.colour || GREY]);
  for (const k of d?.plannedKey || []) if (k.label) out.push([k.label, k.colour || colors.planned]);
  return out;
}
