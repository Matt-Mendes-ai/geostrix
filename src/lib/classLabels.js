// TASKS.csv #3571 (Fireweed rehearsal, Macpass) — in the Style dialog the class Label boxes kept their old text when the limits were retyped
// ('≤ 0.3' beside a limit of 2, and the project stored it). A label made from the limits (the generated '≤ 0.3', '0.3–1', '< 0.5') follows its
// limit, and the one above it follows this one (its lower bound); a label the user typed ('Ore', 'Low') or one that is no pure
// numbers is theirs and stays.
const NUM = String.raw`-?\d+(?:\.\d+)?(?:e[+-]?\d+)?`;
const GENERATED = new RegExp(String.raw`^(?:[≤<>]\s*${NUM}|${NUM}\s*[–-]\s*${NUM})$`, "i");
export const isGeneratedLabel = (label) => { const s = String(label ?? "").trim(); return s === "" || GENERATED.test(s); };
export const generatedLabel = (breaks, i) => (i === 0 ? `\u2264 ${breaks[0].max}` : `${breaks[i - 1].max}\u2013${breaks[i].max}`);
// breaks (in the order shown) after break i's limit changed: -> the same list with the generated labels of classes i and i + 1 rewritten.
// before: the list before the change, to tell a label that was generated for the old limits from one the user typed.
export function relabelAfterLimit(before, after, i) {
  return after.map((b, k) => {
    if (k !== i && k !== i + 1) return b;
    if (!isGeneratedLabel(before[k]?.label)) return b;
    return { ...b, label: generatedLabel(after, k) };
  });
}
