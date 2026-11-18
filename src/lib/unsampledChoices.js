// TASKS.csv #2417 / #3700 (7) — the user's choice of how unsampled metres are read, per tool and element, for this session (moved here from
// components/UnsampledChoice.jsx for TASKS.csv #3920, so the guided Grade model can read and reset it without loading the component).
const choices = new Map(); // "tool|symbol" -> { mode, value }
const listeners = new Set();
let version = 0;
export const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };
export const getVersion = () => version;
export function getUnsampledChoice(tool, symbol) { return choices.get(`${tool}|${symbol}`) || null; }
// TASKS.csv #3700 (7) — "not known: left out" says nothing about an element (no value to type), so it follows the user to the tool's next element:
// switching the Grade shell from Zn to Pb set '— choose —' again in the same holes. A choice of its own always wins; barren and log stay per element.
export const lastUnknown = new Map(); // tool -> true while the tool's latest explicit choice was 'not known'
export function setUnsampledChoice(tool, symbol, patch) {
  const k = `${tool}|${symbol}`;
  if (patch.mode !== undefined) { if (patch.mode === "unknown") lastUnknown.set(tool, true); else lastUnknown.delete(tool); }
  choices.set(k, { ...(choices.get(k) || { mode: null }), ...patch }); // no value until one is typed: barren then takes the default (#3920)
  version++; listeners.forEach((f) => f());
}
