// TASKS.csv #3620 (Fireweed rehearsal, run F; side 2's measurements 2026-11-15) — without a working GPU (Electron's --disable-gpu, a blocked or missing graphics
// driver, Remote Desktop: 'Microsoft Basic Render Driver', SwiftShader, llvmpipe) the 3D View drew the whole Macpass project with grades at 3 frames a second
// (stalls of up to 2 s): 6,351 of 6,390 ms of an orbit were the software rasteriser's own work, and the frame time did not change with the canvas area
// (333 ms at 1,614 x 806, 317 ms at 700 x 350): it is the triangle count (32,546 assay spheres of 180 triangles: 5.9 million a frame), not the pixels.
// 'Light drawing' draws fewer triangles: assays along the hole (a 4-sided prism, 16 triangles) from 4,000 samples instead of 40,000, or a 20-triangle solid for a sphere (180);
// the intervals as 4-sided prisms; the coarse (merged) level of detail from a sample under 12 px instead of 3; no antialiasing; pixel ratio 1.
// It starts on for a software renderer, and can be set either way on this computer (localStorage 'geostrix.lightDrawing': 'on' | 'off').
// This file is also where the 3D View's WebGL renderer is registered, so its draw counts (renderer.info) can be read for the tests and the problem report.
import { gpuClass, rendererName } from "./detailTilesPref.js";
import { notice } from "../notices.js";

const KEY = "geostrix.lightDrawing";
let light = false, renderer = null, probed = null, frame = null, rafId = 0;

export const isLight = () => light;
export const setLight = (on) => { light = !!on; };
export const LIGHT_LOD_SCALE = 4; // a sample under 3 x 4 = 12 px is drawn coarse (and back to full above 4.5 x 4)
export const LIGHT_ASSAY_AUTO_LIMIT = 4000;
export const LIGHT_LINES_MIN = 10000; // an interval layer of this many intervals is drawn as crossed ribbons (4 triangles) in light drawing: at the whole-project view each is under 2 px

const readPref = () => { try { const v = localStorage.getItem(KEY); return v === "on" || v === "off" ? v : "auto"; } catch { return "auto"; } };
export const setLightPref = (v) => { try { if (v === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch { /* private window: this session only */ } };

// the choice on this computer: 'auto' (a software renderer: light) | 'on' | 'off'; applying it decides again at once (the 3D View then rebuilds its drawing)
export const lightPref = () => readPref();
export function applyLightPref(v) { setLightPref(v); return decideLight(probeRendererName(), v); }

// the GPU's name from a throwaway context, before the 3D View's own renderer exists (antialiasing is chosen at its creation)
export function probeRendererName() {
  if (probed !== null) return probed;
  try {
    const gl = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension?.("WEBGL_debug_renderer_info");
    probed = String((ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter?.(gl.RENDERER)) || "");
    gl?.getExtension?.("WEBGL_lose_context")?.loseContext?.();
  } catch { probed = ""; }
  return probed;
}

// pref + the GPU's name -> whether light drawing is on; sets it. name: for a test
export function decideLight(name = probeRendererName(), pref = readPref()) {
  light = pref === "on" ? true : pref === "off" ? false : gpuClass(name) === "software";
  return light;
}

// the notice at the start: what was found and how to change it (null when light drawing is off, or was asked for)
export function lightDrawingNotice(name = probeRendererName(), pref = readPref()) {
  if (!light || pref === "on") return null;
  return notice("Software rendering detected ({name}): the 3D view draws fewer triangles (assays along the hole, simpler solids, coarser detail from afar). A graphics driver update restores full drawing; the Drawing choice in the sidebar changes this.", { name: name || "no graphics driver" });
}

// the 3D View's renderer: its draw counts are read from here (window.__geostrixRenderInfo, the problem report, tests)
// three resets renderer.info on every render() call, and a frame is several (the scene, then the compass and the axis gizmo): the last one's 51 triangles are all it
// would say. So it is not reset by three (autoReset off); each animation frame takes what the renders since the last one added up to, and clears it.
export function registerRenderer(r) {
  renderer = r; frame = null;
  if (typeof window !== "undefined") window.__geostrixRenderInfo = renderStats;
  if (r?.info && typeof requestAnimationFrame === "function") {
    r.info.autoReset = false;
    if (rafId) cancelAnimationFrame(rafId);
    const tick = () => {
      if (renderer !== r) return;
      const i = r.info.render;
      if (i.calls > 0) frame = { calls: i.calls, triangles: i.triangles, points: i.points, lines: i.lines };
      r.info.reset();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }
}
export function renderStats() {
  const r = renderer;
  if (!r?.info) return null;
  const i = r.info, size = r.getSize ? r.getSize({ x: 0, y: 0, set(a, b) { this.x = a; this.y = b; return this; } }) : null;
  const name = rendererName(r);
  const f = frame || i.render; // the last frame's counts (all its renders), else what three holds
  return { renderer: name, gpu: gpuClass(name) || "discrete", light, calls: f.calls, triangles: f.triangles, points: f.points, lines: f.lines, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : null, canvas: size ? `${size.x}x${size.y}` : null };
}
