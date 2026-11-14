// TASKS.csv #3186 (split from #2322) — a DXF / OBJ / Gocad / Leapfrog solid brought onto a local grid tied to a real CRS
// (lib/localGridTie.js). Such a file carries no CRS, so on a tied grid its numbers are either local-grid metres already or
// coordinates in the tie's CRS; the importer asks which (one question, with the distance from the holes each way as a hint) and,
// for the tie's CRS, takes every vertex through it here: x / y by the similarity (worldToLocal), elevation unchanged, as
// tiedExport writes them. Normals turn by the grid's rotation only. Pure: no UI.
import { worldToLocal } from "./localGridTie.js";
import { median } from "./arrayStats.js";

const med = (a) => { const m = median(a); return Number.isFinite(m) ? m : null; };

// the bounding box's centre in plan, or null
function planCentre(parts) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of parts || []) {
    const a = p.positions;
    for (let i = 0; i < a.length; i += 3) { const x = a[i], y = a[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x0 === Infinity ? null : { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

// -> { asLocalM, viaTieM, suggest: "tie" | "local" | null }: the plan distance (m) from the holes' median collar to the solid's
// centre read each way; suggest is the nearer one when it is at least 10 times nearer (else null: no hint)
export function solidTieGuess(parts, tie, collars) {
  const c = planCentre(parts);
  const hx = med((collars || []).map((h) => Number(h.x))), hy = med((collars || []).map((h) => Number(h.y)));
  if (!c || !tie || hx == null || hy == null) return { asLocalM: null, viaTieM: null, suggest: null };
  const t = worldToLocal(tie, c.x, c.y);
  const asLocalM = Math.hypot(c.x - hx, c.y - hy), viaTieM = Math.hypot(t.x - hx, t.y - hy);
  const suggest = viaTieM * 10 <= asLocalM ? "tie" : asLocalM * 10 <= viaTieM ? "local" : null;
  return { asLocalM, viaTieM, suggest };
}

// the parts with positions (and normals) from the tie's CRS into the local grid; new arrays, the input is not changed
export function solidPartsToLocal(parts, tie) {
  const d = tie.a * tie.a + tie.b * tie.b, s = Math.sqrt(d), c = tie.a / s, sn = tie.b / s;
  return (parts || []).map((p) => {
    const w = p.positions, out = new Float64Array(w.length);
    for (let i = 0; i < w.length; i += 3) { const l = worldToLocal(tie, w[i], w[i + 1]); out[i] = l.x; out[i + 1] = l.y; out[i + 2] = w[i + 2]; }
    let normals = p.normals;
    if (normals?.length) {
      const n = new Float32Array(normals.length);
      for (let i = 0; i < normals.length; i += 3) { const x = normals[i], y = normals[i + 1]; n[i] = c * x + sn * y; n[i + 1] = -sn * x + c * y; n[i + 2] = normals[i + 2]; }
      normals = n;
    }
    return { ...p, positions: out, ...(normals ? { normals } : {}) };
  });
}
