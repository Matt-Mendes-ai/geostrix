// TASKS.csv #3879 — a project saved with the old pick-order hues (every element switched on one at a time holds the same amber ramp). The classes GeoStrix seeded are told from the
// user's own by the tag seedBreaks puts on each: every class `seeded` and no class edited. Those are re-seeded from the element's own hue (its stored colour when the user
// chose one, else its place in the element list) when they were seeded from another colour (or from none: before the tag, the old shared ramp). A class set the user edited
// (any class without the tag), an element with no classes, and a colour the user set are never touched. -> the same object when nothing changes
import { seedBreaks } from "./colorRamp.js";
import { assayHue } from "./legendGroups.js";

export function repairSeededHues(assayStyle, assayElements, rangeFor) {
  if (!assayStyle) return assayStyle;
  let next = null;
  for (const [sym, st] of Object.entries(assayStyle)) {
    const breaks = st?.breaks;
    if (!Array.isArray(breaks) || !breaks.length || !breaks.every((b) => b?.seeded === true)) continue; // none, or edited by the user
    const base = st.color || assayHue(sym, assayElements);
    if (breaks.every((b) => b.seedBase === base)) continue; // already from this element's colour
    const range = rangeFor ? rangeFor(sym) : null;
    if (!range) continue;
    const fresh = seedBreaks(range, base);
    if (!fresh.length) continue;
    (next || (next = { ...assayStyle }))[sym] = { ...st, breaks: fresh };
  }
  return next || assayStyle;
}
