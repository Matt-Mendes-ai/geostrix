// TASKS.csv #636 — colour / opacity of a generated surface, chosen from its right-click menu in the 3D View.
// Generated-surface meshes are built in several places (implicit models, imports, unit volumes, booleans, geoML,
// project restore), so the style is NOT applied where they are built: it lives on the surface record
// (`style: { color, opacity }`, saved with the project like the rest of the record) and applySurfaceStyle()
// is run over every surface whenever the list changes. The mesh's own look is remembered the first time a
// style touches it (userData.styleOrig), so "Reset" returns to it — vertex colours included (geoML's
// uncertainty shading) — and the project file keeps that original as the surface's base colour.

// patch: { color?: "#rrggbb" | null, opacity?: number | null }; null removes that part. Returns the new style,
// or undefined when nothing is left (the record then carries no style at all).
export function mergeSurfaceStyle(style, patch) {
  if (patch === null) return undefined;
  const out = { ...(style || {}) };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v == null) delete out[k];
    else if (k === "color" && /^#[0-9a-f]{6}$/i.test(v)) out.color = v.toLowerCase();
    else if (k === "opacity" && Number.isFinite(v)) out.opacity = Math.min(1, Math.max(0.05, v));
  }
  return Object.keys(out).length ? out : undefined;
}

export function applySurfaceStyle(mesh, surface) {
  const mat = mesh?.material;
  if (!mat || Array.isArray(mat) || !mat.color) return;
  const u = mesh.userData || (mesh.userData = {});
  const st = surface?.style;
  if (!st && !u.styleOrig) return; // never styled: leave the mesh exactly as it was built
  if (!u.styleOrig) {
    // a surface shown in its data-support colours has a white base and vertex colours on (#91/#92); its real
    // base colour is the one that toggle kept
    u.styleOrig = surface?.supportColored
      ? { color: u.baseColorHex ?? mat.color.getHex(), opacity: mat.opacity, transparent: mat.transparent, vertexColors: false }
      : { color: mat.color.getHex(), opacity: mat.opacity, transparent: mat.transparent, vertexColors: !!mat.vertexColors };
  }
  const o = u.styleOrig;
  if (!surface?.supportColored) { // the support view wins while it is on; the chosen colour comes back after
    const vc = st?.color ? !!u.shadeFactors : o.vertexColors; // #977: colour factors (an explicit surface's extrapolated part) multiply a chosen colour
    if (!!mat.vertexColors !== vc) { mat.vertexColors = vc; mat.needsUpdate = true; }
    if (st?.color) mat.color.set(st.color); else mat.color.setHex(o.color);
  }
  const op = st?.opacity ?? o.opacity;
  mat.opacity = op;
  const tr = op < 1 || o.transparent;
  if (mat.transparent !== tr) { mat.transparent = tr; mat.needsUpdate = true; }
}

// The base look to save with the project: the mesh's original, not a style laid over it (the style is saved
// separately, so reopening the project shows the same thing and Reset still has somewhere to go back to).
export function surfaceBaseLook(mesh) {
  const o = mesh?.userData?.styleOrig, mat = mesh?.material;
  return {
    color: o ? o.color : mat?.color?.getHex?.() ?? null,
    opacity: o ? o.opacity : mat?.opacity ?? 0.75,
  };
}
