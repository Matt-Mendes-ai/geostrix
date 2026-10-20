// TASKS.csv #623 — LONG-format assay exports: one row per sample per element (analyte + value + units, often a
// method / analysis_code and a flag), as a database query gives them. Matt's Treaty Creek export (SELECT … FROM
// analysis_geochem JOIN …, 62,518 rows: hole_id, from, to, sample_id, analysis_code, samp_type, analyte, units,
// concentration, flag …) was not recognised: the value column is "concentration", and the old long path kept ONE
// method, while this file measures each element by different methods in different batches (Ag/Cu/Pb/Zn by
// IMS-230 or ICP-130, Au by CPA-Au1 or FAS-111) — one method would have dropped most of the samples.
//
// pivotLongAssays turns such a file into ONE ROW PER SAMPLE INTERVAL with one column per element ("Au_ppm"), so
// the normal wide import (units, '<' / '>' qualifiers, QC tagging by sample id / type, merging) runs unchanged.
// Per sample and element, with several results:
//  * an over-range result (flag UDL / OVER / '>', or a value written '>x') is replaced by another method's
//    result for the same sample — the ore-grade re-assay (ICF-6Zn, FAS-415 …), converted to the element's unit;
//    with none, it stays '>limit' (over-range, read at its ceiling);
//  * a lab RE-RUN (method named …rerun / repeat / RR) never replaces the original result (counted: they are
//    lab repeats, a QC check, not a better number);
//  * otherwise the first result in the file is kept, and the conflict is counted.
// Below detection: flag LDL / BDL / '<', or a negative value (the database convention: -0.005 = '<0.005').
const VALUE_ALIASES = ["concentration", "conc", "value", "result", "abundance", "assay_value", "result_value", "grade"];
const ANALYTE_ALIASES = ["analyte", "element", "analyte_code", "element_code"];
const norm = (h) => String(h ?? "").trim().toLowerCase().replace(/[\s.\-/]+/g, "_");
const pick = (headers, aliases) => headers.find((h) => aliases.includes(norm(h))) || null;

// which columns make a file long-format; null when it isn't
export function detectLongAssay(headers) {
  const analyte = pick(headers, ANALYTE_ALIASES), value = pick(headers, VALUE_ALIASES);
  if (!analyte || !value) return null;
  return {
    analyte, value,
    units: pick(headers, ["units", "unit", "uom"]),
    method: pick(headers, ["analysis_code", "method", "method_code", "lab_method", "analytical_method", "procedure"]),
    flag: pick(headers, ["flag", "qualifier", "result_flag", "detection_flag", "remark_code"]),
    hole: pick(headers, ["hole_id", "holeid", "bhid", "dhid", "hole", "hole_name"]),
    from: pick(headers, ["from", "from_m", "depth_from", "sample_from", "sampfrom", "mfrom"]),
    to: pick(headers, ["to", "to_m", "depth_to", "sample_to", "sampto", "mto"]),
    sample: pick(headers, ["sample_id", "sampleid", "sample_no", "sample_number", "sample"]),
  };
}

const UNIT_OF = (u) => {
  const s = norm(u);
  if (!s) return null;
  if (s === "ppb") return "ppb";
  if (s === "pct" || s === "%" || s === "percent" || s === "wt%" || s === "wt_pct") return "%";
  if (["ppm", "g/t", "g_t", "gpt", "gt", "mg/kg", "mg_kg", "ug/g"].includes(s)) return "ppm";
  return null;
};
const toUnit = (v, from, to) => {
  if (from === to || from == null) return v;
  const ppm = from === "%" ? v * 10000 : from === "ppb" ? v / 1000 : v;
  return to === "%" ? ppm / 10000 : to === "ppb" ? ppm * 1000 : ppm;
};
const isRerun = (m) => /re-?run|repeat|(^|[_\-\s])rr($|[_\-\s])|re-?assay/i.test(String(m || ""));
const isOverFlag = (f) => /^(udl|over|ovr|>|gt|above)$/i.test(String(f || "").trim());
const isUnderFlag = (f) => /^(ldl|bdl|udl_low|<|lt|below|nd)$/i.test(String(f || "").trim());

export function pivotLongAssays(rows, headers, unitOfSymbol = () => "ppm", symbolOf = (a) => a) {
  const c = detectLongAssay(headers);
  if (!c || !c.hole || !c.from || !c.to) return null;
  const extra = headers.filter((h) => ![c.analyte, c.value, c.units, c.method, c.flag].includes(h));
  const samples = new Map(); // interval key -> { base, results: Map(symbol -> [results]) }
  const unitVotes = new Map(); // symbol -> Map(unit -> n)
  const report = { rows: rows.length, unknownAnalyte: 0, overReplaced: 0, overKept: 0, reruns: 0, conflicts: 0, belowDetection: 0, methods: new Map(), units: new Map() };
  for (const r of rows) {
    const sym = symbolOf(String(r[c.analyte] ?? "").trim());
    if (!sym) { report.unknownAnalyte++; continue; }
    const key = `${r[c.hole]}|${r[c.from]}|${r[c.to]}|${c.sample ? r[c.sample] ?? "" : ""}`;
    let s = samples.get(key);
    if (!s) { s = { base: Object.fromEntries(extra.map((h) => [h, r[h]])), results: new Map() }; samples.set(key, s); }
    const unit = (c.units && UNIT_OF(r[c.units])) || null;
    if (unit) { const v = unitVotes.get(sym) || new Map(); v.set(unit, (v.get(unit) || 0) + 1); unitVotes.set(sym, v); }
    const raw = r[c.value];
    const method = c.method ? String(r[c.method] ?? "").trim() : "";
    if (method) { const m = report.methods.get(sym) || new Map(); m.set(method, (m.get(method) || 0) + 1); report.methods.set(sym, m); }
    const flag = c.flag ? r[c.flag] : "";
    let num = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").replace(/^[<>]\s*/, ""));
    const text = String(raw ?? "").trim();
    let qual = isOverFlag(flag) || text.startsWith(">") ? ">" : isUnderFlag(flag) || text.startsWith("<") ? "<" : null;
    if (Number.isFinite(num) && num < 0) { num = Math.abs(num); qual = "<"; } // the database's below-detection sign
    if (!s.results.has(sym)) s.results.set(sym, []);
    s.results.get(sym).push({ num, qual, unit, method, rerun: isRerun(method) });
  }
  // each element's column unit: what most of its rows say, else the element's usual unit
  const unitFor = new Map();
  for (const [sym, v] of unitVotes) unitFor.set(sym, [...v.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  const symbols = new Set();
  const out = [];
  for (const { base, results } of samples.values()) {
    const row = { ...base };
    for (const [sym, list] of results) {
      symbols.add(sym);
      const colUnit = unitFor.get(sym) || unitOfSymbol(sym);
      const usable = list.filter((x) => Number.isFinite(x.num));
      if (!usable.length) continue;
      const originals = usable.filter((x) => !x.rerun);
      report.reruns += usable.length - originals.length;
      const pool = originals.length ? originals : usable;
      // an over-range result gives way to any in-range one (the ore-grade re-assay), whichever comes first
      const inRange = pool.filter((x) => x.qual !== ">");
      const hadOver = inRange.length < pool.length;
      let chosen = inRange.length ? inRange[0] : pool[0];
      if (hadOver) { if (inRange.length) report.overReplaced++; else report.overKept++; }
      if (inRange.length > 1) report.conflicts++; // two in-range results by different methods: the first is used
      const v = toUnit(chosen.num, chosen.unit || colUnit, colUnit);
      if (chosen.qual === "<") report.belowDetection++;
      row[`${sym}_${colUnit === "%" ? "pct" : colUnit}`] = chosen.qual ? `${chosen.qual}${+v.toPrecision(10)}` : +v.toPrecision(10);
      report.units.set(sym, colUnit);
    }
    out.push(row);
  }
  const elementHeaders = [...symbols].map((sym) => `${sym}_${(report.units.get(sym) || unitOfSymbol(sym)) === "%" ? "pct" : report.units.get(sym) || unitOfSymbol(sym)}`);
  return { headers: [...extra, ...elementHeaders], rows: out, columns: c, report: { ...report, samples: out.length } };
}

// the import notice's sentence for a pivoted file
export function longAssayNote(rep) {
  const methods = [...rep.methods.entries()].map(([sym, m]) => `${sym} ${[...m.keys()].join(" / ")}`).join("; ");
  return [
    `Long format (one row per element): ${rep.rows.toLocaleString()} rows → ${rep.samples.toLocaleString()} samples.`,
    methods ? `Methods: ${methods}; every sample is kept, whichever method measured it.` : null,
    rep.overReplaced ? `${rep.overReplaced} over-range result(s) replaced by the sample's ore-grade re-assay.` : null,
    rep.overKept ? `${rep.overKept} over-range result(s) with no re-assay kept as '>limit'.` : null,
    rep.reruns ? `${rep.reruns} lab re-run(s) not used (the original result is kept; re-runs are a QC check).` : null,
    rep.conflicts ? `${rep.conflicts} sample(s) with two different methods for one element: the first in the file is used.` : null,
    rep.unknownAnalyte ? `${rep.unknownAnalyte} row(s) with an analyte that is not an element were skipped.` : null,
  ].filter(Boolean).join(" ");
}
