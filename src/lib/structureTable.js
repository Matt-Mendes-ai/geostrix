// TASKS.csv #3842 (Scottie Gold surface geology review) — 'Import structure measurements' read the rock-sample workbook (.xlsx) as text ('194 rows - check the columns' over
// binary characters), and the 144 Strike / Dip values the samples already carried in the project stayed text attributes. A file that is not text is named and refused (a workbook is
// read with the sheet reader the sample import uses); samples that carry a strike and a dip are offered as a structure table. Pure apart from readStructureWorkbook (lazy import).
import { guessStructureColumns } from "./mapStructures.js";

// -> "xlsx" | "xls" | "zip" | "pdf" | "binary" | null (text). head: the file's first bytes (4 kB is plenty).
export function binaryKind(head, name = "") {
  const b = head || [];
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5)) return /\.(xlsx|xlsm)$/i.test(name) ? "xlsx" : "zip";
  if (b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return "xls";
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";
  const n = Math.min(b.length, 4096);
  for (let i = 0; i < n; i++) if (b[i] === 0) return "binary"; // a text table has no NUL bytes (UTF-16 is not read here either)
  return null;
}

// the workbook's best sheet (the one with most structure columns found), as { rows, headers, note }
export async function readStructureWorkbook(file) {
  const { parseTableOrWorkbook } = await import("./xlsx.js");
  return parseTableOrWorkbook(file, (headers) => Object.values(guessStructureColumns(headers)).filter(Boolean).length);
}

const isNum = (v) => v !== "" && v != null && Number.isFinite(Number(v));
// Surface samples whose own fields hold a dip and a strike (or dip direction): -> { rows, headers, cols, n } for the structure import card, or null.
// Each row is the sample's fields with Station / Easting / Northing / Elevation added; only samples with a numeric dip and a bearing are rows.
export function structureRowsFromSamples(samples) {
  const keys = new Set();
  for (const s of samples || []) if (s?.attrs && typeof s.attrs === "object") for (const k of Object.keys(s.attrs)) if (!k.startsWith("_")) keys.add(k);
  if (!keys.size) return null;
  const extra = [...keys].filter((k) => !["Station", "Easting", "Northing", "Elevation"].includes(k));
  const headers = ["Station", "Easting", "Northing", "Elevation", ...extra];
  const cols = guessStructureColumns(headers);
  if (!cols.dip || (!cols.strike && !cols.dipDir)) return null;
  cols.x = "Easting"; cols.y = "Northing"; cols.z = "Elevation"; cols.station = "Station";
  const rows = [];
  for (const s of samples) {
    const a = s?.attrs;
    if (!a || !Number.isFinite(Number(s.x)) || !Number.isFinite(Number(s.y))) continue;
    if (!isNum(a[cols.dip]) || !((cols.strike && isNum(a[cols.strike])) || (cols.dipDir && isNum(a[cols.dipDir])))) continue;
    const row = { Station: s.sample_id ?? "", Easting: Number(s.x), Northing: Number(s.y), Elevation: Number.isFinite(Number(s.z)) ? Number(s.z) : "" };
    for (const k of extra) row[k] = a[k] ?? "";
    rows.push(row);
  }
  return rows.length ? { rows, headers, cols, n: rows.length } : null;
}
