// TASKS.csv #2343 (2) (from #2210, WA gold) — a section's payload crosses two IPC hops (the main window -> the main process -> the section
// window), each a structured clone. At a ±100 m buffer on the WA gold copy it is 69 holes and 5,581 intervals, 1,035 kB: one clone of it took
// 25 ms in the page, most of it the 5,581 small interval objects and their repeated strings, and 69 x 63 trace points as objects. Packed:
// the intervals as columns (from / to as Float64Arrays, every other key's values as indexes into a table of its distinct values) and each
// trace as one Float64Array of md, x, y, z; a clone of typed arrays is a copy of their bytes. The section window unpacks it on arrival into
// the same objects as before (values, keys and their absence round-trip exactly), so nothing downstream changes.
// Small payloads (under PACK_MIN intervals) travel as they are.
export const PACK_MIN = 400;
const NUM_KEYS = new Set(["from", "to"]);

function packIntervals(rows) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cols = {};
  for (const k of keys) {
    if (NUM_KEYS.has(k) && rows.every((r) => typeof r[k] === "number")) {
      const a = new Float64Array(rows.length);
      for (let i = 0; i < rows.length; i++) a[i] = rows[i][k];
      cols[k] = { f64: a };
      continue;
    }
    const table = [], index = new Map(), ix = new Int32Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!Object.prototype.hasOwnProperty.call(r, k)) { ix[i] = -1; continue; } // the key absent on this row
      const v = r[k];
      if (v !== null && typeof v === "object") return null; // a nested value: not packed (sent as it is)
      let j = index.get(v);
      if (j === undefined) { j = table.length; table.push(v); index.set(v, j); }
      ix[i] = j;
    }
    cols[k] = { ix, table };
  }
  return { __packedRows: true, n: rows.length, keys, cols };
}

function unpackIntervals(p) {
  const out = new Array(p.n);
  for (let i = 0; i < p.n; i++) {
    const r = {};
    for (const k of p.keys) {
      const c = p.cols[k];
      if (c.f64) { r[k] = c.f64[i]; continue; }
      const j = c.ix[i];
      if (j >= 0) r[k] = c.table[j];
    }
    out[i] = r;
  }
  return out;
}

const isTracePoint = (q) => q && typeof q.md === "number" && typeof q.x === "number" && typeof q.y === "number" && typeof q.z === "number" && Object.keys(q).length === 4;

// the payload with its bulk packed (a shallow copy; the caller's objects are not touched)
export function packSectionPayload(payload) {
  if (!payload || !Array.isArray(payload.intervals) || payload.intervals.length < PACK_MIN) return payload;
  const iv = packIntervals(payload.intervals);
  const holes = Array.isArray(payload.holes) ? payload.holes.map((h) => {
    const t = h?.trace;
    if (!Array.isArray(t) || !t.every(isTracePoint)) return h;
    const a = new Float64Array(t.length * 4);
    for (let i = 0; i < t.length; i++) { const q = t[i]; a[4 * i] = q.md; a[4 * i + 1] = q.x; a[4 * i + 2] = q.y; a[4 * i + 3] = q.z; }
    return { ...h, trace: { __f64Trace: a } };
  }) : payload.holes;
  return { ...payload, ...(iv ? { intervals: iv } : {}), holes };
}

// back to the objects the section window draws from (a payload that was never packed comes back as it is)
export function unpackSectionPayload(payload) {
  if (!payload) return payload;
  const packedIv = payload.intervals?.__packedRows, packedTr = Array.isArray(payload.holes) && payload.holes.some((h) => h?.trace?.__f64Trace);
  if (!packedIv && !packedTr) return payload;
  const holes = packedTr ? payload.holes.map((h) => {
    const a = h?.trace?.__f64Trace;
    if (!a) return h;
    const t = new Array(a.length / 4);
    for (let i = 0; i < t.length; i++) t[i] = { md: a[4 * i], x: a[4 * i + 1], y: a[4 * i + 2], z: a[4 * i + 3] };
    return { ...h, trace: t };
  }) : payload.holes;
  return { ...payload, ...(packedIv ? { intervals: unpackIntervals(payload.intervals) } : {}), holes };
}
