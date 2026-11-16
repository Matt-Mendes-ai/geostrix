// TASKS.csv #2623 (review #2325, WA uranium) — collar markers: never stretched by the vertical exaggeration, and never smaller than a
// few pixels on screen (430 collars were under a pixel at Fit). Done in the vertex shader, so no marker is rescaled in the scene: its
// matrixWorld, the pick index (#304) and Identify keep the true 3.2 m sphere (a click must land on that sphere to pick it; the floor only
// draws it bigger). The view matrix exaggerates y about the orbit target (modules/viewer/verticalExaggeration.js): dividing the local y
// by VE before the model / instance matrix gives back a round marker at its exaggerated place. One set of uniforms for every marker
// material: changing VE or the canvas height costs no recompile.
export const COLLAR_MARKER_UNIFORMS = { uVE: { value: 1 }, uMinPx: { value: 2.5 }, uViewportH: { value: 800 } };

const DECL = "uniform float uVE;\nuniform float uMinPx;\nuniform float uViewportH;\n";
const BODY = `
#ifdef USE_INSTANCING
  mat4 gsInst = instanceMatrix;
#else
  mat4 gsInst = mat4(1.0);
#endif
vec3 gsLocal = transformed; gsLocal.y /= max(uVE, 1.0);
vec4 gsCentre = modelViewMatrix * gsInst * vec4(0.0, 0.0, 0.0, 1.0);
float gsR = length((modelMatrix * gsInst * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
float gsD = projectionMatrix[3][3] == 1.0 ? 1.0 : max(1e-6, -gsCentre.z); // #3855: an orthographic camera has no depth in its scale
float gsPx = gsR * projectionMatrix[1][1] * 0.5 * uViewportH / gsD;
float gsK = max(1.0, uMinPx / max(1e-6, gsPx));
vec4 mvPosition = modelViewMatrix * gsInst * vec4(gsLocal * gsK, 1.0);
gl_Position = projectionMatrix * mvPosition;
`;

// TASKS.csv #3855 (Scottie Gold review, Layout) — a Layout viewport at a fixed scale drew the collar markers as nested rings kilometres wide when the 3D
// View was zoomed in at the refresh. The capture renders through an ORTHOGRAPHIC camera placed at the live view's distance; the floor divided the
// marker's size by that distance as for a perspective camera, so a 1 : 50,000 frame taken from 100 m out read every marker hundreds of times too
// small and blew it up past the near plane, which cut each sphere into a ring. An orthographic projection (projectionMatrix[3][3] == 1) has no depth
// in its scale, as the tubes' shader already knew (tubeShader.js). The factor the shader applies, for the test: radiusM at depth (null: orthographic).
export function collarMarkerFactor(radiusM, depth, proj11, viewportH, minPx = COLLAR_MARKER_UNIFORMS.uMinPx.value) {
  const px = (radiusM * proj11 * 0.5 * viewportH) / (depth == null ? 1 : Math.max(1e-6, depth));
  return Math.max(1, minPx / Math.max(1e-6, px));
}
// #3855 — the capture's own frame height for the pixel floors (markers and tubes) while fn renders, then the live one back
export function withMarkerViewport(heightPx, fn) {
  const u = COLLAR_MARKER_UNIFORMS.uViewportH, live = u.value;
  if (heightPx > 0) u.value = heightPx;
  try { return fn(); } finally { u.value = live; }
}

// the vertex shader with the marker's projection (exported for the test)
export function collarMarkerVertex(src) {
  if (!src.includes("#include <project_vertex>")) return src;
  return DECL + src.replace("#include <project_vertex>", BODY);
}

// marks a material as a collar marker's and gives it the shader; idempotent. A clone keeps the flag in userData (the layer batch clones
// the marker's material, layerBatches.js) and calls this again.
const onBeforeCompile = (sh) => { Object.assign(sh.uniforms, COLLAR_MARKER_UNIFORMS); sh.vertexShader = collarMarkerVertex(sh.vertexShader); };
const cacheKey = () => "gs-collar-marker";
export function collarMarkerMaterial(material) {
  if (!material || material.onBeforeCompile === onBeforeCompile) return material;
  material.userData.collarMarker = true;
  material.onBeforeCompile = onBeforeCompile;
  material.customProgramCacheKey = cacheKey;
  material.needsUpdate = true;
  return material;
}
