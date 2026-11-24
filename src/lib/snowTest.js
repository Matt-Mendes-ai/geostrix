// TASKS.csv #4051 (Matt, Macpass in 3D: "this is mostly snow so I wonder how the spectral image is working here") — a second snow test beside the Sentinel-2 scene
// classification (SCL class 11, imageryFetch.js SCL_MASK): the Normalized Difference Snow Index, (green - SWIR 1) / (green + SWIR 1) = (B3 - B11) / (B3 + B11).
// The classification misses thin, dirty and shadowed snow and snow-field edges; snow is bright in the green and dark in the shortwave infrared, rock is not (its NDSI
// sits near 0 to 0.2, so bright carbonate is not caught). A brightness guard keeps dark water and shadow (high NDSI at a few per cent reflectance) from being called
// snow. A pixel is snow when NDSI is above `min` and the green reflectance is at least `minGreen`. Pure (no React).
export const NDSI_SNOW_MIN = 0.4;   // the standard threshold (Hall et al. 1995 / MODIS); the user's to change
export const SNOW_MIN_GREEN = 0.25; // green surface reflectance: below this a bright-in-green test is dark water or shadow, not snow

export const ndsi = (green, swir) => {
  const s = green + swir;
  return Number.isFinite(s) && s > 0 ? (green - swir) / s : NaN;
};

// green, swir: reflectance arrays of one window (NaN = no data); skip: a 0 / 1 array of the pixels already blanked (the classification's) or null
// -> { flags: Uint8Array (1 = snow by NDSI, not in skip), count, scored } where scored = the pixels the test could be read on
export function snowByNdsi(green, swir, { min = NDSI_SNOW_MIN, minGreen = SNOW_MIN_GREEN, skip = null } = {}) {
  const n = green.length, flags = new Uint8Array(n);
  let count = 0, scored = 0;
  for (let i = 0; i < n; i++) {
    const v = ndsi(green[i], swir[i]);
    if (!Number.isFinite(v)) continue;
    scored++;
    if (skip && skip[i]) continue;
    if (v > min && green[i] >= minGreen) { flags[i] = 1; count++; }
  }
  return { flags, count, scored };
}

// the threshold as the person typed it: a number between -1 and 1, else the default
export const ndsiMinOf = (text) => { const v = Number(text); return text !== "" && text != null && Number.isFinite(v) && v > -1 && v < 1 ? v : NDSI_SNOW_MIN; };
