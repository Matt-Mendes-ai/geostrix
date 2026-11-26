// TASKS.csv #4096 — the CRS a collar file declares, for a project whose CRS is not set yet.
// Found live (#4056, a sample with 2006 collars in AGD66 and 2007 ones in AGD84, an epsg column per row): with two codes in the column the file
// "declared" nothing, so no project CRS was adopted, and every row was reprojected INTO the placeholder EPSG:3156 (BC UTM 9N, #615): Queensland
// collars at x = -10,297,992. The maths was right; the target was the placeholder. Now the code most rows use is adopted (the others are then
// converted into it by the import's per-row pass), and nothing is ever reprojected into a CRS the project has not chosen (projectTargetEpsg, #2287).
//
// rowCodes: each row's declared EPSG ("" when the row has none); srcEpsg: the dialog's Source CRS ("" for none).
// -> the EPSG to adopt (a string), or null when the file declares none, or the Source CRS disagrees with every row's code
export function declaredCollarEpsg(rowCodes, srcEpsg = "") {
  const counts = new Map();
  for (const c of rowCodes || []) { const k = String(c ?? "").trim(); if (k) counts.set(k, (counts.get(k) || 0) + 1); }
  if (!counts.size) return srcEpsg ? String(srcEpsg) : null;
  if (srcEpsg) return counts.has(String(srcEpsg)) ? String(srcEpsg) : null; // the Source CRS set in the dialog, if the rows use it; contradicted: nothing (#607)
  // the most-used code; a tie goes to the code met first (the file's order)
  let best = null, n = 0;
  for (const [k, v] of counts) if (v > n) { best = k; n = v; }
  return best;
}
