// TASKS.csv #2816 — what a logged code means in THIS project (the code dictionary, #2163: { [layerKey]: { [codeKey]: { code, desc } } }),
// beside the code in Identify and in the hover tooltip of a drillhole interval. Nothing is guessed: a code with no entry, or one whose entry
// says no more than the code, adds nothing; nor does a meaning the label already shows (a legend label taken from the dictionary).
import { entryOf } from "../codeDictionary.js";

export function codeMeaning(dict, layerKey, value, shown = "") {
  if (layerKey == null || value == null || typeof value === "number") return null;
  const d = String(entryOf(dict?.[layerKey], value)?.desc ?? "").trim();
  if (!d || d.toLowerCase() === String(value).trim().toLowerCase()) return null;
  return shown && String(shown).toLowerCase().includes(d.toLowerCase()) ? null : d;
}

// The layer key of a hit object (its parent is one of the layer groups { [key]: THREE.Group }).
export function layerKeyOf(object, layerGroups) {
  const parent = object?.parent;
  if (!parent || !layerGroups) return null;
  for (const k in layerGroups) if (layerGroups[k] === parent) return k;
  return null;
}

// The hover tooltip of an interval: its tip, plus the code's meaning on its own line when the dictionary has one.
export function tipWithMeaning(object, layerGroups, dict) {
  const tip = object?.userData?.tip;
  if (!tip || !dict) return tip;
  const m = codeMeaning(dict, layerKeyOf(object, layerGroups), object.userData.catValue ?? object.userData.row?.value, tip);
  return m ? `${tip}\n${m}` : tip;
}
