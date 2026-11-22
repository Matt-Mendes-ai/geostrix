// TASKS.csv #4012 — "Group these as one Mineralization layer": custom layers that each hold one mineral's per cent (a mineral database imported as
// one numeric layer per mineral, #3205 / #3307) become the fields of ONE wide-form Mineralization layer, so code chips, colours, Total sulphides
// (#3941), Width by (#3942), Bars (#3943 / #4008) and Pizza slices (#3990) work on them. Pure (no React).
//   - rows are joined by hole and depth: where the layers' intervals differ, each hole is cut at the union of every boundary, and each piece takes the
//     value of every layer covering it (the larger where one layer overlaps itself); a piece no layer covers is not made
//   - a piece's code is its dominant mineral, its extra the total of the minerals; a piece whose minerals are all zero is left out
//   - Merge keeps an existing Mineralization layer's minerals (long or wide form) as more sources of the same join
import { rowsOf } from "./rowTable.js";
import { intervalRows } from "./customBars.js";
import { mineralCode } from "./perMineralColumns.js";
import { wideMineralFields, fieldOf } from "./totalSulphides.js";

export const GROUP_MIN_LAYERS = 2;
const PERCENT_UNIT = /^(%|pct|percent|per ?cent|vol\.? ?%)/i;
const round = (x) => Math.round(x * 1e6) / 1e6;
const PROVENANCE = "_src";
export const GROUP_SRC = "Grouped from custom layers";
// the keys a piece never copies from an existing row (the join writes them again, or they are the fields themselves)
const OWN = new Set(["hole_id", "from", "to", "value", "extra", "depth", PROVENANCE, "_id", "all_codes", "codes", "as_logged", "Total sulphides (%)"]);

// the field a layer becomes: the mineral part of its name ('Zinc project: MN_CPY_pct' -> 'CPY_pct'), named so the Mineralization layer reads it as an
// amount ('Chalcopyrite' -> 'Chalcopyrite (%)'); the same name twice gets a number
export function fieldNameOf(layerName, taken = new Set()) {
  let n = String(layerName ?? "").split(/:\s+/).pop().trim().replace(/^(mn|min|mnl)[\s_-]+(?=.)/i, "").replace(/\.(csv|txt|xlsx?)$/i, "") || "Mineral";
  if (!wideMineralFields([{ [n]: 1 }]).length) n += " (%)";
  let out = n, i = 2;
  while (taken.has(out)) out = `${n} ${i++}`;
  return out;
}

// -> the reasons the layers cannot be grouped: [{ kind: "few" | "units" | "empty", ... }]; none = fine
export function groupProblems(layers) {
  const out = [], list = layers || [];
  if (list.length < GROUP_MIN_LAYERS) out.push({ kind: "few" });
  const empty = list.filter((l) => !intervalRows(l).length).map((l) => l.name || l.id);
  if (empty.length) out.push({ kind: "empty", names: empty });
  const bad = [...new Set(list.map((l) => String(l.unit || "").trim()).filter((u) => u && !PERCENT_UNIT.test(u)))];
  if (bad.length) out.push({ kind: "units", units: bad });
  return out;
}

// an existing Mineralization layer's minerals as sources: wide form -> each of its fields; long form -> one source per code (its extra)
function existingSources(rows) {
  const list = rowsOf(rows) || [], out = [], wide = wideMineralFields(list);
  const num = (v) => (v === "" || v == null ? NaN : Number(v));
  if (wide.length) {
    for (const f of wide) { const iv = []; for (const r of list) { const a = num(r.from), b = num(r.to), v = num(fieldOf(r, f.key)); if (Number.isFinite(a) && Number.isFinite(b) && b > a && Number.isFinite(v)) iv.push({ hole_id: r.hole_id, from: a, to: b, v }); } out.push({ name: f.key, exact: true, iv }); }
    return { sources: out, skipped: 0 };
  }
  const by = new Map(); let skipped = 0;
  for (const r of list) {
    const a = num(r.from), b = num(r.to), v = num(r.extra), code = String(r.value ?? "").trim();
    if (!code || !Number.isFinite(v) || !(b > a)) { skipped++; continue; }
    if (/[;,/+&]/.test(code)) { skipped++; continue; } // several minerals under one per cent: not split
    if (!by.has(code)) by.set(code, []);
    by.get(code).push({ hole_id: r.hole_id, from: a, to: b, v });
  }
  for (const [code, iv] of by) out.push({ name: code, exact: false, iv });
  return { sources: out, skipped };
}

// layers: the picked custom layers (in the order of the list); existing: the Mineralization layer's rows to keep (merge) or null (replace / none)
// -> { rows, fields: [{ key, code, layerId }], stats: { layers, fields, intervals, holes, split, left, kept, skipped } } | { problems }
export function groupMinerals(layers, existing = null) {
  const problems = groupProblems(layers);
  if (problems.length) return { problems };
  const sources = [], fresh = new Set(), mine = layers.map((l) => { const key = fieldNameOf(l.name || l.id, fresh); fresh.add(key); return { l, key }; });
  const taken = new Set(fresh);
  let skipped = 0;
  const old = existing && (rowsOf(existing) || []).length ? existingSources(existing) : null;
  // a mineral the Mineralization layer already has is replaced by the new layer's (never counted twice in the total)
  if (old) { skipped = old.skipped; for (const s of old.sources) { if (fresh.has(s.exact ? s.name : fieldNameOf(s.name))) continue; const key = s.exact ? s.name : fieldNameOf(s.name, taken); taken.add(key); sources.push({ key, code: mineralCode(key), layerId: null, iv: s.iv }); } }
  const kept = sources.length;
  for (const { l, key } of mine) sources.push({ key, code: mineralCode(key), layerId: l.id, iv: intervalRows(l) });
  // per hole: every interval of every source
  const holes = new Map();
  sources.forEach((s, si) => { for (const iv of s.iv) { const id = String(iv.hole_id); let h = holes.get(id); if (!h) holes.set(id, (h = { id: iv.hole_id, segs: [] })); h.segs.push({ ...iv, si }); } });
  // the old rows' text fields (a description) go to the pieces they cover
  const carry = old ? carryRows(existing, taken) : [];
  const rows = []; let split = 0, left = 0;
  for (const h of holes.values()) {
    const cuts = [...new Set(h.segs.flatMap((s) => [s.from, s.to]))].sort((a, b) => a - b);
    for (let p = 0; p + 1 < cuts.length; p++) {
      const a = cuts[p], b = cuts[p + 1], best = new Map(); let cut = false;
      for (const s of h.segs) if (s.from < b && s.to > a) { best.set(s.si, Math.max(best.has(s.si) ? best.get(s.si) : -Infinity, s.v)); if (s.from !== a || s.to !== b) cut = true; }
      if (!best.size) continue;
      let total = 0, top = null, topV = 0;
      for (const [si, v] of [...best].sort((x, y) => x[0] - y[0])) if (v > 0) { total += v; if (v > topV) { topV = v; top = si; } }
      if (top == null) { left++; continue; }
      const row = { hole_id: h.id, from: a, to: b, value: sources[top].code, extra: round(total) };
      for (const [si, v] of best) row[sources[si].key] = v;
      for (const c of carry) if (String(c.hole_id) === String(h.id) && c.from < b && c.to > a) { Object.assign(row, c.text); break; }
      row[PROVENANCE] = GROUP_SRC;
      rows.push(row); if (cut) split++;
    }
  }
  return { rows, fields: sources.map((s) => ({ key: s.key, code: s.code, layerId: s.layerId })), stats: { layers: layers.length, fields: sources.length, intervals: rows.length, holes: holes.size, split, left, kept, skipped } };
}

// [{ hole_id, from, to, text: {key: value} }] of an existing layer's text fields (not the minerals, the code or the total)
function carryRows(existing, fieldKeys) {
  const list = rowsOf(existing) || [], wide = new Set(wideMineralFields(list).map((f) => f.key)), out = [];
  for (const r of list) {
    const text = {};
    for (const [k, v] of Object.entries(r || {})) if (!OWN.has(k) && !wide.has(k) && !fieldKeys.has(k) && !k.startsWith("_") && v !== "" && v != null) text[k] = v;
    if (Object.keys(text).length) out.push({ hole_id: r.hole_id, from: Number(r.from), to: Number(r.to), text });
  }
  return out;
}
