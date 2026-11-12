// TASKS.csv #2893 (review #2876, WA bedded iron) — geology_bores.csv (817 rows of rock names: Alluvium, Shale ...) went into a Lithology
// layer holding 150,455 strand codes from geology.csv (ALU, DID_L ...) without a word: two code systems in one layer, and in a multi-file
// drop with no dialog at all. The import compares the incoming codes with the layer's before the commit. Pure: no UI.

const norm = (v) => String(v ?? "").trim();

// existing: the layer's rows ({ hole_id, value, _src }); rows / valueCol / holeCol: the file's rows and its mapped Value and Hole ID columns.
// -> { codes, shared, layerCodes, holes, sharedHoles, files } | null (the layer is empty, or the file has no code)
export function codeOverlap(existing, rows, valueCol, holeCol) {
  if (!existing?.length || !valueCol) return null;
  const layerCodes = new Set(), layerHoles = new Set(), files = new Set();
  for (const r of existing) { const v = norm(r?.value); if (v) layerCodes.add(v); layerHoles.add(norm(r?.hole_id)); if (r?._src) files.add(r._src); }
  const codes = new Set(), holes = new Set();
  for (const r of rows || []) { const v = norm(r?.[valueCol]); if (v) codes.add(v); if (holeCol) holes.add(norm(r?.[holeCol])); }
  if (!codes.size) return null;
  let shared = 0; for (const c of codes) if (layerCodes.has(c)) shared++;
  let sharedHoles = 0; for (const h of holes) if (h && layerHoles.has(h)) sharedHoles++;
  return { codes: codes.size, shared, layerCodes: layerCodes.size, holes: holes.size, sharedHoles, files: [...files] };
}
// another code system: at most a fifth of the file's codes are in the layer (geology_bores.csv: 2 of 19, CID and DID, beside the strand
// log's 34), and the layer has codes. A file that adds a code or two to the same scheme shares most of its own.
export const otherCodeSystem = (o) => !!o && o.layerCodes > 0 && o.codes >= 2 && o.shared / o.codes <= 0.2;
