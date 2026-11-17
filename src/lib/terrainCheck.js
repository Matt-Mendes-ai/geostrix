// TASKS.csv #1620 (review #1497, Lawyers) — a new terrain checked against the collars: a picture imported as a DEM put the ground ~1,500 m
// under 446 collars and nothing said so. The median collar elevation minus the terrain under it (collars inside the terrain only).
import { terrainGroundAt } from "./viewer/geomath.js";
import { median } from "./arrayStats.js";
import { t as tr } from "./i18n.js"; // TASKS.csv #3882 follow-up — the cluster note is read by a person

// collars: [{ x, y, z }]; terrain: { bbox, gridW, gridH, elevations, noDataMask } -> { n, median } (at least 3 collars over it) | null
export function collarTerrainOffset(collars, terrain) {
  const d = [];
  for (const c of collars || []) {
    if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y) || !Number.isFinite(c?.z)) continue;
    const g = terrainGroundAt(terrain, c.x, c.y);
    if (Number.isFinite(g)) d.push(c.z - g);
  }
  return d.length >= 3 ? { n: d.length, median: median(d) } : null;
}

// TASKS.csv #3882 follow-up (Main, 2026-11-17) — a COMPACT CLUSTER of collars far above the terrain, named even when the project-wide median is moderate.
// Found measuring GLO-30 over the Century sample: 21 of its 37 collars, in one 1.3 x 0.85 km footprint (the open pit), sit 200-280 m above GLO-30's
// ground (2011-2015) while the older SRTM tiles (2000, before the pit) agree with them to 2 m; the median (83 m) is under the 100 m the fetch check
// acts on. Ground mined since a hole was drilled reads LOWER than the collar. The cluster is the largest group of collars sitting at least `thr`
// above the ground, each within `link` m of another (single linkage); it must hold 3 or more collars, span 5 km at most, and leave at least a quarter
// of the compared collars on the ground (more is a project-wide datum or units problem, which the median check and Data QC's steady-offset line say),
// and the rest of the collars must agree with the ground (their median under `thr`): a steady shift of every collar is not a pit.
// `thr` is 50 m, or three node spacings where the grid is coarse (steep ground at 140 m nodes can differ from a correct collar by tens of metres).
// terrain: { bbox, gridW, gridH, elevations, noDataMask, source? }; collars: [{ x, y, z }]. -> { n, of, lo, hi, widthM, heightM } | null
export function collarClusterAbove(collars, terrain, { nodeM = null } = {}) {
  const node = Number(nodeM) > 0 ? Number(nodeM) : Number(terrain?.source?.nodeM) > 0 ? Number(terrain.source.nodeM) : 0;
  const thr = Math.max(50, 3 * node), link = Math.max(400, 3 * node);
  const offs = [];
  for (const c of collars || []) {
    if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y) || !Number.isFinite(c?.z)) continue;
    const g = terrainGroundAt(terrain, c.x, c.y);
    if (Number.isFinite(g)) offs.push({ x: c.x, y: c.y, dz: c.z - g });
  }
  if (offs.length < 4) return null;
  const cand = offs.filter((o) => o.dz >= thr);
  if (cand.length < 3) return null;
  // single linkage: the groups of candidates within `link` m of one another
  const seen = new Array(cand.length).fill(false);
  let best = null;
  for (let i = 0; i < cand.length; i++) {
    if (seen[i]) continue;
    const group = [], stack = [i];
    seen[i] = true;
    while (stack.length) {
      const a = cand[stack.pop()];
      group.push(a);
      for (let j = 0; j < cand.length; j++) {
        if (seen[j]) continue;
        if (Math.hypot(cand[j].x - a.x, cand[j].y - a.y) <= link) { seen[j] = true; stack.push(j); }
      }
    }
    if (!best || group.length > best.length) best = group;
  }
  if (!best || best.length < 3) return null;
  let xlo = Infinity, xhi = -Infinity, ylo = Infinity, yhi = -Infinity; // loops, not Math.min(...xs): a cluster can hold thousands of collars (#3031)
  for (const o of best) { if (o.x < xlo) xlo = o.x; if (o.x > xhi) xhi = o.x; if (o.y < ylo) ylo = o.y; if (o.y > yhi) yhi = o.y; }
  const widthM = xhi - xlo, heightM = yhi - ylo;
  if (Math.hypot(widthM, heightM) > 5000) return null; // not one compact area
  if (best.length > 0.75 * offs.length) return null; // most of the project: a datum or units problem, said elsewhere
  const rest = offs.filter((o) => !best.includes(o)).map((o) => Math.abs(o.dz)).sort((a, b) => a - b);
  if (rest[Math.floor(rest.length / 2)] >= thr) return null; // the rest of the collars are off the ground too (a steady shift, many misfits): not one pit
  const dz = best.map((o) => o.dz).sort((a, b) => a - b);
  return { n: best.length, of: offs.length, lo: dz[0], hi: dz[dz.length - 1], widthM, heightM };
}

// the cluster said in a sentence (a person reads it: the interface language), with the advice that fits the terrain's source
export function collarClusterNote(cluster, terrain) {
  if (!cluster) return "";
  const svc = String(terrain?.source?.service || "");
  const what = tr("{n} collars in one area ({w} × {h} m) sit {lo} to {hi} m above this terrain: the ground may have been mined or excavated since they were drilled.", { n: cluster.n, w: Math.round(cluster.widthM).toLocaleString(), h: Math.round(cluster.heightM).toLocaleString(), lo: Math.round(cluster.lo).toLocaleString(), hi: Math.round(cluster.hi).toLocaleString() });
  const advice = /^Copernicus/i.test(svc) ? tr("This terrain (Copernicus GLO-30) shows the ground of 2011-2015: try the AWS Terrain Tiles (SRTM, 2000) or your own survey.")
    : /^AWS Terrain Tiles/i.test(svc) ? tr("This terrain (AWS Terrain Tiles) is mostly SRTM, from 2000: check the collar elevations, or try Copernicus GLO-30 (2011-2015) or your own survey.")
      : tr("Check the collar elevations, or try another terrain source or your own survey.");
  return what + " " + advice;
}
