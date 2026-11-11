// TASKS.csv #2550 (review #2486, WA lithium) — one density for the whole model: fresh pegmatite (about 2.7) and clay-weathered rock (1.8-2.0)
// took the same, on a project with a Weathering layer. Each block takes the code of the nearest logged interval of a chosen layer (its
// interval midpoints, desurveyed, within maxDistM) and that code's density; a block with no code within reach, or a code with no density
// typed, takes the default. Pure.

// points [{ x, y, z, code }] -> (cell) => code | null, the nearest point within maxDistM (a 3D grid of maxDistM bins)
export function nearestCodeLookup(points, maxDistM) {
  const R = Number(maxDistM);
  if (!(R > 0) || !points?.length) return () => null;
  const O = 131072, p0 = points[0], bx0 = Math.floor(p0.x / R), by0 = Math.floor(p0.y / R), bz0 = Math.floor(p0.z / R);
  const key = (i, j, k) => ((i - bx0 + O) * 262144 + (j - by0 + O)) * 262144 + (k - bz0 + O);
  const bins = new Map();
  for (const p of points) { const k = key(Math.floor(p.x / R), Math.floor(p.y / R), Math.floor(p.z / R)); const l = bins.get(k); if (l) l.push(p); else bins.set(k, [p]); }
  const R2 = R * R;
  return (c) => {
    const i0 = Math.floor(c.x / R), j0 = Math.floor(c.y / R), k0 = Math.floor(c.z / R);
    let best = R2 + 1e-9, code = null;
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (let k = k0 - 1; k <= k0 + 1; k++) {
      for (const p of bins.get(key(i, j, k)) || []) { const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z, d = dx * dx + dy * dy + dz * dz; if (d < best) { best = d; code = p.code; } }
    }
    return code;
  };
}

// densities { code: t/m3 }, fallback t/m3 -> (cell) => t/m3 | null; also counts which density each block took (for the line under the table)
export function densityByCode(codeOf, densities, fallback) {
  const def = Number(fallback) > 0 ? Number(fallback) : null;
  const used = new Map();
  const of = (c) => {
    const code = codeOf(c);
    const d = code != null && Number(densities?.[code]) > 0 ? Number(densities[code]) : def;
    const k = code != null && Number(densities?.[code]) > 0 ? code : "(default)";
    used.set(k, (used.get(k) || 0) + 1);
    return d;
  };
  return { of, used };
}

// trace [{ md, x, y, z }] (desurveyHole), the md ascending -> the interval [from, to) as points every stepM, each { x, y, z, code }
export function intervalCodePoints(trace, from, to, code, stepM) {
  const out = [], f = Number(from), t = Number(to), st = Math.max(0.5, Number(stepM) || 2);
  if (!trace?.length || !(t > f)) return out;
  let i = 0;
  for (let d = f + Math.min(st, t - f) / 2; d < t; d += st) {
    while (i < trace.length - 2 && trace[i + 1].md < d) i++;
    const a = trace[i], b = trace[Math.min(i + 1, trace.length - 1)], span = b.md - a.md;
    const k = span > 0 ? Math.min(1, Math.max(0, (d - a.md) / span)) : 0;
    out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, code });
  }
  return out;
}
