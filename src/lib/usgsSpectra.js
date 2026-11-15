// TASKS.csv #3514 — the USGS Spectral Library Version 7 subset (src/lib/usgsSpectraSubset.json, built by scripts/spectral/build-usgs-splib-subset.py):
// 36 minerals common in alteration and weathering, 350-2500 nm at 5 nm, U.S. Government public domain, loaded with import() only when the
// Hyperspectral tab's reference picker opens (the file is about 110 kB).
let loading = null;
export const loadUsgsSubset = () => (loading ||= import("./usgsSpectraSubset.json").then((m) => m.default || m));
// a spectrum as the text the reference box takes: 'wavelength (nm), reflectance' per line
export function spectrumText(doc, spectrum) {
  const { from, step } = doc.wavelengthNm;
  return ["wavelength_nm, reflectance", ...spectrum.values.map((v, i) => `${from + i * step}, ${v}`)].join("\n");
}
export const USGS_CREDIT = "USGS Spectral Library Version 7 (Kokaly et al., 2017, Data Series 1035): U.S. Government public domain; the USGS asks to be acknowledged.";
