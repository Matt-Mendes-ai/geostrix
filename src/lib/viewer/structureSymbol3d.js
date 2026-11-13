// TASKS.csv #3067 (Matt, 2026-11-12: "let's have both. I think it will look great!") — a drillhole structure disc keeps its disc and carries
// its structure type's USGS (FGDC) symbol inside it (lib/structureSymbols.js, #3066: the same symbols, families and per-type choices as the
// outcrop measurements). The symbol is drawn in the disc's own plane: one shared geometry per symbol in the disc's local frame, given the
// disc's transform, so the symbols batch into instanced draws like the discs and pins (layerBatches.js, sharedProto).
//
// The disc (PROTO_CIRCLE_24, radius 1 in its local XY plane, normal +Z; drillholeScene.js: rotation.order YXZ, rotation.x = pi/2 - dip,
// rotation.y = -dip direction) has local -X along the right-hand-rule strike and local -Y down the dip. A symbol's (u along strike, v toward
// the dip) in mm is therefore local (-u, -v) x MM_TO_DISC: the 5 mm strike line spans 80 % of the disc's diameter. Lines are flat strips
// (a WebGL line is one pixel wide), drawn just above and below the disc so the symbol shows from either side.
import * as THREE from "three";
import { sharedProto } from "./protos.js";
import { symbolGeometry, projectSymbolChoices, lineScaleOf } from "../structureSymbols.js";

export const MM_TO_DISC = 0.8 / 2.5; // the strike line's half (2.5 mm) -> 0.8 of the disc's radius
export const STRIP_HALF = 0.035; // half a line's width, in disc radii (0.2 m on a 6 m disc), at line thickness 1
export const STRIP_HALF_MAX = 0.15; // TASKS.csv #3091 — at the thickest (x6) a line would cover a third of the disc
export const LIFT = 0.02; // off the disc's plane, in disc radii

const protos = new Map();

// -> { positions: Float32Array (xyz per vertex), count } in the disc's local frame
export function symbolTriangles(symbol, { half = STRIP_HALF, lift = LIFT } = {}) {
  const g = symbolGeometry(symbol), out = [];
  const P = (u, v) => [-u * MM_TO_DISC, -v * MM_TO_DISC];
  const tri = (a, b, c) => { for (const z of [lift, -lift]) out.push(a[0], a[1], z, b[0], b[1], z, c[0], c[1], z); };
  for (const [u1, v1, u2, v2] of g.segments) {
    const a = P(u1, v1), b = P(u2, v2), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (!(L > 1e-9)) continue;
    const nx = (-dy / L) * half, ny = (dx / L) * half;
    // the strip, a little longer than the segment so the joints of a polyline close
    const ex = (dx / L) * half * 0.5, ey = (dy / L) * half * 0.5;
    const a1 = [a[0] - ex + nx, a[1] - ey + ny], a2 = [a[0] - ex - nx, a[1] - ey - ny], b1 = [b[0] + ex + nx, b[1] + ey + ny], b2 = [b[0] + ex - nx, b[1] + ey - ny];
    tri(a1, a2, b1); tri(b1, a2, b2);
  }
  for (const [u1, v1, u2, v2, u3, v3] of g.triangles) tri(P(u1, v1), P(u2, v2), P(u3, v3));
  return { positions: Float32Array.from(out), count: out.length / 3 };
}

// TASKS.csv #3091 — each type's line thickness (an outcrop set's lineScale, 0.25-6), from the set whose symbol choice the type uses
// (projectSymbolChoices: a later set's choice wins); a type no set chooses for is drawn at 1. -> { TYPEKEY: lineScale }
export function projectSymbolScales(surfaceStructures) {
  const choices = projectSymbolChoices(surfaceStructures), out = {};
  for (const set of surfaceStructures || []) for (const [k, v] of Object.entries(set?.symbolByType || {})) if (choices[k] === v) out[k] = lineScaleOf(set);
  return out;
}

// the drillhole build's key for the discs' symbols: a choice or a thickness changed (not the outcrop rows), #3067 / #3091
export const symbolBuildKey = (surfaceStructures) => JSON.stringify([projectSymbolChoices(surfaceStructures), projectSymbolScales(surfaceStructures)]);

// the shared geometry of a symbol at a line thickness (built once per symbol and thickness, tagged so batching shares it and disposal skips it)
export function symbolProto3d(symbol, lineScale = 1) {
  const sc = Number(lineScale) > 0 ? Number(lineScale) : 1;
  const key = sc === 1 ? `sym:${symbol.fgdc}` : `sym:${symbol.fgdc}:${sc}`;
  let geo = protos.get(key);
  if (!geo) {
    const { positions } = symbolTriangles(symbol, { half: Math.min(STRIP_HALF_MAX, STRIP_HALF * sc) }); // #3091
    geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.computeBoundingSphere();
    protos.set(key, (geo = sharedProto(geo, key)));
  }
  return geo;
}

// the ink that reads on a disc of this colour: near-black on a light disc, white on a dark one (relative luminance, sRGB)
export function symbolInk(discColor) {
  const h = new THREE.Color(discColor ?? "#888888").getHex(); // sRGB hex back, whatever the colour management
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const y = 0.2126 * lin((h >> 16) & 255) + 0.7152 * lin((h >> 8) & 255) + 0.0722 * lin(h & 255);
  return y > 0.22 ? "#1a2028" : "#ffffff";
}
