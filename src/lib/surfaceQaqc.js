// TASKS.csv #842 — QA/QC for surface-sample programs (soil, stream sediment, moss mat, rock chip). Matt: QC inserts are
// "variable, numerous, let user decide". The drillhole engine (qaqc.js #134 / #400 / #534) keys everything on hole_id +
// interval; surface samples have neither, and their QC arrives two ways:
//   * lab certificates (ALS-style CSVs, parsed by labCertificate.js #601). The "- QC" certificate holds the LAB's own
//     checks: "B89618-DUP" (a lab duplicate of sample B89618), "BLANK", and certified reference materials by name
//     (OXF28, G2000...). The "- Finalized" certificate holds the program's samples, and any sample id there that is
//     not a field sample in the project is one of the program's OWN inserts (standard / blank / field duplicate),
//     classified by its name (qaqc.js patterns) - or left "unclassified" for the user to decide.
//   * the sample file itself: rows whose sample-type column says STD / BLK / DUP (qaqc.js sampleTypeClass). They used
//     to be imported as soil samples (or dropped when they had no coordinates).
// QC records are kept apart from the samples (store surfaceQc), so they never reach maps, statistics or thresholds.
//
// Everything a program decides is a setting the user owns (surfaceQc.settings): how batches are formed (lab
// certificate or any sample column), the target insertion rate of each QC type ("one in N", none by default), the blank
// limit as a multiple of the detection limit, and the duplicate precision limit (RPD %) per duplicate type.
// Detection limits are read from the data (a "<x" result is stored at x / 2 with the element in sample.bdl).
import { valueIn, parseAssayValue, convertUnit } from "./geochem.js";
import { sampleTypeClass, DEFAULT_QAQC_PATTERNS, controlLimits } from "./qaqc.js";

export const DEFAULT_SURFACE_QC_SETTINGS = {
  batchBy: "certificate", // "certificate" | "attr:<column>"
  targets: { standard: null, blank: null, duplicate: null }, // one insert in N samples; null = no target
  blankMultiple: 5, // a blank fails above this many times the detection limit
  rpd: { field: 30, lab: 10, unknown: 20 }, // duplicate precision limits (|a - b| / mean, %)
  pairFloorMultiple: 10, // pairs whose mean is under this many times the detection limit are shown but not counted
};
export const emptySurfaceQc = () => ({ records: [], certificates: [], settings: { ...DEFAULT_SURFACE_QC_SETTINGS } });
export const qcSettings = (qc) => ({ ...DEFAULT_SURFACE_QC_SETTINGS, ...(qc?.settings || {}), targets: { ...DEFAULT_SURFACE_QC_SETTINGS.targets, ...(qc?.settings?.targets || {}) }, rpd: { ...DEFAULT_SURFACE_QC_SETTINGS.rpd, ...(qc?.settings?.rpd || {}) } });

const DUP_SUFFIX = /^(.+?)[\s_-]*(dup|dp|d|rep|re|r|fd|ld)\d*$/i;
// A lab-QC row name -> { kind, code | parent }
export function classifyLabQcName(name) {
  const s = String(name || "").trim();
  if (!s) return null;
  if (/^(blank|blk|bl|method\s*blank|pulp\s*blank|reagent\s*blank)\b/i.test(s)) return { kind: "blank", code: s };
  const d = /^(.+?)[\s_-]+(dup|dupl|duplicate|rep|repeat|replicate)$/i.exec(s);
  if (d) return { kind: "duplicate", parent: d[1].trim() };
  return { kind: "standard", code: s };
}
// A program insert found in a Finalized certificate (a sample id that is not a field sample) -> kind or null
export function classifyInsertName(name, patterns = DEFAULT_QAQC_PATTERNS) {
  const id = String(name || "").toLowerCase();
  if (!id) return null;
  if (patterns.blank.some((p) => id.includes(p))) return "blank";
  if (patterns.duplicate.some((p) => id.includes(p))) return "duplicate";
  if (patterns.standard.some((p) => id.includes(p))) return "standard";
  return null;
}

// Certificate row -> { values (project units), bdl, over, methods } for the project's elements. Of several columns for
// one element (a multi-element package and an ore-grade or gravimetric finish), the first with an in-range result is
// used and its method recorded (so a mixed-method element can be flagged). An over-range result (">10000") is used
// only when no other column has one, and is then listed in `over` (it is a floor, not a value): found on 28151Z,
// where a lab duplicate's ore-grade Cu (1.33 %) was otherwise compared with its original's ICP ">10000" ppm.
export function certValues(row, columns, elementUnits) {
  const values = {}, bdl = [], over = [], methods = {};
  for (const pass of ["in", "over"]) {
    for (const c of columns) {
      const sym = c.symbol;
      if (!sym || !/^[A-Z][a-z]?$/.test(sym) || values[sym] != null) continue; // element symbols only ("Au Check", screen-fire fractions are not)
      const raw = row[c.header];
      if (raw == null || String(raw).trim() === "") continue;
      const isOver = String(raw).trim().startsWith(">");
      if ((pass === "in") === isOver) continue;
      const v = parseAssayValue(raw);
      if (v == null || !Number.isFinite(v)) continue;
      const target = elementUnits[sym] || (c.unit === "%" ? "%" : c.unit === "ppb" ? "ppb" : "ppm");
      const conv = convertUnit(v, c.unit || "ppm", target);
      if (conv == null) continue;
      values[sym] = conv;
      if (String(raw).trim().startsWith("<")) bdl.push(sym);
      if (isOver) over.push(sym);
      if (c.method) methods[sym] = c.method;
    }
  }
  return { values, bdl, over, methods };
}

// Parsed certificates (labCertificate.parseLabCertificate, one per file) + the project's surface samples ->
// { records, certificates, joined: { sampleId: certificate }, unclassified: [ids], counts }
export function qcFromCertificates(parsed, surfaceSamples, elementUnits) {
  const fieldIds = new Set(surfaceSamples.map((s) => String(s.sample_id || "").trim()).filter(Boolean));
  const records = [], certificates = [], joined = {}, unclassified = [];
  const finalizedValues = new Map(); // sample id -> values from a Finalized certificate (a lab duplicate's original)
  const isQcFile = (p) => /\bqc\b/i.test(p.meta?.status || "") || /qc\.csv$/i.test(p.meta?.file || "");
  parsed.filter((p) => !isQcFile(p)).forEach((p) => p.rows.forEach((r) => finalizedValues.set(String(r.sample_id).trim(), certValues(r, p.columns, elementUnits))));
  for (const p of parsed) {
    const cert = p.meta?.certificate || p.meta?.file || "certificate";
    const qcFile = isQcFile(p);
    const entry = certificates.find((c) => c.id === cert) || (certificates.push({ id: cert, received: p.meta?.received || null, finalized: p.meta?.finalized || null, project: p.meta?.project || null, samples: 0, methods: {} }), certificates[certificates.length - 1]);
    p.columns.forEach((c) => { if (c.symbol && c.method) (entry.methods[c.symbol] ||= new Set()).add(c.method); });
    for (const r of p.rows) {
      const id = String(r.sample_id || "").trim();
      if (!id) continue;
      const v = certValues(r, p.columns, elementUnits);
      if (!Object.keys(v.values).length) continue;
      if (qcFile) {
        const c = classifyLabQcName(id);
        if (!c) continue;
        const rec = { id: `${cert}|${id}|${records.length}`, sample_id: id, kind: c.kind, source: "lab", batch: cert, ...v };
        if (c.kind === "standard") rec.code = c.code;
        if (c.kind === "duplicate") { rec.parent_id = c.parent; rec.dupType = "lab"; const o = finalizedValues.get(c.parent); if (o) { rec.orig = o.values; if (o.over.length) rec.origOver = o.over; } }
        records.push(rec);
        continue;
      }
      entry.samples++;
      if (fieldIds.has(id)) { joined[id] = cert; continue; }
      const kind = classifyInsertName(id);
      if (kind) {
        const rec = { id: `${cert}|${id}|${records.length}`, sample_id: id, kind, source: "inserted", batch: cert, ...v };
        if (kind === "standard") rec.code = id.replace(/[\s_-]*\d+$/, "") || id;
        if (kind === "duplicate") {
          rec.dupType = "field"; rec.parent_id = DUP_SUFFIX.exec(id)?.[1]?.trim() || null;
          const o = rec.parent_id ? finalizedValues.get(rec.parent_id) : null; // the field original, when it is not a project sample
          if (o) { rec.orig = o.values; if (o.over.length) rec.origOver = o.over; }
        }
        records.push(rec);
      } else unclassified.push(id);
    }
  }
  certificates.forEach((c) => { c.methods = Object.fromEntries(Object.entries(c.methods).map(([k, s]) => [k, [...s]])); });
  const counts = { standard: 0, blank: 0, duplicate: 0 };
  records.forEach((r) => counts[r.kind]++);
  return { records, certificates, joined, unclassified, counts };
}

// Rows of a surface-sample FILE marked as QC by their sample-type value -> records (kept even without coordinates)
export function qcRecordFromFileRow({ sample_id, type, values, bdl, parent_id, attrs }) {
  const kind = sampleTypeClass(type);
  if (kind !== "standard" && kind !== "blank" && kind !== "duplicate") return null;
  const rec = { id: `file|${sample_id || ""}|${Math.random().toString(36).slice(2, 8)}`, sample_id: sample_id || "", kind, source: "inserted", type: String(type), values, ...(bdl?.length ? { bdl } : {}), ...(attrs ? { attrs } : {}) };
  if (kind === "standard") rec.code = attrs?.CRM || attrs?.crm || attrs?.Standard || attrs?.STANDARD || String(type);
  if (kind === "duplicate") { rec.parent_id = parent_id || null; rec.dupType = /lab|pulp|rep/i.test(type) ? "lab" : "field"; }
  return rec;
}

// ---------- the checks ----------
export const batchKeyOf = (settings) => {
  const by = settings.batchBy || "certificate";
  if (by.startsWith("attr:")) { const k = by.slice(5); return (s) => (s.attrs?.[k] ?? "(blank)"); }
  return (s) => s.cert || s.batch || "(no certificate)";
};

// Per batch: samples, inserts by kind (program inserts and lab checks apart), the rate "one in N", and the target check
// With certificate batches, a certificate's own sample count is used when it holds more samples than the project
// (the field samples of another file or year): `fromCertificate` says so.
export function batchSummary(samples, records, settings, certificates = []) {
  const key = batchKeyOf(settings), by = new Map();
  const get = (k) => by.get(k) || (by.set(k, { batch: k, samples: 0, standard: 0, blank: 0, duplicate: 0, lab: { standard: 0, blank: 0, duplicate: 0 } }), by.get(k));
  samples.forEach((s) => get(String(key(s))).samples++);
  records.forEach((r) => { const b = get(String(r.batch ?? key(r))); if (r.source === "lab") b.lab[r.kind]++; else b[r.kind]++; });
  if ((settings.batchBy || "certificate") === "certificate") {
    certificates.forEach((c) => {
      const b = get(String(c.id));
      const programInserts = b.standard + b.blank + b.duplicate; // a certificate's count includes the program's own inserts
      const certSamples = Math.max(0, (c.samples || 0) - programInserts);
      if (certSamples > b.samples) { b.samples = certSamples; b.fromCertificate = true; }
    });
  }
  return [...by.values()].map((b) => {
    const rate = (n) => (n > 0 && b.samples > 0 ? b.samples / n : null);
    const short = {};
    for (const k of ["standard", "blank", "duplicate"]) {
      const t = settings.targets?.[k];
      short[k] = t ? (b[k] === 0 ? b.samples >= t : b.samples / b[k] > t * 1.0001) : false; // fewer inserts than one in t
    }
    return { ...b, rate: { standard: rate(b.standard), blank: rate(b.blank), duplicate: rate(b.duplicate) }, short };
  }).sort((a, b) => String(a.batch).localeCompare(String(b.batch), undefined, { numeric: true }));
}

// Detection limit of an element from the data: the most common doubled '<' value, else the lowest positive value
export function detectionLimitOf(rows, symbol) {
  const counts = new Map();
  let minPos = Infinity;
  for (const r of rows) {
    const v = r?.values?.[symbol];
    if (!(v > 0)) continue;
    if (r.bdl?.includes(symbol)) { const dl = Math.round(v * 2 * 1e9) / 1e9; counts.set(dl, (counts.get(dl) || 0) + 1); } else if (v < minPos) minPos = v;
  }
  if (counts.size) { let best = null, n = -1; counts.forEach((c, x) => { if (c > n || (c === n && x < best)) { best = x; n = c; } }); return { limit: best, basis: "lt" }; }
  return Number.isFinite(minPos) ? { limit: minPos, basis: "min" } : { limit: null, basis: null };
}

// Standards grouped by code, each with its points (in record order), limits (certified when given) and flags
export function standardsByCode(records, symbol, elementUnits, certificates = {}) {
  const by = new Map();
  records.filter((r) => r.kind === "standard").forEach((r) => { const k = r.code || r.sample_id; (by.get(k) || by.set(k, []).get(k)).push(r); });
  return [...by.entries()].map(([code, rows]) => {
    const points = rows.map((r, i) => ({ i, sample_id: r.sample_id, batch: r.batch, source: r.source, value: valueIn(r, symbol, elementUnits[symbol] || "ppm", elementUnits) })).filter((p) => p.value != null);
    const observed = controlLimits(points.map((p) => p.value));
    const c = certificates?.[code]?.[symbol];
    const cert = c && Number.isFinite(c.mean) && Number.isFinite(c.sd) && c.sd > 0 ? c : null;
    const limits = !observed ? null : cert ? { mean: cert.mean, sd: cert.sd, certified: true } : { mean: observed.mean, sd: observed.sd, certified: false };
    const flagged = limits ? points.map((p) => { const z = limits.sd > 0 ? (p.value - limits.mean) / limits.sd : 0; return { ...p, z, out2: Math.abs(z) > 2, out3: Math.abs(z) > 3 }; }) : [];
    return { code, n: points.length, points: flagged, limits, observed, biasPct: cert && observed && cert.mean ? ((observed.mean - cert.mean) / cert.mean) * 100 : null, fails: flagged.filter((p) => p.out3).length };
  }).filter((g) => g.n > 0).sort((a, b) => b.n - a.n);
}

export function blankResults(records, symbol, elementUnits, limit) {
  return records.filter((r) => r.kind === "blank").map((r) => ({ sample_id: r.sample_id, batch: r.batch, source: r.source, value: valueIn(r, symbol, elementUnits[symbol] || "ppm", elementUnits), bdl: !!r.bdl?.includes(symbol) }))
    .filter((r) => r.value != null).map((r) => ({ ...r, fails: limit != null && !r.bdl && r.value > limit }));
}

// Duplicate pairs: the original from the project's samples by id, else from the certificate (r.orig)
export function duplicatePairsSurface(records, samples, symbol, elementUnits, { rpd = DEFAULT_SURFACE_QC_SETTINGS.rpd, floor = 0 } = {}) {
  const byId = new Map(samples.map((s) => [String(s.sample_id || "").trim(), s]));
  const unit = elementUnits[symbol] || "ppm";
  const out = [];
  records.filter((r) => r.kind === "duplicate").forEach((r) => {
    // the project sample when it has this element, else the original's result on the certificate
    const found = r.parent_id ? byId.get(String(r.parent_id).trim()) : null;
    const parent = found && found.values?.[symbol] != null ? found : null;
    const v1 = parent ? valueIn(parent, symbol, unit, elementUnits) : r.orig?.[symbol] != null ? valueIn({ values: r.orig }, symbol, unit, elementUnits) : null;
    const v2 = valueIn(r, symbol, unit, elementUnits);
    if (v1 == null || v2 == null) return;
    if (r.over?.includes(symbol) || r.origOver?.includes(symbol) || parent?.over?.includes(symbol)) return; // a floor is not a result
    const mean = (v1 + v2) / 2, d = mean > 0 ? (Math.abs(v1 - v2) / mean) * 100 : 0, type = r.dupType || "unknown", lim = rpd[type] ?? rpd.unknown;
    out.push({ sample_id: r.sample_id, parent_id: r.parent_id, batch: r.batch, source: r.source, type, v1, v2, rpd: d, limit: lim, counted: !(floor > 0 && mean < floor), fails: !(floor > 0 && mean < floor) && d > lim });
  });
  return out;
}
export function duplicateStats(pairs) {
  const used = pairs.filter((p) => p.counted), byType = {};
  used.forEach((p) => { const b = byType[p.type] || (byType[p.type] = { n: 0, within: 0, limit: p.limit }); b.n++; if (!p.fails) b.within++; });
  return { n: pairs.length, used: used.length, within: used.filter((p) => !p.fails).length, byType };
}

// Share of each element reported below detection in the samples, and the methods it was reported by
export function censoredShares(samples, elements) {
  return elements.map((e) => {
    const has = samples.filter((s) => s.values?.[e.symbol] != null);
    const bdl = has.filter((s) => s.bdl?.includes(e.symbol)).length;
    return { symbol: e.symbol, unit: e.unit, n: has.length, bdl, pct: has.length ? (100 * bdl) / has.length : 0 };
  });
}
export function methodsByElement(certificates) {
  const m = {};
  (certificates || []).forEach((c) => Object.entries(c.methods || {}).forEach(([sym, list]) => list.forEach((x) => (m[sym] ||= new Set()).add(x))));
  return Object.fromEntries(Object.entries(m).map(([k, s]) => [k, [...s]]));
}
