// TASKS.csv #1649 / #1502 (reviews #1645 Copley, #1497 Lawyers) — a guessed log layer that already holds rows from ANOTHER file for the same holes:
// importing there replaces (or, in one drop, mixes into) the real log. Copley's QuickLog was pre-set to Alteration (279 rows of the real log),
// SWIR_Halo to Veins; Lawyers' Vein Min was appended into Mineralization unseen. Shared by the import pipeline and its hook (read while the
// dialog renders). layers: the project's interval layers -> { target, n, src, holes } or null
import { LAYER_META } from "../layers.js";
export function layerOverlapOf(layers, target, mapping, rows, fileName) {
  if (!LAYER_META[target] || !mapping?.hole_id) return null;
  const existing = layers?.[target];
  if (!existing?.length) return null;
  const name = String(fileName ?? "").replace(/ \(\d+ more queued\)$/, "");
  const holes = new Set(rows.map((r) => String(r[mapping.hole_id] ?? "").trim()).filter(Boolean));
  const bySrc = new Map(); let n = 0; const hit = new Set();
  for (const r of existing) if (holes.has(r.hole_id) && r._src !== name) { n++; hit.add(r.hole_id); bySrc.set(r._src || "", (bySrc.get(r._src || "") || 0) + 1); }
  if (!n) return null;
  const src = [...bySrc.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { target, n, src, holes: hit.size };
}
