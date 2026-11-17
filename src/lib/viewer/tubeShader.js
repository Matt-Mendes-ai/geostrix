// TASKS.csv #3643 (Fireweed rehearsal #3572 (3), Macpass) — interval tubes (lithology, alteration, veins, density, a log drawn as intervals…)
// keep a radius in METRES in their instance matrix, so from a few kilometres out a 0.8 m tube is under a pixel and the layer is simply
// missing, while the hole's trace and its neighbours (fixed width) stay. Done in the vertex shader, as the collar markers' floor is
// (collarMarkerShader.js, #2623): the cross-section of each tube vertex is widened about the tube's axis so the tube is never thinner than
// uTubeMinPx pixels (and, only when a cap is set, never wider than uTubeMaxPx). Nothing is rescaled in the scene: the instance matrices,
// the pick index (#304) and Identify keep the true metres; the floor only draws the tube wider. Depth is the vertex's own, so a long tube
// keeps one width on screen along its length. The viewport height is the collar markers' uniform (one source, kept by ViewportFigureOverlay).
import { COLLAR_MARKER_UNIFORMS } from "./collarMarkerShader.js";

export const TUBE_UNIFORMS = { uTubeMinPx: { value: 1.5 }, uTubeMaxPx: { value: 1e9 }, uViewportH: COLLAR_MARKER_UNIFORMS.uViewportH };

const DECL = "uniform float uTubeMinPx;\nuniform float uTubeMaxPx;\nuniform float uViewportH;\n";
const BODY = `
#ifdef USE_INSTANCING
  mat4 gsInst = instanceMatrix;
#else
  mat4 gsInst = mat4(1.0);
#endif
float gsR = length((modelMatrix * gsInst * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
vec4 gsMv0 = modelViewMatrix * gsInst * vec4(transformed, 1.0);
float gsD = projectionMatrix[3][3] == 1.0 ? 1.0 : max(1e-6, -gsMv0.z);
float gsPx = gsR * projectionMatrix[1][1] * 0.5 * uViewportH / gsD;
float gsK = gsPx > 1e-9 ? clamp(uTubeMinPx / gsPx, 1.0, 1e4) : 1.0;
if (gsPx > uTubeMaxPx) gsK = uTubeMaxPx / gsPx;
vec3 gsLocal = transformed; gsLocal.xz *= gsK;
vec4 mvPosition = modelViewMatrix * gsInst * vec4(gsLocal, 1.0);
gl_Position = projectionMatrix * mvPosition;
`;

// the vertex shader with the tube's projection (exported for the test)
export function tubeVertex(src) {
  if (!src.includes("#include <project_vertex>")) return src;
  return DECL + src.replace("#include <project_vertex>", BODY);
}

// the factor the shader applies to a tube's cross-section: radiusM metres at depth (view-space distance; null: orthographic), a camera
// whose projectionMatrix[1][1] is proj11 (1 / tan(fov / 2)), a viewport viewportH pixels high. Same arithmetic as the shader (tested).
export function tubeFactor(radiusM, depth, proj11, viewportH, minPx = TUBE_UNIFORMS.uTubeMinPx.value, maxPx = TUBE_UNIFORMS.uTubeMaxPx.value) {
  const px = (radiusM * proj11 * 0.5 * viewportH) / (depth == null ? 1 : Math.max(1e-6, depth));
  let k = px > 1e-9 ? Math.min(1e4, Math.max(1, minPx / px)) : 1;
  if (px > maxPx) k = maxPx / px;
  return k;
}

// TASKS.csv #3668 (follow-up of #3643) — the tube size choice, kept with the view (figureOverlay.tubeSize { mode, px }): 'auto' = never thinner than DEFAULT_TUBE_MIN_PX (the
// look since #3643); 'true' = the true radius in metres, however thin it draws far out; 'atLeast' = never thinner than px pixels; 'fixed' = exactly px pixels wide at any distance.
// -> { min, max } for the uniforms (px)
export const DEFAULT_TUBE_MIN_PX = 1.5;
export function tubeSizeUniforms(setting) {
  const mode = setting?.mode, px = Number(setting?.px);
  if (mode === "true") return { min: 0, max: 1e9 };
  if (mode === "atLeast" && px > 0) return { min: px, max: 1e9 };
  if (mode === "fixed" && px > 0) return { min: px, max: px };
  return { min: DEFAULT_TUBE_MIN_PX, max: 1e9 };
}

// the prototypes an interval tube is drawn with (protos.js: the 6- and 16-sided cylinders, the square prism, the crossed ribbons of light drawing)
const TUBE_KEYS = new Set(["cyl6", "cyl16", "prism4", "cross"]);
export const isTubeProto = (geometry) => TUBE_KEYS.has(geometry?.userData?.protoKey);

const onBeforeCompile = (sh) => { Object.assign(sh.uniforms, TUBE_UNIFORMS); sh.vertexShader = tubeVertex(sh.vertexShader); };
const cacheKey = () => "gs-tube-px";
// gives a batch's material the shader; idempotent
export function pixelTubeMaterial(material) {
  if (!material || material.onBeforeCompile === onBeforeCompile) return material;
  material.userData.pixelTube = true;
  material.onBeforeCompile = onBeforeCompile;
  material.customProgramCacheKey = cacheKey;
  material.needsUpdate = true;
  return material;
}
