// TASKS.csv #1821 (review #1646, Kodiak) — a surface sample's hover tooltip and what Identify shows for it. The tooltip listed all 49
// elements in 52 lines (760 px tall, run off an 835 px window) and Identify's 'Value' was the tooltip's second line (the first element,
// Ag 0.93 ppm) while the map was coloured by Cu (1,295 ppm). Now the coloured element and its class come first, the tooltip keeps a
// few key elements and says how many more there are, and Identify lists every element and the sample's own fields (Lithology,
// Alteration, Description). Moved out of ViewerModule (#1084 size cap).
import { t as tr } from "../i18n.js";

// commodity and common pathfinder elements, read first; the rest keep the file's order
const KEY = ["Cu", "Au", "Ag", "Zn", "Pb", "Mo", "As", "Sb", "Ni", "Co", "Bi", "Te", "W", "Sn", "Hg", "Mn"];
export function orderedElements(values, first = []) {
  const syms = Object.keys(values || {}).filter((s) => values[s] != null);
  const rank = (s) => { const f = first.indexOf(s); if (f >= 0) return f; const k = KEY.indexOf(s); return k >= 0 ? 100 + k : 1000 + syms.indexOf(s); };
  return syms.sort((a, b) => rank(a) - rank(b));
}

const fmt = (v) => (!Number.isFinite(v) ? String(v ?? "") : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : +v.toPrecision(4));

// What the sample is coloured by, from the anomaly map (#843): { sym, label, value, cls, isolated } or null (coloured by medium).
// j: the sample's index in surfaceSamples.
export function mappedOfSample(an, cfg, j, units = {}) {
  if (!an || !cfg || j < 0) return null;
  const cl = an.classOf[j], cls = cl >= 0 ? tr(an.classes[cl].label) : tr("no value"), isolated = !!an.isolated?.[j];
  if (an.mode === "element" && cfg.symbol) return { sym: cfg.symbol, label: `${cfg.symbol} (${units[cfg.symbol] || "ppm"})`, value: an.values?.[j], cls, isolated };
  if (an.mode === "hotspot") return { sym: cfg.symbol || null, label: tr("Hot-spot z (Gi*)"), value: an.stat?.[j], cls, isolated };
  return { sym: null, label: tr("Pathfinder index"), value: an.values?.[j], cls, isolated };
}

export function surfaceSampleTip(row, { units = {}, mapped = null, max = 8 } = {}) {
  const lines = [`Surface sample${row.sample_id ? ` ${row.sample_id}` : ""} (${row.medium})`];
  if (mapped) {
    lines.push(`${mapped.label}: ${Number.isFinite(mapped.value) ? fmt(mapped.value) : tr("no value")}`);
    lines.push(`${mapped.cls}${mapped.isolated ? ` · ${tr("isolated anomaly")}` : ""}`);
  }
  const els = orderedElements(row.values).filter((s) => s !== mapped?.sym);
  for (const s of els.slice(0, max)) lines.push(`${s}: ${row.values[s]}${units[s] || "ppm"}`);
  if (els.length > max) lines.push(tr("+{n} more elements (Identify lists them all)", { n: els.length - max }));
  lines.push(`${row.x.toFixed(0)}E ${row.y.toFixed(0)}N ${row.z.toFixed(0)}Z${row.zDraped ? " (from the terrain — no elevation in the file)" : row.zFlat ? " (flat at the plan elevation — no elevation in the file and no terrain)" : ""}`); // #606, #1818
  return lines.join("\n");
}

// Identify's fields for a sample: the coloured element and its class, every element (key ones first), then the sample's own fields
export function sampleIdentifyFields(row, mapped, units = {}) {
  const f = [];
  if (mapped) { f.push([mapped.label, Number.isFinite(mapped.value) ? String(fmt(mapped.value)) : tr("no value")], [tr("Class"), `${mapped.cls}${mapped.isolated ? ` · ${tr("isolated anomaly")}` : ""}`]); }
  for (const s of orderedElements(row.values, mapped?.sym ? [mapped.sym] : [])) if (s !== mapped?.sym) f.push([s, `${fmt(row.values[s])} ${units[s] || "ppm"}`]);
  for (const [k, v] of Object.entries(row.attrs || {})) if (v != null && v !== "") f.push([k, String(v)]);
  return f;
}
