// TASKS.csv #1192 — every dropdown of generated surfaces showed "Top of IMMOQ" four times, so a hangingwall could be picked from the wrong
// run. Names that repeat now carry the time of their run, and a counter when two runs share a minute. Pure.
const stamp = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "";
};

// surfaces: the list the dropdown shows -> Map id -> label
export function surfaceOptionLabels(surfaces) {
  const byName = new Map();
  for (const s of surfaces || []) (byName.get(s.name) || byName.set(s.name, []).get(s.name)).push(s);
  const out = new Map();
  for (const [name, list] of byName) {
    if (list.length === 1) { out.set(list[0].id, name); continue; }
    const used = new Map();
    list.forEach((s, i) => {
      const t = stamp(s.params?.generatedAt ?? s.generatedAt) || `#${i + 1}`;
      const n = (used.get(t) || 0) + 1;
      used.set(t, n);
      out.set(s.id, `${name} (${t}${n > 1 ? ` #${n}` : ""})`);
    });
  }
  return out;
}
