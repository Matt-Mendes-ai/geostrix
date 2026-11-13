// TASKS.csv #3038 (from #2885, review #2876 WA iron) — a big downhole log read as typed columns AS IT IS READ, in the parse worker: the 121 MB
// WA iron log was 2.58 M row objects before its dialog opened (35 s, about 1 GB of heap). Here each reading keeps only its hole (an index into
// the holes), its depth (the depth column, or the middle of From / To, as readingDepth) and each channel's number (NaN when not a number):
// about 36 bytes a reading with three channels, and the arrays move to the window's thread without a copy. The first `sampleN` rows are kept
// as they are, for the dialog's preview and its column guesses. The log functions (downholeLogChannels.js) take the table wherever they take
// the rows, so the no-data check, the bin menu and the binning see every reading, as before.
import { toNum, isNum, looksLikeLogTable, logChannelColumns } from "./downholeLogChannels.js";

// spec: { hole, depth?, from?, to?, channels: [column], sampleN }. -> { add(row), finish() -> { sample, table } }
export function makeLogReader({ hole, depth = null, from = null, to = null, channels = [], sampleN = 5000 }) {
  let cap = 1 << 16, n = 0;
  let holeIdx = new Int32Array(cap), dep = new Float64Array(cap);
  const ch = channels.map(() => new Float64Array(cap));
  const holes = [], holeOf = new Map(), sample = [];
  const grow = () => {
    cap *= 2;
    const h = new Int32Array(cap); h.set(holeIdx); holeIdx = h;
    const d = new Float64Array(cap); d.set(dep); dep = d;
    ch.forEach((a, k) => { const b = new Float64Array(cap); b.set(a); ch[k] = b; });
  };
  const num = (v) => (isNum(v) ? toNum(v) : NaN);
  function add(row) {
    if (sample.length < sampleN) sample.push(row);
    if (n === cap) grow();
    const id = String(row?.[hole] ?? "").trim();
    let k = -1;
    if (id) { k = holeOf.get(id); if (k === undefined) { k = holes.length; holes.push(id); holeOf.set(id, k); } }
    holeIdx[n] = k;
    if (depth) dep[n] = num(row?.[depth]);
    else { const f = num(row?.[from]), t = num(row?.[to]); dep[n] = f === f && t === t ? (f + t) / 2 : NaN; }
    for (let c = 0; c < channels.length; c++) ch[c][n] = num(row?.[channels[c]]);
    n++;
  }
  function finish() {
    const table = { n, holes, holeIdx: holeIdx.slice(0, n), depth: dep.slice(0, n), channels: Object.fromEntries(channels.map((c, k) => [c, ch[k].slice(0, n)])),
      mapping: { hole_id: hole, ...(depth ? { depth } : { from, to }) } };
    return { sample, table };
  }
  return { add, finish };
}

// the typed arrays of a table, for postMessage's transfer list
export const logTableBuffers = (t) => (t ? [t.holeIdx.buffer, t.depth.buffer, ...Object.values(t.channels).map((a) => a.buffer)] : []);

// does a table still stand for this import? The same hole and depth (or From / To) columns, and every ticked channel read
export function logTableFits(table, mapping, channels = []) {
  if (!table || !mapping) return false;
  const m = table.mapping;
  if ((mapping.hole_id || null) !== (m.hole_id || null)) return false;
  if (m.depth ? mapping.depth !== m.depth || !!mapping.from : mapping.depth || mapping.from !== m.from || mapping.to !== m.to) return false;
  return (channels || []).every((c) => !!table.channels[c]);
}

// TASKS.csv #3038 — is this table a downhole log, judged from its first rows the way the log dialog judges it (a hole column, a depth column
// or a From / To that is a log, named channels)? -> the reader's spec, or null. mapping: the import's own guess for a custom layer.
export function logReadSpec(headers, rows, mapping, { sampleN = 5000 } = {}) {
  if (!mapping?.hole_id) return null;
  const point = !!mapping.depth && !mapping.from, interval = !mapping.depth && !!mapping.from && !!mapping.to;
  if (!(point || interval) || !looksLikeLogTable(headers, rows)) return null;
  const channels = logChannelColumns(headers, rows, mapping).map((c) => c.col);
  if (!channels.length) return null;
  return { hole: mapping.hole_id, ...(point ? { depth: mapping.depth } : { from: mapping.from, to: mapping.to }), channels, sampleN };
}
// read in the parse worker as a log only past this size: a smaller log is quick to read as rows, and every import route takes rows
export const LOG_READ_MIN_BYTES = 20e6;
