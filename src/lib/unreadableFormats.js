import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language
// TASKS.csv #603 — files GeoStrix cannot read because the format is proprietary and undocumented, with the way out
// for each. A dropped Geosoft .gdb (where IP / mag line data often live: 43141Z's seven IP surveys are .gdb only)
// used to be counted as "unrecognized file(s) skipped", which tells the user nothing they can act on.
const ADVICE = [
  { re: /\.gdb$/i, what: "a Geosoft database (.gdb, a closed binary format)", how: "export its channels to CSV or XYZ from Oasis montaj, or from Geosoft's free viewer, then drop that file (Geophysics > Point survey reads CSV and Geosoft .xyz)" },
  { re: /\.geosoft_voxel$/i, what: "a Geosoft voxel (a closed format)", how: "export it as a UBC mesh + model or a block-model CSV" },
  { re: /\.dwg$/i, what: "an AutoCAD drawing (.dwg, a closed format)", how: "save or export it as .dxf from AutoCAD, DWG TrueView or any CAD program, then drop that" },
  { re: /\.(mdb|accdb)$/i, what: "a Microsoft Access database", how: "export the collar, survey and interval tables to CSV (in Access: External Data > Text File), then drop those" },
  // TASKS.csv #1345 — 108 of these in the ARIS Sample Data folder (2004-2005 reports): the Excel 97-2003 binary format
  // TASKS.csv #1667 (review #1646, Kodiak) — dropped on the Geophysics tab, these did nothing at all
  { re: /\.(vtk|vtu|vtr|vts)$/i, what: "a VTK model", how: "import the same model as a UBC mesh + model, or as its XYZ / block-model CSV, under Geophysics > Block models (contractors deliver both)" },
  // TASKS.csv #2854 (review GSC geophysics) — an ECW got a different, unfitting message on each drop route (or none)
  { re: /\.(ecw|sid|jp2|j2k)$/i, what: "a wavelet-compressed image (ECW, MrSID or JPEG 2000) that needs a licensed or optional decoder", how: "convert it to a GeoTIFF first (QGIS: Raster > Conversion > Translate, or gdal_translate in.ecw out.tif where GDAL has the driver), then import that in Maps > GeoTIFF / GXF" },
  { re: /\.xls$/i, what: "an Excel 97-2003 workbook (.xls)", how: "open it in Excel or LibreOffice and save it as .xlsx (or each sheet as CSV), then drop that" },
];

// name -> one sentence for a notice, or null when the file is not one of these
export function unreadableFormatAdvice(name) {
  const a = ADVICE.find((x) => x.re.test(String(name || "")));
  return a ? tr("{name} is {what} that GeoStrix cannot read: {how}.", { name, what: a.what, how: a.how }) : null;
}

// TASKS.csv #2847 (GSC review B14) — a Geosoft .gdb given to Geophysics > Point survey's Import CSV / Import survey .xyz buttons was read as a
// text table ('263 row(s), 1 column(s)' of binary garbage) and only the drops named it. Any binary file (a NUL byte in the first kB; a UTF-16
// text file, which has NULs too, starts with its byte-order mark) is stopped before the column picker.
export function looksBinary(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))) return false;
  const n = Math.min(b.length, 1024);
  for (let i = 0; i < n; i++) if (b[i] === 0) return true;
  return false;
}
// file -> one sentence when it cannot be a text table (a closed format named by its extension, or binary bytes), else null
export async function textTableRefusal(file) {
  const advice = unreadableFormatAdvice(file?.name);
  if (advice) return advice;
  let head;
  try { head = new Uint8Array(await file.slice(0, 1024).arrayBuffer()); } catch { return null; }
  return looksBinary(head) ? tr("\"{name}\" is a binary file, not a text table: Point survey reads CSV and Geosoft .xyz (text) files.", { name: file.name }) : null;
}
