// TASKS.csv #3252 (Main's condition on phase 3) — the 3D View's detail tiles on or off, kept on this computer (localStorage), one switch for the
// imagery tiles and one for the terrain tiles. The terrain tiles start OFF on a computer with software or integrated graphics, or 8 GB of
// memory or less (they add the most to each frame); the imagery tiles start on. Small, no imports: read by the 3D View at startup.
const KEY = "geostrix.detailTiles";
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;
const INTEGRATED = /intel|uhd graphics|iris|hd graphics|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|mali|adreno|powervr|apple (m\d|gpu)/i;
// -> "software" | "integrated" | null (a discrete GPU, or not known)
export function gpuClass(rendererName) {
  const s = String(rendererName || "");
  return SOFTWARE.test(s) ? "software" : INTEGRATED.test(s) ? "integrated" : null;
}
export function rendererName(renderer) {
  try { const gl = renderer?.getContext?.(); const ext = gl?.getExtension?.("WEBGL_debug_renderer_info"); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter?.(gl.RENDERER) || ""; } catch { return ""; }
}
// why the terrain tiles start off here (null: they start on)
export function terrainOffReason({ gpu = null, memoryGB = null } = {}) {
  if (gpu === "software") return "software";
  if (gpu === "integrated") return "integrated";
  if (memoryGB > 0 && memoryGB <= 8) return "memory";
  return null;
}
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } };
// { imagery, terrain }: the switches, the chosen value where one was chosen, else the default for this computer
export function detailTilesPrefs(machine = {}) {
  const p = read();
  return { imagery: p.imagery ?? true, terrain: p.terrain ?? !terrainOffReason(machine), terrainChosen: p.terrain != null };
}
export function setDetailTiles(kind, on) {
  const p = read(); p[kind] = !!on;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private window: this session only */ }
}
