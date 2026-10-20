// TASKS.csv #492 — LAS (Log ASCII Standard, CWLS) downhole log import. Written from the public LAS 2.0 specification
// (clean room: nothing taken from any other implementation). A LAS file is turned into an ordinary table —
// hole_id, depth (m) and one column per curve — and handed to the normal import dialog, so a curve becomes a
// downhole layer (mag susceptibility at point depths, a custom numeric layer, ...) with every check that already has.
//
// What is read:
//   ~V  VERS (1.2 / 2.0; 3.0 refused with a reason), WRAP (YES / NO — both read, see ~A)
//   ~W  WELL (-> hole id; UWI or the file name when WELL is blank), NULL (the missing-value marker), STRT / STOP / STEP
//   ~C  the curves, in column order; the first is the depth index (DEPT / DEPTH / MD ...), its unit M or FT / F
//   ~A  the data. Values are read as one stream of numbers and cut into records of N curves, which is exactly what
//       a wrapped file (WRAP. YES: one record over several lines) and an unwrapped one (one record per line) both are.
// Header lines are "MNEM.UNIT  DATA : DESCRIPTION" (the unit runs from the first "." to the first space; the data
// up to the LAST ":"). "#" lines are comments. Depths in feet are converted to metres; other curves keep their units
// (listed in the notice). NULL values become blank (missing), never a number.

const FT = 0.3048;

function headerLine(line) {
  const dot = line.indexOf(".");
  if (dot < 0) return null;
  const mnem = line.slice(0, dot).trim();
  const rest = line.slice(dot + 1);
  const sp = rest.search(/\s/);
  const unit = sp < 0 ? rest.trim() : rest.slice(0, sp).trim();
  const afterUnit = sp < 0 ? "" : rest.slice(sp);
  const colon = afterUnit.lastIndexOf(":");
  const data = (colon < 0 ? afterUnit : afterUnit.slice(0, colon)).trim();
  const desc = colon < 0 ? "" : afterUnit.slice(colon + 1).trim();
  return mnem ? { mnem, unit, data, desc } : null;
}

const isFeet = (u) => /^(f|ft|feet|foot)$/i.test(String(u || "").trim());

// -> { rows, headers, note, well, curves: [{ mnem, unit, desc }], version, wrapped }; throws on what it can't read
export function parseLAS(text, fileName = "file.las") {
  const lines = String(text).replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const sections = { V: [], W: [], C: [], P: [], O: [] };
  let cur = null, dataStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    if (t.startsWith("~")) {
      const k = t[1]?.toUpperCase();
      if (k === "A") { dataStart = i + 1; break; }
      cur = sections[k] ? k : null;
      continue;
    }
    if (cur) { const h = headerLine(t); if (h) sections[cur].push(h); }
  }
  const get = (sec, m) => sections[sec].find((h) => h.mnem.toUpperCase() === m);
  const vers = get("V", "VERS")?.data || "";
  if (/^3/.test(vers)) throw new Error(`${fileName} is LAS ${vers}. GeoStrix reads LAS 1.2 and 2.0; save it as LAS 2.0 from the logging software (or from Python lasio).`);
  if (dataStart < 0) throw new Error(`${fileName} has no ~A (data) section — not a LAS file GeoStrix can read.`);
  const curves = sections.C.map((h) => ({ mnem: h.mnem, unit: h.unit, desc: h.desc }));
  if (curves.length < 2) throw new Error(`${fileName} lists ${curves.length} curve(s) in ~C; a log needs the depth curve and at least one more.`);
  const wrapped = /^y/i.test(get("V", "WRAP")?.data || "");

  const nullDecl = get("W", "NULL");
  const nullVal = nullDecl && nullDecl.data !== "" && Number.isFinite(Number(nullDecl.data)) ? Number(nullDecl.data) : null;
  const COMMON_NULLS = [-999.25, -9999, -999];
  const isNull = (v) => (nullVal != null ? v === nullVal : COMMON_NULLS.includes(v));

  // the data as one stream of numbers, cut into records of curves.length
  const tokens = [];
  for (let i = dataStart; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith("#") || t.startsWith("~")) { if (t.startsWith("~")) break; continue; }
    for (const tok of t.split(/[\s,]+/)) if (tok) tokens.push(tok);
  }
  const n = curves.length;
  const records = Math.floor(tokens.length / n);
  const leftover = tokens.length - records * n;
  if (!records) throw new Error(`${fileName}: the ~A section has no complete data records.`);

  const depthFeet = isFeet(curves[0].unit) || (!curves[0].unit && isFeet(get("W", "STRT")?.unit));
  const holeId = (get("W", "WELL")?.data || get("W", "UWI")?.data || fileName.replace(/\.las$/i, "")).trim();
  // column names: the mnemonics, made unique (a file can repeat one), never "hole_id" / "depth"
  const used = new Set(["hole_id", "depth"]);
  const names = curves.slice(1).map((c) => { let base = c.mnem.replace(/[^\w]+/g, "_") || "curve"; let k = base, j = 2; while (used.has(k.toLowerCase())) k = `${base}_${j++}`; used.add(k.toLowerCase()); return k; });

  const rows = [];
  let nulls = 0, bad = 0;
  for (let r = 0; r < records; r++) {
    const vals = tokens.slice(r * n, r * n + n).map(Number);
    let d = vals[0];
    if (!Number.isFinite(d) || isNull(d)) { bad++; continue; }
    if (depthFeet) d = +(d * FT).toFixed(4);
    const row = { hole_id: holeId, depth: d };
    for (let c = 1; c < n; c++) {
      const v = vals[c];
      if (!Number.isFinite(v) || isNull(v)) { row[names[c - 1]] = ""; nulls++; } else row[names[c - 1]] = v;
    }
    rows.push(row);
  }
  const headers = ["hole_id", "depth", ...names];
  const unitList = curves.slice(1).map((c, i) => `${names[i]}${c.unit ? ` (${c.unit})` : ""}`).join(", ");
  const note = ` LAS ${vers || "?"}${wrapped ? " (wrapped)" : ""}: well "${holeId}", ${rows.length.toLocaleString("en-US")} depth readings ${rows.length ? `${rows[0].depth}–${rows[rows.length - 1].depth} m` : ""}${depthFeet ? " (converted from feet)" : ""}; curves ${unitList}.`
    + (nullVal != null ? ` NULL ${nullVal}: ${nulls.toLocaleString("en-US")} value(s) left blank.` : ` No NULL value declared — ${COMMON_NULLS.join(" / ")} read as missing (${nulls} value(s)).`)
    + (bad ? ` ${bad} record(s) without a usable depth were skipped.` : "")
    + (leftover ? ` ${leftover} trailing value(s) didn't make a full record and were ignored.` : "")
    + ` Map the curve you want to a layer (Mag. susceptibility takes point depths; any curve can go to a Custom layer). The hole id comes from the file's WELL field — it must match a collar.`;
  return { rows, headers, note, well: holeId, curves, version: vers, wrapped, nullValue: nullVal, depthFeet };
}
