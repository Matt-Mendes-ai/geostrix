// TASKS.csv #319 — per-element grade ramps: one hue per element, grade carried by lightness within it.
//
// THE PROBLEM THIS EXISTS FOR. #247 seeds every newly-shown assay element with the same three-class
// ramp, and #306 fixed that ramp's boundaries and colours — but it is the SAME ramp for every element,
// so with Au/Ag/Cu/Pb/Zn all switched on, every marker in the 3D view is one of three colours and
// element identity is carried only by a 2.2 m radial fan offset (sub-pixel at overview zoom) and the
// hover tooltip. A view has to carry both channels at once: WHICH element (hue) and HOW HIGH (lightness).
//
// WHY LIGHTNESS FOR GRADE, AND WHY THESE TARGETS. #306 measured the case for the shared ramp and it
// applies unchanged here: the markers sit on a light viewport background, so the channel that must rise
// with grade is salience against that background, which means L* must FALL with grade. The three L*
// targets below are exactly the ones #306 landed on (88.9 / 65.2 / 33.4), so a per-element ramp keeps
// that measured behaviour and only changes the hue it is built around.
//
// CIE L*a*b* is used rather than HSL: HSL's "lightness" is not perceptual (its L 50% yellow and L 50%
// blue differ by ~40 units of real lightness), which is what produced the non-monotonic ramp #306 had
// to replace in the first place. Everything here is pure and checkable in Node.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]) {
  const h = (v) => Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

// D65 white point, the sRGB reference.
const WHITE = [0.95047, 1, 1.08883];

export function rgbToLab([r, g, b]) {
  const rl = srgbToLinear(r / 255), gl = srgbToLinear(g / 255), bl = srgbToLinear(b / 255);
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / WHITE[0];
  const y = (0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl) / WHITE[1];
  const z = (0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl) / WHITE[2];
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// Returns { rgb, inGamut } — inGamut is false when the Lab colour had to be clipped to fit sRGB, which
// is what the chroma search below uses to find the most saturated colour a given lightness can hold.
export function labToRgb([L, a, b]) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (t - 4 / 29) * (108 / 841));
  const x = inv(fx) * WHITE[0], y = inv(fy) * WHITE[1], z = inv(fz) * WHITE[2];
  const rl = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const gl = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
  const bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  const lin = [rl, gl, bl];
  const inGamut = lin.every((c) => c >= -0.0005 && c <= 1.0005);
  return { rgb: lin.map((c) => Math.round(clamp01(linearToSrgb(clamp01(c))) * 255)), inGamut };
}

export const labLightness = (hex) => { const rgb = hexToRgb(hex); return rgb ? rgbToLab(rgb)[0] : null; };
export const labHueDeg = (hex) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [, a, b] = rgbToLab(rgb);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};

// The most saturated in-gamut colour at lightness `L` on hue `hueRad`, capped at `maxChroma`. Binary
// search rather than an analytic gamut boundary: the sRGB gamut in Lab is not a shape with a closed
// form, and 24 halvings settle to well under a JND.
function chromaFit(L, hueRad, maxChroma) {
  let lo = 0, hi = maxChroma;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (labToRgb([L, Math.cos(hueRad) * mid, Math.sin(hueRad) * mid]).inGamut) lo = mid; else hi = mid;
  }
  return lo;
}

// Default class lightnesses — #306's measured ramp, low grade to high.
export const RAMP_LIGHTNESS = [88.9, 65.2, 33.4];
// Chroma relative to the base colour's own, per class. The pale class is deliberately washed out (it is
// "background", and a pale-but-saturated colour competes with the high class for attention); the middle
// class is allowed slightly more chroma than the base so the hue is unmistakable where most of the
// non-background samples land; the dark class keeps most of it so it does not read as plain black.
const RAMP_CHROMA_SCALE = [0.7, 1.1, 0.95];

// Mean L* of the element identity palette (measured over the 14 colours ASSAY_ELEMENT_COLORS actually
// uses: 22.4 to 89.1, mean 58.1). A FIXED reference rather than the mean of whichever elements happen to
// be switched on, so an element's ramp never changes when a different element is toggled.
export const PALETTE_REFERENCE_L = 58.1;
// How much of a base colour's own lightness to carry into its ramp. This matters more than it looks:
// two palette entries can share a hue and differ mainly in LIGHTNESS (Ag #56B4E9 L*69.8 and Zn #0072B2
// L*46.0 are both blue), and forcing both to identical class lightnesses collapses exactly the channel
// that told them apart — measured on the live five-element view, Ag vs Zn came out ΔE 4.2 in the pale
// class and 3.0 under a Vienot-1999 deuteranopia simulation, i.e. indistinguishable. Carrying 40% of the
// base's deviation from the palette mean restores it (ΔE 10.8, deuteranopia 10.9 pale / 22.6 dark) while
// leaving every element's own grade steps large (ΔE 35-54) and its high class strongly salient against
// the viewport background (contrast 4.8-10.1 vs the 7.5 a zero-offset ramp gives). The cost, stated
// plainly: "same class" no longer means "same lightness" ACROSS elements, so comparing grade classes
// between two elements by lightness alone is weaker — identity is the channel #319 exists to restore.
export const RAMP_BASE_L_WEIGHT = 0.4;

// baseHex -> N hex colours of the SAME hue, monotonically decreasing in L*.
// Falls back to null (caller keeps its own default) if baseHex isn't a hex colour.
export function lightnessRamp(baseHex, lightnesses = RAMP_LIGHTNESS, chromaScales = RAMP_CHROMA_SCALE) {
  const rgb = hexToRgb(baseHex);
  if (!rgb) return null;
  const [baseL, a, b] = rgbToLab(rgb);
  const baseChroma = Math.hypot(a, b);
  const hueRad = Math.atan2(b, a);
  // Shift the whole ramp toward this colour's own lightness (see RAMP_BASE_L_WEIGHT), clamped so the
  // pale class never blows out to white and the dark class never crushes to black.
  const offset = RAMP_BASE_L_WEIGHT * (baseL - PALETTE_REFERENCE_L);
  lightnesses = lightnesses.map((L) => Math.min(92, Math.max(24, L + offset)));
  // A grey/near-grey base (a user who set an element to grey) has no hue to build on: give it a neutral
  // ramp rather than inventing a hue from rounding noise.
  const neutral = baseChroma < 3;
  return lightnesses.map((L, i) => {
    if (neutral) return rgbToHex(labToRgb([L, 0, 0]).rgb);
    const want = baseChroma * (chromaScales[i] ?? 1);
    const c = chromaFit(L, hueRad, want);
    return rgbToHex(labToRgb([L, Math.cos(hueRad) * c, Math.sin(hueRad) * c]).rgb);
  });
}

// Contrast ratio against a background, for verifying that salience rises with grade.
export function contrastRatio(hexA, hexB) {
  const lum = (hex) => {
    const [r, g, b] = hexToRgb(hex);
    const [rl, gl, bl] = [r, g, b].map((c) => srgbToLinear(c / 255));
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  };
  const a = lum(hexA), b = lum(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// TASKS.csv #476 — moved here from AssayStyleModal.jsx (unchanged).
// User request: "I wanna be able to change the assay legend. Change colour, size, recategorize,
// ignore values lower than (what the user specifies)". Per-element styling for the 3D View / cross-
// section assay markers — previously each toggled-on element got a hardcoded fixed hue and a
// continuous 1.2-3.8 size range with no way to touch either, and every sample rendered regardless of
// grade. This modal edits one element's entry in ViewerModule's `assayStyle` state:
//   { color: "#rrggbb" | null, sizeMult: number, minCutoff: number | null, breaks: [{max,color,label}] }
// `onChange` is called with the full next style object on every edit (ViewerModule owns the actual
// state and re-renders the 3D scene from it); this component is otherwise stateless about what's
// already been applied, just a plain controlled editor over the `style` prop.
// TASKS.csv #247 — the same "nice 3-class split of the element's real data range" this modal's own
// "Add break" button already seeded with (below), pulled out so ViewerModule can also use it to give a
// newly-toggled-on element a grade-based ramp by default instead of a flat color — a 0.01 g/t and a
// 50 g/t intercept looking identical until a user finds this modal's gear icon was a real first-look
// gap for a tool whose whole point is spotting where the high-grade intercepts sit in 3D.
//
// TASKS.csv #306 — #247's seeding was RIGHT in principle and degenerate in practice, and the numbers
// are the whole argument. The class boundaries were EQUAL-INTERVAL (min + span/3, min + 2·span/3),
// which is the wrong classifier for geochemical assay data: it is lognormal, a large background
// population plus a long anomalous tail spanning three to five orders of magnitude. Measured over the
// bundled 37-hole harry_property assay_wide.csv (6,297 intervals, 14 elements), equal-interval put
// 99.8-100.0% of every ore/pathfinder element into class 1 — Au 99.9/0.1/0.1, Cu 99.9/0.0/0.0,
// Pb 100.0/0.0/0.0, Zn 99.9/0.0/0.0, Ag 99.8/0.2/0.0, As 99.8/0.1/0.0. So the ramp existed but every
// sphere in the view was the same grey; on screen a whole 37-hole Au view showed exactly ONE
// non-grey marker. Two alternatives were measured and rejected before landing on percentiles:
//   • jenks (classifyBreaks' 'jenks', suggested by this row and already implemented for #291) —
//     minimises within-class variance in LINEAR space, so on this data it just fences off the
//     outliers: still 99.2/0.8/0.0 for Au, 99.5/0.5/0.0 for Cu. Barely better than equal-interval.
//   • geometric/log spacing from min·(max/min)^(k/3) — excellent for the trace elements
//     (Au 77.2/21.8/1.0) but it inverts on the near-normally-distributed major oxides in the same
//     file, where the minimum is a tiny outlier: K 0.0/0.7/99.2, Al 0.0/0.0/99.9. A default has to
//     work for both, and this dataset contains both.
// PERCENTILE (p50/p90) boundaries are used instead: robust to distribution shape by construction,
// they give ~50/40/10 for anything — lognormal trace element or near-normal major oxide alike — which
// is also the geologically conventional read (background / anomalous / strongly anomalous). They need
// the element's actual distribution rather than just its range, so ViewerModule's globalAssayRanges
// now carries p50/p90 alongside min/max; if a caller passes a range without them (an older saved
// project's shape, or any future caller) this falls back to the original equal-interval split rather
// than throwing.
// The class COLOURS changed too. The old grey #5a6472 -> amber #e2a63c -> red #e05a4a ramp is not
// monotonic in lightness (L* 42.0 -> 72.1 -> 55.7), i.e. the "High" class read as LESS extreme than
// "Medium" in greyscale and under simulated deuteranopia. These markers sit on a light background, so
// salience against that background is the channel that has to increase with grade: this ramp runs
// pale-and-low-chroma -> saturated -> near-black-red, L* 88.9 -> 65.2 -> 33.4, strictly DECREASING, so
// low grade recedes into the scene and high grade advances out of it (contrast against the viewport
// background #f4f5f7: 1.22 -> 2.45 -> 7.57, i.e. salience rises monotonically with grade, which the old
// ramp's 5.50 -> 1.97 -> 3.36 did not). Adjacent-class separation under a Vienot-1999 deuteranopia
// simulation is 142.3 and 123.0 units of simulated-sRGB distance (protanopia 150.5 / 126.3), against
// 139.6 / 57.1 for the old ramp — so the weak step is gone as well. Not a rainbow/jet ramp,
// deliberately: those manufacture false class boundaries in continuous data.
// TASKS.csv #319 — `baseColor` (an element's own identity hue) turns this into a PER-ELEMENT ramp:
// same three lightness classes, built around that hue, so a multi-element view carries identity in hue
// and grade in lightness at once instead of painting every element with the same three colours. Callers
// that pass nothing keep the original shared ramp exactly, so nothing that does not know about element
// colours changes behaviour. Seeded breaks are tagged `seeded: true`; editing one in this modal drops
// the tag (see updateBreak), which is what lets a future re-seed tell "GeoStrix chose this" from "the
// user chose this" — the distinction #319 recorded as missing.
export function seedBreaks(range, baseColor) {
  const { min, max, p50, p90 } = range || {};
  const span = max - min;
  const C = lightnessRamp(baseColor) || ["#f2ddb8", "#e0894a", "#8c2f1f"]; // low / medium / high — see the lightness argument above
  if (!(span > 0)) return [{ max: max || 1, color: C[2], label: "All", seeded: true }];
  // Percentile boundaries when the caller supplied a distribution; equal-interval otherwise.
  const usable = Number.isFinite(p50) && Number.isFinite(p90) && p50 > min && p90 > p50 && p90 < max;
  const b1 = usable ? p50 : min + span / 3;
  const b2 = usable ? p90 : min + (2 * span) / 3;
  // toFixed(3) is the original rounding, kept so the numbers in the break editor stay readable — but a
  // trace-element percentile can legitimately be smaller than 0.001 (Au p50 on this dataset is 0.033,
  // and a lower-grade property would go below 0.001), and rounding those to 0.000 would collapse the
  // low class back to nothing. Below that scale, keep three SIGNIFICANT figures instead of three
  // decimal places.
  const round = (v) => (Math.abs(v) >= 0.001 ? +v.toFixed(3) : +v.toPrecision(3));
  return [
    { max: round(b1), color: C[0], label: "Low", seeded: true },
    { max: round(b2), color: C[1], label: "Medium", seeded: true },
    { max: round(max), color: C[2], label: "High", seeded: true },
  ];
}
