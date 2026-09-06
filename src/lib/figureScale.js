// TASKS.csv #311 — the ONE place figure-scale maths lives.
//
// Why this file exists at all: before #311 the "how many real metres does one pixel cover"
// derivation existed in exactly one place (ViewerModule's doCaptureViewportRender, feeding
// LayoutModule's scale-bar element via worldHeightAtTarget), and that was correct. #311 asks for a
// scale bar in the 3D viewport itself, and the obvious-but-wrong way to build it is a second
// implementation next to the first. Two scale bars that could disagree is strictly worse than one
// scale bar, because a scale bar is a measuring instrument that a reader trusts without checking —
// so both the Layout path and the new viewport overlay now derive their numbers from here.
//
// EVERYTHING BELOW IS PURE (no THREE, no DOM, no React) so it can be — and was — hand-verified in
// plain Node against independently-derived expected values, per CLAUDE.md's verification discipline.

// The real-world height, in metres, of the camera's view frustum measured IN THE PLANE THROUGH THE
// ORBIT TARGET perpendicular to the view direction. This is the exact figure ViewerModule has always
// used for viewport snapshots (it was `2 * cs.radius * Math.tan(fovRad / 2)` inline there).
//
// HONESTY NOTE, and this is the crux of #311's scale-bar decision: a PERSPECTIVE camera has no
// single scale. Frustum height grows linearly with distance from the eye, so geometry nearer than
// the target reads larger than this figure says and geometry farther reads smaller. This function
// is exact at one depth only — the orbit target, i.e. the point the user is orbiting around, which
// is also the centre of the screen. Any UI built on it MUST say so; see ViewportFigureOverlay.jsx,
// which labels its bar "at view centre" for exactly this reason, and LayoutModule's ViewportControls,
// which prefixes its ratio with "~" unless the capture was orthographic (#69's true-scale option,
// where the frustum height is constant with depth and the figure IS exact everywhere).
export function worldHeightAtTargetM(fovDeg, radius) {
  if (!(fovDeg > 0) || !(radius > 0)) return null;
  return 2 * radius * Math.tan((fovDeg * Math.PI) / 360); // fovDeg/2 in radians = fovDeg*PI/360
}

// Metres of real world per on-screen pixel, at the orbit target (see the caveat above).
export function metresPerPixelAtTarget(fovDeg, radius, pixelHeight) {
  const h = worldHeightAtTargetM(fovDeg, radius);
  if (h == null || !(pixelHeight > 0)) return null;
  return h / pixelHeight;
}

// "Nice" round number at or below x — 1/2/5 x 10^n. Moved here from LayoutModule.jsx (where it was a
// private helper) so the Layout scale bar and the viewport overlay round identically; LayoutModule
// now imports it from this file rather than keeping its own copy.
export function niceScaleNumber(x) {
  if (!isFinite(x) || x <= 0) return 100;
  const exp = Math.floor(Math.log10(x));
  const base = x / Math.pow(10, exp);
  let nice;
  if (base < 1.5) nice = 1;
  else if (base < 3.5) nice = 2;
  else if (base < 7.5) nice = 5;
  else nice = 10;
  return Math.round(nice * Math.pow(10, exp));
}

// The largest 1/2/5 x 10^n value that is <= x. Deliberately NOT niceScaleNumber: that one rounds to
// the NEAREST nice number and can round UP (1700 -> 2000, verified in Node), which is fine for
// Layout's "suggest a starting length the user can retype" use but wrong for a bar that must fit
// inside a fixed pixel budget on screen — an upward round there would overflow the bar's own box.
export function niceScaleNumberAtMost(x) {
  if (!isFinite(x) || x <= 0) return null;
  const exp = Math.floor(Math.log10(x));
  const base = x / Math.pow(10, exp);
  const nice = base >= 5 ? 5 : base >= 2 ? 2 : 1;
  return nice * Math.pow(10, exp);
}

// Pick a scale bar that is a round number of metres and no wider than maxBarPx on screen, and report
// its exact pixel length so the drawn bar and its printed label cannot drift apart (the failure mode
// #67's Layout work already had to fix once: a fixed-width bar relabelled with a number that no
// longer matched its own length). Returns null when there is nothing sensible to draw.
export function chooseScaleBar(metresPerPixel, maxBarPx) {
  if (!(metresPerPixel > 0) || !(maxBarPx > 0)) return null;
  const metres = niceScaleNumberAtMost(maxBarPx * metresPerPixel);
  if (!(metres > 0)) return null;
  const px = metres / metresPerPixel;
  if (!isFinite(px) || px <= 0) return null;
  return { metres, px, label: formatDistance(metres) };
}

// Metres up to 1 km, kilometres beyond — matching how a geologist would write it on a figure.
// Only ever fed 1/2/5 x 10^n values, so one decimal place is always enough to be exact (2.5 km,
// 0.5 m) and a value is never silently rounded into a lie.
export function formatDistance(metres) {
  if (metres >= 1000) {
    const km = metres / 1000;
    return `${km % 1 === 0 ? km : km.toFixed(1)} km`;
  }
  if (metres < 1) return `${Number(metres.toFixed(3))} m`;
  return `${metres} m`;
}
