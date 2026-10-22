import { t as tr } from "./i18n.js"; // TASKS.csv #786
// TASKS.csv #807 — absorption-feature maps from a hyperspectral GeoTIFF (EMIT, or any sensor with many narrow bands).
// Matt chose option (c) of the #805 / #807 review: no HDF5 / NetCDF reader in GeoStrix; the user cuts the EMIT L2A
// reflectance granule to the area as a multiband GeoTIFF with NASA's own tools, and GeoStrix maps the features.
// Broadband Sentinel-2 / Landsat see "a 2.2 micron absorption"; a hyperspectral sensor resolves WHERE it sits: the
// Al-OH minimum moves from ~2160-2180 nm (kaolinite, alunite, paragonite) through ~2200 (muscovite / sericite) to
// ~2210-2225 nm (phengite, Al-poor white mica) - the classic white-mica chemistry vector around porphyry systems.
//
// Method (standard; e.g. van der Meer 2004, ITC; the hull approach in Clark & Roush 1984): per pixel, over a window
// around the feature, divide the reflectance by its upper convex hull (continuum removal), take the depth 1 - min(CR)
// and the wavelength of the minimum refined by a parabola through it and its two neighbours. A depth under minDepth
// is "no feature": the wavelength is left blank there (a wavelength of noise would colour the map as strongly as a
// real one). Written from the method; pyGMI's GPL code (rsense/hyperspec.py) was not used.

export const FEATURES = {
  aloh2200: { label: "Al-OH 2200 nm (white mica, clays)", lo: 2120, hi: 2260, what: "Depth: how much Al-OH clay / white mica. Wavelength: ~2165 kaolinite / alunite, ~2195-2205 muscovite (sericite), 2210-2225 phengitic (Al-poor) mica - a vector toward or away from a porphyry centre." },
  mgoh2330: { label: "Mg-OH / carbonate 2330 nm (chlorite, epidote, calcite)", lo: 2270, hi: 2390, what: "Depth: propylitic minerals and carbonate. Wavelength: ~2250 + 2330-2340 chlorite / epidote, ~2335-2345 calcite, ~2315-2325 dolomite / talc." },
  ferric900: { label: "Ferric iron 900 nm (hematite, goethite, jarosite)", lo: 750, hi: 1100, what: "Depth: iron oxides (gossan, oxidised cap). Wavelength: ~860-880 hematite, ~900-930 goethite / jarosite." },
};

// Wavelengths in nm from an ENVI header ("wavelength = { 381.0, 388.4, ... }"), or any comma / space separated list.
// Micrometres (all values under 20) are converted. Returns [] when nothing numeric is found.
export function parseWavelengths(text) {
  const s = String(text || "");
  const m = s.match(/wavelength\s*=\s*\{([^}]*)\}/i);
  const nums = (m ? m[1] : s).split(/[\s,;]+/).filter((t) => t !== "").map(Number).filter(Number.isFinite);
  if (!nums.length) return [];
  return nums.every((v) => v < 20) ? nums.map((v) => v * 1000) : nums;
}

// Per-band wavelengths from the GeoTIFF's GDAL metadata (what GDAL / rioxarray write): an item whose name contains
// "wavelength", else a number in the band description ("2201.6 nm", "Band 120 (2201.6)"). meta = [per band object].
export function wavelengthsFromGdalMetadata(meta) {
  const out = meta.map((m) => {
    if (!m) return NaN;
    for (const [k, v] of Object.entries(m)) if (/wavelength/i.test(k) && Number.isFinite(parseFloat(v))) return parseFloat(v);
    for (const [k, v] of Object.entries(m)) if (/desc/i.test(k)) { const n = String(v).match(/(\d+(?:\.\d+)?)\s*(nm|um|µm)?\)?\s*$/i); if (n) return parseFloat(n[1]) * (/u|µ/i.test(n[2] || "") ? 1000 : 1); }
    return NaN;
  });
  if (!out.every(Number.isFinite)) return null;
  return out.every((v) => v < 20) ? out.map((v) => v * 1000) : out;
}

// The bands (0-based) inside the feature's window, in wavelength order
export function featureBands(wavelengths, feature) {
  const f = typeof feature === "string" ? FEATURES[feature] : feature;
  return wavelengths.map((w, i) => [w, i]).filter(([w]) => w >= f.lo && w <= f.hi).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
}

// Upper convex hull of (x, y) (x ascending), evaluated at every x
function hullAt(x, y) {
  const h = [];
  for (let i = 0; i < x.length; i++) {
    while (h.length >= 2) {
      const a = h[h.length - 2], b = h[h.length - 1];
      // drop b when it lies on or under the line a -> i
      if ((y[b] - y[a]) * (x[i] - x[a]) <= (y[i] - y[a]) * (x[b] - x[a])) h.pop(); else break;
    }
    h.push(i);
  }
  const out = new Float64Array(x.length);
  for (let s = 0; s < h.length - 1; s++) {
    const a = h[s], b = h[s + 1];
    for (let i = a; i <= b; i++) out[i] = y[a] + ((y[b] - y[a]) * (x[i] - x[a])) / (x[b] - x[a]);
  }
  return out;
}

// bands: the window's bands (arrays, same order as wl, wavelength ascending); returns { depth, wavelength, valid, noFeature }
export function featureMap(bands, wl, { isNoData = () => false, minDepth = 0.02 } = {}) {
  if (bands.length < 5) throw new Error(tr("Only {n} band(s) fall inside this feature's window: a hyperspectral file needs several (EMIT has ~18 around 2200 nm).", { n: bands.length }));
  const n = bands[0].length, m = bands.length;
  const depth = new Float32Array(n), wavelength = new Float32Array(n);
  const y = new Float64Array(m);
  let valid = 0, noFeature = 0;
  for (let p = 0; p < n; p++) {
    let ok = true;
    for (let b = 0; b < m; b++) { const v = bands[b][p]; if (!(v > 0) || !Number.isFinite(v) || isNoData(v)) { ok = false; break; } y[b] = v; }
    if (!ok) { depth[p] = NaN; wavelength[p] = NaN; continue; }
    const hull = hullAt(wl, y);
    let iMin = 0, cMin = Infinity;
    for (let b = 0; b < m; b++) { const c = y[b] / hull[b]; if (c < cMin) { cMin = c; iMin = b; } }
    const d = 1 - cMin;
    depth[p] = d; valid++;
    if (d < minDepth || iMin === 0 || iMin === m - 1) { wavelength[p] = NaN; noFeature++; continue; }
    // parabola through the minimum and its neighbours (continuum-removed)
    const x0 = wl[iMin - 1], x1 = wl[iMin], x2 = wl[iMin + 1];
    const c0 = y[iMin - 1] / hull[iMin - 1], c1 = cMin, c2 = y[iMin + 1] / hull[iMin + 1];
    const den = (x0 - x1) * (x0 - x2) * (x1 - x2);
    const A = (x2 * (c1 - c0) + x1 * (c0 - c2) + x0 * (c2 - c1)) / den;
    const B = (x2 * x2 * (c0 - c1) + x1 * x1 * (c2 - c0) + x0 * x0 * (c1 - c2)) / den;
    const xv = A > 0 ? -B / (2 * A) : x1;
    wavelength[p] = xv >= x0 && xv <= x2 ? xv : x1;
  }
  return { depth, wavelength, valid, noFeature };
}
