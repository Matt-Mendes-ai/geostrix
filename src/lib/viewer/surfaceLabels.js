// TASKS.csv #1192 — every dropdown of generated surfaces showed "Top of IMMOQ" four times, so a hangingwall could be picked from the wrong
// run. Names that repeat now carry the time of their run, and a counter when two runs share a minute. Pure.
// TASKS.csv #2782 (split from #2540) — repeats are told apart by the settings that differ between them (the source layer, the search,
// the cell, the trend, the domain, the intercept set), as the provenance saved them; the time only when no setting differs.
import { t as tr } from "../i18n.js";

const stamp = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "";
};
const metres = (v) => (Number.isFinite(Number(v)) ? String(Math.round(Number(v) * 10) / 10) : String(v));

// [read the setting from params, say it] — a value of null is said as its absence ('no trend'); undefined is not known (an older run)
const SETTINGS = [
  [(p) => p.sourceLayer, (v) => (v == null ? null : tr("from {v}", { v }))],
  [(p) => p.searchRadiusM, (v) => (v == null ? null : tr("{v} m search", { v: metres(v) }))],
  [(p) => p.cellSizeM, (v) => (v == null ? null : tr("{v} m cells", { v: metres(v) }))],
  [(p) => (p.anisotropy === undefined ? undefined : p.anisotropy?.trend ?? null), (v) => (v == null ? tr("no trend") : tr("trend {v}", { v }))],
  [(p) => p.domain, (v) => (v == null ? tr("no domain") : tr("domain {v}", { v }))],
  [(p) => (p.interceptSet === undefined ? undefined : p.interceptSet?.name ?? null), (v) => (v == null ? null : tr("intercept set {v}", { v }))],
];

// the settings that differ within one name's runs -> per surface the words for them ("" when none differ)
function differingSettings(list) {
  const parts = list.map(() => []);
  for (const [read, say] of SETTINGS) {
    const vals = list.map((s) => read(s.params || {}));
    if (vals.some((v) => v === undefined)) continue; // not saved for every run: no fair comparison
    const keys = vals.map((v) => JSON.stringify(v));
    if (new Set(keys).size < 2) continue;
    vals.forEach((v, i) => { const w = say(v); if (w) parts[i].push(w); });
  }
  return parts.map((p) => p.join(", "));
}

// surfaces: the list the dropdown shows -> Map id -> label
export function surfaceOptionLabels(surfaces) {
  const byName = new Map();
  for (const s of surfaces || []) (byName.get(s.name) || byName.set(s.name, []).get(s.name)).push(s);
  const out = new Map();
  for (const [name, list] of byName) {
    if (list.length === 1) { out.set(list[0].id, name); continue; }
    const words = differingSettings(list);
    const same = new Map(); for (const w of words) same.set(w, (same.get(w) || 0) + 1);
    const used = new Map();
    list.forEach((s, i) => {
      const time = stamp(s.params?.generatedAt ?? s.generatedAt);
      const t = (words[i] ? (same.get(words[i]) > 1 && time ? `${words[i]}, ${time}` : words[i]) : time) || `#${i + 1}`; // the same settings twice: their times too
      const n = (used.get(t) || 0) + 1;
      used.set(t, n);
      out.set(s.id, `${name} (${t}${n > 1 ? ` #${n}` : ""})`);
    });
  }
  return out;
}
