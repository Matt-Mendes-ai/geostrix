// TASKS.csv #1345 (ARIS 42807Z / 42616Z) — a collar file that names its coordinate system in its column headers
// ("NAD83_9N_SUR_X", "UTM East NAD83_U10"): the CRS question opens with that answer already chosen. Only the systems a
// header can name without doubt: NAD83 / NAD27 UTM north (North America) and WGS 84 UTM with its hemisphere. A CSRS
// realisation is not guessed (its zones do not follow one numbering). -> EPSG code or null; null when headers disagree.
export function epsgFromColumns(headers) {
  const found = new Set();
  for (const h of headers || []) {
    const s = String(h ?? "").toUpperCase().replace(/[\r\n]+/g, " ");
    if (/CSRS/.test(s)) continue;
    let m = s.match(/NAD\s*_?83[\s_-]*(?:UTM[\s_-]*)?(?:Z(?:ONE)?[\s_-]*)?U?(\d{1,2})\s*N?(?![\dA-Z])/);
    if (m && +m[1] >= 1 && +m[1] <= 23) { found.add(26900 + +m[1]); continue; }
    m = s.match(/NAD\s*_?27[\s_-]*(?:UTM[\s_-]*)?(?:Z(?:ONE)?[\s_-]*)?U?(\d{1,2})\s*N?(?![\dA-Z])/);
    if (m && +m[1] >= 1 && +m[1] <= 22) { found.add(26700 + +m[1]); continue; }
    m = s.match(/WGS\s*_?84[\s_-]*(?:UTM[\s_-]*)?(?:Z(?:ONE)?[\s_-]*)?(\d{1,2})\s*([NS])(?![A-Z])/);
    if (m && +m[1] >= 1 && +m[1] <= 60) found.add((m[2] === "N" ? 32600 : 32700) + +m[1]);
  }
  return found.size === 1 ? [...found][0] : null;
}
