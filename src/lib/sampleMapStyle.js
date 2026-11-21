// TASKS.csv #3883 (#3830) — the surface samples on the Maps plan coloured or sized by an element or a field (a Zone, the medium), with their ids and a
// legend: the Collars panel's treatment (lib/collarMapStyle.js collarColouring: quintile classes for a value, a colour per category, over 16 grouped),
// for samples. Pure: the plan draws. samples: store.surfaceSamples ({ sample_id, x, y, medium, values: { sym }, attrs }); elements: store.surfaceElements.
import { collarColourFields, collarColouring } from "./collarMapStyle.js";

const flat = (s, i) => ({ hole_id: i, ...(s?.attrs && typeof s.attrs === "object" ? s.attrs : {}), medium: s?.medium ?? "" });

// what the samples can be coloured by: the elements with a value on at least two samples, then the samples' own fields -> [{ key, label, kind }]
export function sampleColourChoices(samples, elements) {
  const S = samples || [];
  const els = (elements || []).map((e) => e?.symbol).filter((sym) => sym && S.filter((s) => Number.isFinite(s?.values?.[sym])).length >= 2);
  const fields = collarColourFields(S.map(flat));
  return [...els.map((sym) => ({ key: `el:${sym}`, label: sym, kind: "number" })), ...fields.map((f) => ({ key: `f:${f.key}`, label: f.key, kind: f.kind }))];
}
// by: "el:<symbol>" | "f:<field>" -> the colouring (collarColouring's: kind, legend, noValue) with colourOfIndex(i) / classOfIndex(i), or null
export function sampleColouring(samples, by, { breaks = null } = {}) {
  if (!by || !(samples || []).length) return null;
  const items = samples.map(flat);
  const c = by.startsWith("el:")
    ? collarColouring(items, { values: new Map(samples.map((s, i) => [i, s?.values?.[by.slice(3)]]).filter(([, v]) => Number.isFinite(v))), breaks })
    : collarColouring(items, { field: by.slice(2), breaks });
  if (!c) return null;
  return { ...c, colourOfIndex: (i) => c.colourOf(items[i]), classOfIndex: (i) => (c.classOf ? c.classOf(items[i]) : -1) };
}
// a sample's dot radius (px): sized by its value's class (2 to 6.8 px over five classes) when asked and the colouring is a value; else 2.5
export const sampleDotRadius = (cls, sized) => (sized && cls >= 0 ? 2 + 1.2 * cls : 2.5);
