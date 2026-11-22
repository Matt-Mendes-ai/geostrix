// TASKS.csv #3990 (Matt: 'we should have an option of pizza slice, that way I can plot multiple mineral on the same interval'; decided: 'it should
// follow percentage, draw as many as needed so to represent all minerals of that interval') — a Mineralization interval's tube cut into one wedge
// per mineral logged on it, each wedge's angle its share of the interval's total per cent. Every mineral gets its wedge (no cap, light drawing
// too); one too small to see still gets MIN_SLIVER per cent of the circle, taken from the largest. The long form groups the rows on the same
// hole, from and to (a mineral logged twice there counts once, its largest per cent); the wide form makes a row's wedges from its per-mineral
// number fields. Angles are whole per cents (the drawing shares one prototype per span), summing to 100. Pure; loaded with the slices.
import { mineralCodesOf, fieldOf } from "./totalSulphides.js";

export const MIN_SLIVER = 2; // per cent of the circle

// whole-per-cent spans for the values (their shares; none positive: equal), summing to 100, each at least min (less when there are too many)
export function wedgeSpans(values, min = MIN_SLIVER) {
  const n = (values || []).length;
  if (!n) return [];
  let tot = 0;
  for (const v of values) if (v > 0) tot += v;
  const raw = values.map((v) => (tot > 0 ? ((v > 0 ? v : 0) / tot) * 100 : 100 / n));
  const out = raw.map(Math.floor);
  let left = 100;
  for (const v of out) left -= v;
  raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, left).forEach(([, i]) => { out[i]++; });
  const floor = Math.max(1, Math.min(min, Math.floor(100 / n)));
  for (let i = 0; i < n; i++) {
    while (out[i] < floor) {
      let j = -1;
      for (let k = 0; k < n; k++) if (k !== i && out[k] > floor && (j < 0 || out[k] > out[j])) j = k;
      if (j < 0) break;
      out[j]--; out[i]++;
    }
  }
  return out;
}

const spansToParts = (items, order) => {
  items.sort((a, b) => order(a.code) - order(b.code) || String(a.code).localeCompare(String(b.code)));
  const spans = wedgeSpans(items.map((it) => it.pct));
  let at = 0;
  return items.map((it, i) => { const p = { code: it.code, pct: it.pct, lane: it.lane, start: at / 100, span: spans[i] }; at += spans[i]; return p; });
};

// -> { form, codes (the layer's, in lane order), parts: Map(row -> [{ code, pct, lane, start (0-1 of the circle), span (whole per cent) }]), noPct (long-form intervals with no per
// cent logged: equal wedges) }. A row with no part (a repeated mineral of its interval, a wide row with no mineral over 0) is not in the map.
const cache = new WeakMap();
export function slicesOf(rows) {
  if (!rows?.length) return { form: null, codes: [], parts: new Map(), noPct: 0 };
  const hit = cache.get(rows);
  if (hit) return hit;
  const info = mineralCodesOf(rows);
  const rank = new Map(info.codes.map((c, i) => [c.key, i]));
  const order = (code) => rank.get(code) ?? 1e9;
  const parts = new Map();
  let noPct = 0;
  if (info.form === "wide") {
    for (const r of rows) {
      const items = [];
      for (const c of info.codes) { const raw = fieldOf(r, c.key); const v = raw == null || raw === "" ? NaN : Number(raw); if (v > 0) items.push({ code: c.key, pct: v, lane: rank.get(c.key) }); }
      if (items.length) parts.set(r, spansToParts(items, order));
    }
  } else {
    const groups = new Map();
    for (const r of rows) {
      const from = Number(r?.from), to = Number(r?.to);
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
      const k = `${r.hole_id}|${from}|${to}`;
      let g = groups.get(k);
      if (!g) groups.set(k, (g = new Map()));
      const code = r.value == null || r.value === "" ? "" : String(r.value).trim();
      const pct = r.extra == null || r.extra === "" ? NaN : Number(r.extra);
      const e = g.get(code);
      if (!e) g.set(code, { row: r, code, pct, lane: rank.get(code) ?? 0 });
      else if (pct > (e.pct || 0)) e.pct = pct; // logged twice: once, its largest
    }
    for (const g of groups.values()) {
      const items = [...g.values()];
      if (!items.some((it) => it.pct > 0)) { if (items.length > 1) noPct++; items.forEach((it) => { it.pct = 1; }); } // no per cent: equal wedges, counted
      const ps = spansToParts(items, order);
      items.forEach((it, i) => parts.set(it.row, [ps[i]]));
    }
  }
  const res = { form: info.form, codes: info.codes.map((c) => c.key), parts, noPct }; // codes: in lane order (a wide layer's legend)
  cache.set(rows, res);
  return res;
}
