// TASKS.csv #1440 (review #1352, Silvertip) — outcrop measurements reached the Stereonet as internal classes ("bedding (outcrop)"),
// so with Source = Both core "Bedding" and outcrop bedding were two types and could not be plotted together, the check a geologist
// wants (core bedding 14/127 against outcrop bedding 15/143). Outcrop picks now carry the file's own Type text, and a type is keyed
// by its text, case and spacing aside: "Bedding" in the core log and "bedding" in the outcrop file are one type, counted by source.
export const typeKeyOf = (p) => String(p?.value ?? "").trim().replace(/\s+/g, " ").toLowerCase() || "(unlabeled)";

// picks -> [{ key, label, core, outcrop }], label in the core log's spelling when it has the type, sorted by label
export function typeEntries(picks) {
  const m = new Map();
  for (const p of picks || []) {
    const key = typeKeyOf(p), text = String(p?.value ?? "").trim() || "(unlabeled)";
    let e = m.get(key);
    if (!e) m.set(key, (e = { key, label: text, core: 0, outcrop: 0 }));
    if (p.outcrop) e.outcrop++;
    else { if (!e.core) e.label = text; e.core++; }
  }
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
}
