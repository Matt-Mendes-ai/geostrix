// TASKS.csv #603 — files GeoStrix cannot read because the format is proprietary and undocumented, with the way out
// for each. A dropped Geosoft .gdb (where IP / mag line data often live: 43141Z's seven IP surveys are .gdb only)
// used to be counted as "unrecognized file(s) skipped", which tells the user nothing they can act on.
const ADVICE = [
  { re: /\.gdb$/i, what: "a Geosoft database (.gdb, a closed binary format)", how: "export its channels to CSV or XYZ from Oasis montaj, or from Geosoft's free viewer, then drop that file (Geophysics > Point survey reads CSV and Geosoft .xyz)" },
  { re: /\.grd$/i, what: "a Geosoft binary grid (.grd, a closed format)", how: "export it as .gxf (Geosoft's open grid exchange format) or GeoTIFF, then drop that" },
  { re: /\.geosoft_voxel$/i, what: "a Geosoft voxel (a closed format)", how: "export it as a UBC mesh + model or a block-model CSV" },
  { re: /\.dwg$/i, what: "an AutoCAD drawing (.dwg, a closed format)", how: "save or export it as .dxf from AutoCAD, DWG TrueView or any CAD program, then drop that" },
  { re: /\.(mdb|accdb)$/i, what: "a Microsoft Access database", how: "export the collar, survey and interval tables to CSV (in Access: External Data > Text File), then drop those" },
];

// name -> one sentence for a notice, or null when the file is not one of these
export function unreadableFormatAdvice(name) {
  const a = ADVICE.find((x) => x.re.test(String(name || "")));
  return a ? `${name} is ${a.what} that GeoStrix cannot read: ${a.how}.` : null;
}
