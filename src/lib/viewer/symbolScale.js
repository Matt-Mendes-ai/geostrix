// TASKS.csv #1597 (review #1497, Lawyers) — a point symbol keeps a readable size on screen. Surface-sample symbols are sized in
// metres from each medium's own spacing (#1346: rock chips 4.1 m beside 36.9 m soils on Lawyers), so at the 2 km scale the
// rock chips that carry the gold were 1-2 px specks. The symbols are built once (one mesh per sample, batched), not scaled
// per frame, so the build takes the view's metres-per-pixel at the orbit target and raises any symbol under `minPx` to it;
// when the camera has settled at a zoom a factor of two away from the one the symbols were built at, they are rebuilt.
// Pure: no three.js.

// metres per screen pixel at the orbit target: a perspective camera's frustum height at `radius`, or an orthographic one's
// own frame, over the viewport height. camera: { isPerspectiveCamera, fov } | { top, bottom, zoom }
export function metresPerPixel(camera, radius, viewportH) {
  if (!(viewportH > 0)) return NaN;
  if (camera?.isPerspectiveCamera || Number.isFinite(camera?.fov)) return (2 * radius * Math.tan(((camera.fov || 50) * Math.PI) / 360)) / viewportH;
  if (Number.isFinite(camera?.top) && Number.isFinite(camera?.bottom)) return (camera.top - camera.bottom) / ((camera.zoom || 1) * viewportH);
  return NaN;
}

// the radius (m) a symbol needs to be `minPx` across on screen
export const minSymbolRadiusM = (metresPerPx, minPx = 6) => (Number.isFinite(metresPerPx) ? (minPx / 2) * metresPerPx : 0);

// built at one metres-per-pixel, the camera now at another: rebuild when they differ by `factor` or more
export const needsSymbolRebuild = (builtMpp, nowMpp, factor = 2) => Number.isFinite(builtMpp) && Number.isFinite(nowMpp) && builtMpp > 0 && nowMpp > 0 && Math.max(builtMpp / nowMpp, nowMpp / builtMpp) >= factor;

// TASKS.csv #2849 — the survey points' floor on screen (px across): a regional gravity survey (400 m stations over 94 km) reads as a map of
// coloured stations at Fit instead of a few specks
export const GEOPHYS_MIN_PX = 5;
