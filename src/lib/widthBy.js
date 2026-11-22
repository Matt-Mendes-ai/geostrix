// TASKS.csv #3942 (Matt's first-time test: 'The cylinder should grow according to the percentage of total sulphide and mineral') — a
// Mineralization layer's tubes drawn wider where the per cent is higher: the layer style's 'Width by' (None, Total sulphides, or one mineral's
// per cent). The radius goes linearly from WIDTH_MIN to WIDTH_MAX times the layer's radius between 0 and the 'full width' value (blank: the
// 98th percentile of the values), capped there. The tube size choice (#3668 / #3876) then sizes the layer's base radius on screen and keeps
// these ratios (lib/viewer/tubeShader.js uTubeBaseR). Pure: the scale per row, the legend's sizes (the choices: lib/totalSulphides.js, loaded with
// the Style dialog).

export const WIDTH_MIN = 0.35, WIDTH_MAX = 2.5;
export const CODE_PREFIX = "code:"; // a long-form layer's one mineral: its rows' own per cent (extra); other minerals' rows draw at the minimum

// the per cent a row is widened by (NaN: none logged)
export function widthValueOf(row, by) {
  if (!by) return NaN;
  if (by.startsWith(CODE_PREFIX)) return String(row?.value) === by.slice(CODE_PREFIX.length) && row?.extra !== null && row?.extra !== "" ? Number(row?.extra) : NaN;
  const v = row?.[by];
  return v === null || v === "" || v === undefined ? NaN : Number(v);
}

const cache = new WeakMap(); // rows -> Map(by -> auto full value)
function autoFull(rows, by) {
  let m = cache.get(rows); if (!m) cache.set(rows, (m = new Map()));
  if (m.has(by)) return m.get(by);
  const vals = [];
  for (const r of rows) { const v = widthValueOf(r, by); if (Number.isFinite(v) && v > 0) vals.push(v); }
  vals.sort((a, b) => a - b);
  const full = vals.length ? vals[Math.min(vals.length - 1, Math.round(0.98 * (vals.length - 1)))] : NaN;
  m.set(by, full);
  return full;
}

// -> null (no Width by) | { by, full, auto, w(row): the radius factor, factorAt(value) }
export function widthScale(rows, st) {
  const by = st?.widthBy;
  if (!by || !rows?.length) return null;
  const auto = !(st.widthFull > 0), full = auto ? autoFull(rows, by) : st.widthFull;
  if (!(full > 0)) return null;
  const factorAt = (v) => (Number.isFinite(v) && v > 0 ? WIDTH_MIN + (WIDTH_MAX - WIDTH_MIN) * Math.min(1, v / full) : WIDTH_MIN);
  return { by, full, auto, factorAt, w: (row) => factorAt(widthValueOf(row, by)) };
}

const fmt = (v) => String(+Number(v).toPrecision(3));
// the legend's size key: three sizes (0 or none logged, half, full) as bars of their relative thickness -> a legend group
export function widthLegendGroup(key, layerLabel, s, label = s.by.startsWith(CODE_PREFIX) ? `${s.by.slice(CODE_PREFIX.length)} %` : s.by) {
  const bar = (f) => { const h = Math.max(1, Math.round((f / WIDTH_MAX) * 11)); return `<svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><rect x="0" y="${(12 - h) / 2}" width="18" height="${h}" rx="1" fill="currentColor" opacity="0.75"/></svg>`; };
  const items = [[`≥ ${fmt(s.full)}`, null, { svg: bar(WIDTH_MAX) }], [fmt(s.full / 2), null, { svg: bar(s.factorAt(s.full / 2)) }], ["0", null, { svg: bar(WIDTH_MIN) }]]; // numbers only: the label says what they are
  return { key: `${key}_width`, label: `${layerLabel} · width = ${label}`, items };
}
