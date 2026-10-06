// TASKS.csv #601 — laboratory certificates (ALS "Finalized" CSVs) as an assay source, joined to the drillhole
// sample table by sample id, and QC-type SUGGESTIONS for the samples that exist only in the certificates.
//
// The real case (BC ARIS 41597Z, Woodjam): 23 certificates, 4,737 samples. 3,792 match the drillhole database's
// "Sample Number" (which carries hole / from / to); 945 do not — the blanks, standards and duplicates the
// geologist inserted into the sample stream, which exist ONLY in the certificates. Without them QAQC cannot run.
//
// Certificate layout (one or more blocks per file):
//   KL23193628 - Finalized
//   CLIENT : "…"   # of SAMPLES : 218   DATE RECEIVED : …  DATE FINALIZED : …   PROJECT : "…"   PO NUMBER : "…"
//   ,Au-ICP21,ME-MS61,…,Cu-OG62          <- method row (first cell empty)
//   SAMPLE,Au,Ag,…,Cu                     <- element symbols (Cu twice: ME-MS61 ppm and the OG62 ore-grade %)
//   DESCRIPTION,ppm,ppm,…,%               <- units
//   L690321, 0.066, 0.84, …               <- one row per sample; "<x" below detection, ">x" over range
// Each element column becomes "Cu ppm ME-MS61" / "Cu % Cu-OG62", so the existing column picker
// (pickElementColumns) chooses the main column and pairs the over-limit one exactly as for any assay table.
//
// QC suggestions are SUGGESTIONS: the review table shows each with its reason, and nothing is classified
// until the user accepts or edits it (Matt, 2026-10-06). Pure; tested in test/labCertificate.test.mjs.
import Papa from "papaparse";
import { parseAssayValue, isElementColumn } from "./geochem.js";

export function isLabCertificateText(text) {
  const head = String(text || "").slice(0, 20000);
  return /^\s*"?\S+ - [A-Za-z ]+"?\s*$/m.test(head.split(/\r?\n/).find((l) => l.trim()) || "") && /^SAMPLE,/m.test(head) && /^DESCRIPTION,/m.test(head);
}

const META_KEYS = { "CLIENT": "client", "# of SAMPLES": "samples", "DATE RECEIVED": "received", "DATE FINALIZED": "finalized", "PROJECT": "project", "CERTIFICATE COMMENTS": "comments", "PO NUMBER": "po" };

// text -> { meta, columns: [{ header, symbol, unit, method }], rows: [{ sample_id, certificate, [header]: raw }] }
export function parseLabCertificate(text, fileName = "") {
  const lines = Papa.parse(String(text || ""), { header: false, skipEmptyLines: false }).data;
  const meta = { file: fileName };
  const first = lines.find((l) => l.some((c) => String(c).trim()));
  const m = /^(\S+) - (.+)$/.exec(String(first?.[0] || "").trim());
  if (m) { meta.certificate = m[1]; meta.status = m[2].trim(); }
  for (const l of lines.slice(0, 40)) {
    const s = l.join(",");
    for (const [k, key] of Object.entries(META_KEYS)) {
      const r = new RegExp(`${k.replace(/[#]/g, "\\#")}\\s*:\\s*"?([^"]*?)"?(?=\\s{2,}[A-Z#]|$)`).exec(s);
      if (r && meta[key] == null) meta[key] = r[1].trim();
    }
  }
  const columns = [], rows = [];
  for (let i = 0; i < lines.length; i++) {
    if (String(lines[i][0]).trim() !== "SAMPLE") continue;
    const sym = lines[i], unit = lines[i + 1] && String(lines[i + 1][0]).trim() === "DESCRIPTION" ? lines[i + 1] : null;
    const method = i > 0 && String(lines[i - 1][0]).trim() === "" ? lines[i - 1] : [];
    if (!unit) continue;
    // block columns -> headers ("Cu ppm ME-MS61"); a repeated header (same element, unit and method) gets a suffix
    const blockCols = [];
    for (let j = 1; j < sym.length; j++) {
      const s = String(sym[j] || "").trim();
      if (!s) { blockCols.push(null); continue; }
      const u = String(unit[j] || "").trim(), me = String(method[j] || "").trim();
      let header = `${s} ${u}${me ? ` ${me}` : ""}`.trim();
      if (columns.some((c) => c.header === header && c.block !== i) || blockCols.some((c) => c?.header === header)) header = blockCols.some((c) => c?.header === header) ? `${header} (${j})` : header;
      const col = { header, symbol: s, unit: u, method: me, block: i };
      blockCols.push(col);
      if (!columns.some((c) => c.header === header)) columns.push(col);
    }
    for (let r = i + 2; r < lines.length; r++) {
      const row = lines[r];
      const id = String(row[0] ?? "").trim();
      if (!id || id === "SAMPLE" || (row.length === 1 && !id)) break;
      if (/ - /.test(id) || /^[A-Z #]+ :/.test(id)) break; // the next certificate's header block
      const out = { sample_id: id, certificate: meta.certificate || fileName };
      blockCols.forEach((c, k) => { if (c) out[c.header] = String(row[k + 1] ?? "").trim(); });
      rows.push(out);
    }
  }
  return { meta, columns: columns.map(({ block, ...c }) => c), rows };
}

// Several certificates -> one table ({ headers, rows, certificates }); a sample id repeated across certificates
// (a re-assay) keeps every row, flagged repeated.
export function combineCertificates(parsed) {
  const headers = ["sample_id", "certificate"];
  for (const p of parsed) for (const c of p.columns) if (!headers.includes(c.header)) headers.push(c.header);
  const rows = parsed.flatMap((p) => p.rows);
  const count = new Map(); rows.forEach((r) => count.set(r.sample_id, (count.get(r.sample_id) || 0) + 1));
  rows.forEach((r) => { if (count.get(r.sample_id) > 1) r._repeated = true; });
  return { headers, rows, certificates: parsed.map((p) => p.meta) };
}

const norm = (id) => String(id ?? "").trim().toUpperCase();

// certificate rows <-> loaded assays by sample id. matched: [{ cert, assay }]; unmatched: cert rows with no assay
// sample; assaysWithoutId: how many loaded assay rows carry no sample id at all.
export function joinCertificatesToAssays(certRows, assays) {
  const byId = new Map();
  let withoutId = 0;
  for (const a of assays || []) { const k = norm(a.sample_id); if (!k) { withoutId++; continue; } if (!byId.has(k)) byId.set(k, a); }
  const matched = [], unmatched = [];
  for (const r of certRows) { const a = byId.get(norm(r.sample_id)); if (a) matched.push({ cert: r, assay: a }); else unmatched.push(r); }
  return { matched, unmatched, assaysWithoutId: withoutId };
}

// ---- QC suggestions --------------------------------------------------------------------------------------
const PATHFINDERS = ["Au", "Ag", "Cu", "Pb", "Zn", "Mo", "As", "Sb", "Bi", "W", "S"];
const idParts = (id) => { const m = /^(.*?)(\d+)$/.exec(String(id).trim()); return m ? { prefix: m[1].toUpperCase(), n: Number(m[2]) } : null; };

// One value per element symbol for a certificate row (the first column of each symbol: the main method, ppm or %
// as the lab reported it — every row is compared in the same columns, so units cancel out).
function vectorOf(row, cols) {
  const v = {};
  for (const c of cols) {
    if (v[c.symbol] !== undefined) continue;
    const x = parseAssayValue(row[c.header]);
    if (x != null && Number.isFinite(x)) v[c.symbol] = Math.max(x, 0);
  }
  return v;
}
// median |log10 ratio| over shared elements (a small floor per element keeps "<DL" vs "<DL" at 0)
function distance(a, b, floor) {
  const d = [];
  for (const s in a) { if (b[s] === undefined) continue; const f = floor[s] || 1e-6; d.push(Math.abs(Math.log10((a[s] + f) / (b[s] + f)))); }
  if (d.length < 5) return Infinity;
  d.sort((x, y) => x - y);
  return d[Math.floor(d.length / 2)];
}

// the largest |log10 ratio| over the key ore elements both rows report above their floor: two reference materials
// cut from one host rock agree on most of ~48 elements and differ mainly here (Woodjam: Cu ~2,750 / Au 0.24 vs
// Cu ~6,250 / Au 0.18 sat in one group by the median alone)
const KEY_ELEMENTS = ["Cu", "Au", "Ag", "Mo", "Pb", "Zn", "As"];
function keyDistance(a, b, floor) {
  let m = 0;
  for (const s of KEY_ELEMENTS) {
    if (a[s] === undefined || b[s] === undefined) continue;
    const f = floor[s] || 1e-6;
    if (a[s] < 5 * f && b[s] < 5 * f) continue; // both near detection: no information
    m = Math.max(m, Math.abs(Math.log10((a[s] + f) / (b[s] + f))));
  }
  return m;
}

// unmatched certificate rows + the matched (drill) certificate rows -> per unmatched row:
// { sample_id, type: "blank" | "standard" | "duplicate" | "unclassified", qc_code?, parent_id?, reason }
// 1. blank: its pathfinders sit in the bottom 10 % of the drill samples (median percentile rank <= 0.10);
// 2. duplicate: within ~30 % (median log10 ratio <= 0.12) of a drill sample a few numbers before or after it;
// 3. standard: two or more inserts with the same multi-element signature (median log10 ratio <= 0.06, ~15 %, from
//    the group's median), one group per reference material, named CRM-A, CRM-B… (rename to the real CRM);
// 4. otherwise unclassified — the user decides.
export function suggestQcTypes(unmatched, drillRows, columns, { blankRank = 0.1, standardTol = 0.06, keyTol = 0.1, strongDuplicateTol = 0.04, duplicateTol = 0.12, neighbourWindow = 3 } = {}) {
  const cols = columns.filter((c) => isElementColumn(c.symbol));
  const drill = drillRows.map((r) => ({ id: r.sample_id, v: vectorOf(r, cols), p: idParts(r.sample_id) }));
  const cand = unmatched.map((r) => ({ id: r.sample_id, v: vectorOf(r, cols), p: idParts(r.sample_id) }));
  // per-element sorted drill values (percentile ranks) and a floor (5th percentile of positive values)
  const sorted = {}, floor = {};
  for (const d of drill) for (const s in d.v) (sorted[s] ||= []).push(d.v[s]);
  for (const s in sorted) { sorted[s].sort((a, b) => a - b); const pos = sorted[s].filter((x) => x > 0); floor[s] = pos.length ? pos[Math.floor(pos.length * 0.05)] : 1e-6; }
  const rank = (s, x) => { const a = sorted[s]; if (!a?.length) return null; let lo = 0, hi = a.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < x) lo = mid + 1; else hi = mid; } return lo / a.length; };
  const out = new Map();
  // 1. blanks
  for (const c of cand) {
    const ranks = PATHFINDERS.filter((s) => c.v[s] !== undefined && sorted[s]).map((s) => [s, rank(s, c.v[s])]);
    if (ranks.length < 3) continue;
    const med = ranks.map(([, r]) => r).sort((a, b) => a - b)[Math.floor(ranks.length / 2)];
    // and the main ore elements low too: a low- or mid-grade reference material can rank low on many pathfinders
    const ore = ranks.filter(([sym]) => sym === "Au" || sym === "Cu").map(([, r]) => r);
    if (med <= blankRank && ore.every((r) => r <= 0.25)) {
      const show = ranks.slice(0, 4).map(([s]) => `${s} ${c.v[s]}`).join(", ");
      out.set(c.id, { sample_id: c.id, type: "blank", reason: `Pathfinders at the bottom of the drill samples (median percentile ${Math.round(med * 100)}): ${show}` });
    }
  }
  // 2. duplicates FIRST: an insert within ~30 % of a drill sample just before / after it in the numbering. (Checked
  //    before grouping standards: duplicates of similar drill samples resemble each other, and on the Woodjam
  //    certificates single-linkage grouping chained 157 of them into a fake "standard" spanning Cu 15-4,990 ppm.)
  const byPrefix = new Map();
  for (const d of drill) if (d.p) (byPrefix.get(d.p.prefix) || byPrefix.set(d.p.prefix, []).get(d.p.prefix)).push(d);
  for (const arr of byPrefix.values()) arr.sort((a, b) => a.p.n - b.p.n);
  const markDuplicates = (tol) => { for (const c of cand) {
    if (out.has(c.id) || !c.p) continue;
    const arr = byPrefix.get(c.p.prefix) || [];
    let best = null, before = null;
    for (const d of arr) {
      if (Math.abs(d.p.n - c.p.n) > neighbourWindow) continue;
      const dist = distance(c.v, d.v, floor);
      if (dist > tol) continue;
      if (!best || dist < best.dist) best = { d, dist };
      if (d.p.n < c.p.n && (!before || d.p.n > before.d.p.n)) before = { d, dist }; // the nearest sample BEFORE it
    }
    if (before) best = before; // a field duplicate follows its original: prefer that one when it matches at all
    if (best) out.set(c.id, { sample_id: c.id, type: "duplicate", parent_id: best.d.id, strong: tol <= strongDuplicateTol, reason: `Within ~${Math.round((10 ** best.dist - 1) * 100)} % of ${best.d.id} (median over its elements) — a duplicate of that sample` });
  }
  };
  markDuplicates(strongDuplicateTol); // a close match (~10 %) first; looser ones only after the standards (step 3b)
  // 3. standards: inserts sharing one signature, grouped around each group's MEDIAN vector (not single linkage,
  //    which chained two reference materials, Cu ~2,500 and ~4,400 ppm, into one group)
  const rest = cand.filter((c) => !out.has(c.id));
  const medianVec = (members) => { const v = {}; for (const s in members[0].v) { const xs = members.map((m) => m.v[s]).filter((x) => x !== undefined).sort((a, b) => a - b); if (xs.length) v[s] = xs[Math.floor(xs.length / 2)]; } return v; };
  let groups = [];
  for (let pass = 0; pass < 3; pass++) { // assign, re-centre, repeat (k-medians with the group count found as we go)
    const next = groups.map((g) => ({ centre: g.centre, members: [] }));
    for (const c of rest) {
      let best = null;
      for (const g of next) { const dist = distance(c.v, g.centre, floor); if (dist <= standardTol && keyDistance(c.v, g.centre, floor) <= keyTol && (!best || dist < best.dist)) best = { g, dist }; }
      if (best) best.g.members.push(c); else next.push({ centre: c.v, members: [c] });
    }
    groups = next.filter((g) => g.members.length).map((g) => ({ centre: medianVec(g.members), members: g.members }));
  }
  const multi = groups.filter((g) => g.members.length >= 2).sort((a, b) => b.members.length - a.members.length);
  // a repeated LOW signature is blank material, not a reference material (Woodjam: 9 inserts in the blank slots whose
  // Cu sat just above the bottom quarter of the drill samples)
  const medRank = (v) => { const r = PATHFINDERS.filter((x) => v[x] !== undefined && sorted[x]).map((x) => rank(x, v[x])).sort((a, b) => a - b); return r.length >= 3 ? r[Math.floor(r.length / 2)] : 1; };
  const oreLow = (v) => ["Au", "Cu"].every((x) => v[x] === undefined || !sorted[x] || rank(x, v[x]) <= 0.5);
  const blankGroups = multi.filter((g) => medRank(g.centre) <= blankRank && oreLow(g.centre));
  blankGroups.forEach((g) => g.members.forEach((c) => out.set(c.id, { sample_id: c.id, type: "blank", reason: `One of ${g.members.length} inserts with the same LOW signature (median percentile ${Math.round(medRank(g.centre) * 100)} of the drill samples${g.centre.Cu != null ? `, Cu ≈ ${g.centre.Cu}` : ""}) — blank material` })));
  multi.filter((g) => !blankGroups.includes(g)).forEach((g, k) => {
    const code = `CRM-${String.fromCharCode(65 + (k % 26))}${k >= 26 ? Math.floor(k / 26) : ""}`;
    const cu = g.centre.Cu, au = g.centre.Au;
    const sig = [cu != null ? `Cu ≈ ${cu}` : null, au != null ? `Au ≈ ${au}` : null].filter(Boolean).join(", ");
    g.members.forEach((c) => out.set(c.id, { sample_id: c.id, type: "standard", qc_code: code, reason: `Same multi-element signature as ${g.members.length - 1} other insert(s)${sig ? ` (${sig})` : ""} — one reference material` }));
  });
  // 3b. looser duplicates (up to ~30 %) among what is left — after the standards, so a standard that happens to
  //     resemble a nearby high-grade sample (Woodjam L690330: ~21 % from L690328) stays a standard
  markDuplicates(duplicateTol);
  // 4. the insertion PATTERN as tie-breaker. QC is inserted on a rhythm (Woodjam: every 5th number, the 0/10 slots
  //    standards, the 5/15 slots blanks or duplicates). Learn it from the CONFIDENT suggestions (close duplicates,
  //    standards in a group, blanks); then an insert whose own evidence is weak (a loose duplicate, or unclassified)
  //    in a slot that is >= 90 % one type gets that type, and the reason says so. One-off standards get their own
  //    "Unknown (id)" material, so they are never charted with another.
  const confident = (r) => r && ((r.type === "standard") || r.type === "blank" || (r.type === "duplicate" && r.strong));
  const nums = cand.filter((c) => c.p).map((c) => c.p.n).sort((a, b) => a - b);
  const gaps = new Map(); for (let i = 1; i < nums.length; i++) { const g = nums[i] - nums[i - 1]; if (g > 0 && g <= 50) gaps.set(g, (gaps.get(g) || 0) + 1); }
  const step = [...gaps.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (step && cand.length >= 20) {
    let bestP = null;
    for (let k = 1; k <= 6; k++) {
      const P = step * k, cls = new Map();
      for (const c of cand) { const r = out.get(c.id); if (!c.p || !confident(r)) continue; const key = c.p.n % P; const m = cls.get(key) || new Map(); m.set(r.type, (m.get(r.type) || 0) + 1); cls.set(key, m); }
      let pure = 0, total = 0;
      for (const m of cls.values()) { const v = [...m.values()]; pure += Math.max(...v); total += v.reduce((a, x) => a + x, 0); }
      const purity = total ? pure / total : 0;
      if (!bestP || purity > bestP.purity + 0.02) bestP = { P, cls, purity };
    }
    if (bestP && bestP.purity >= 0.6) {
      for (const c of cand) {
        const r = out.get(c.id);
        if (!c.p || confident(r)) continue;
        const m = bestP.cls.get(c.p.n % bestP.P); if (!m) continue;
        const tot = [...m.values()].reduce((a, x) => a + x, 0);
        const [type, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
        if (tot < 5 || n / tot < 0.9 || r?.type === type) continue;
        if (type === "duplicate") continue; // a duplicate needs its own original: the pattern cannot supply one
        const was = r ? `its own match was weak (${r.type === "duplicate" ? `~${r.reason.match(/~(\d+) %/)?.[1] ?? "?"} % from ${r.parent_id}` : "none"})` : "no match of its own";
        out.set(c.id, { sample_id: c.id, type, ...(type === "standard" ? { qc_code: `Unknown (${c.id})` } : {}), reason: `Sits in a ${type} slot of the insertion pattern (every ${bestP.P} numbers: ${n} of ${tot} inserts in this slot are ${type}s); ${was}${type === "standard" ? " — a reference material used only here: name it if you know it" : ""}` });
      }
    }
  }
  return cand.map((c) => (out.get(c.id) ? (({ strong, ...r }) => r)(out.get(c.id)) : null) || { sample_id: c.id, type: "unclassified", reason: "No clear match: not low enough for a blank, no repeated signature, no close neighbour — decide from the lab's QC list" });
}

// Where an accepted QC row sits in the drillhole data: a duplicate on its parent's interval; a standard or blank
// at its insertion point (zero-length, at the "to" of the drill sample just before it in the numbering), so the
// QAQC charts keep the insertion order and the row stays with the hole it was inserted into.
export function qcPlacement(sampleId, parentId, assaysById, assaysSortedByNumber) {
  if (parentId) { const a = assaysById.get(norm(parentId)); if (a) return { hole_id: a.hole_id, from: a.from, to: a.to }; }
  const p = idParts(sampleId);
  const arr = p ? assaysSortedByNumber.get(p.prefix) : null;
  if (arr?.length) {
    let prev = null;
    for (const x of arr) { if (x.n < p.n) prev = x; else break; }
    const a = (prev || arr[0]).a;
    return { hole_id: a.hole_id, from: a.to, to: a.to };
  }
  return null;
}
export function indexAssaysForPlacement(assays) {
  const byId = new Map(), byPrefix = new Map();
  for (const a of assays || []) {
    const k = norm(a.sample_id); if (!k) continue;
    if (!byId.has(k)) byId.set(k, a);
    const p = idParts(a.sample_id); if (!p) continue;
    (byPrefix.get(p.prefix) || byPrefix.set(p.prefix, []).get(p.prefix)).push({ n: p.n, a });
  }
  for (const arr of byPrefix.values()) arr.sort((x, y) => x.n - y.n);
  return { byId, byPrefix };
}
