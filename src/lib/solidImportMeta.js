// TASKS.csv #552 — the parts of solidImport.js the 3D view needs at startup (accept list, size warning, bounds),
// kept apart so the DXF / OBJ parsers load only when a solid is actually imported.
export const SOLID_FACE_WARN = 1_000_000;

export const SOLID_IMPORT_EXTENSIONS = ".dxf,.obj";

export function solidBounds(parts) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of parts || []) {
    const a = p.positions;
    for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { const v = a[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  }
  if (mn[0] === Infinity) return null;
  return { min: { x: mn[0], y: mn[1], z: mn[2] }, max: { x: mx[0], y: mx[1], z: mx[2] } };
}
