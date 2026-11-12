// Saved sections' traces in the 3D view ('lines in 3D'), moved out of ViewerModule (TASKS.csv #1705) and loaded on first use.
// TASKS.csv #1011 — Matt: "have the cross section display as on the 3d view so I can see it when looking from top. Have it display
// as a thick line": each section's line A -> B, on the terrain where there is one (2 m above it), else 2 m above the median collar
// elevation, drawn over everything so it stays visible from above and through the model.
// TASKS.csv #1126 — a thin dark line on a white halo with a tick at each end pointing the way the section is viewed (A on the left,
// B on the right in the section window, so the viewer faces the line's left-hand normal), and the name at A and name′ at B as
// fixed-size screen labels. #1255 — a fence's lines (many close parallel sections) are one thin line each, labelled once.
// TASKS.csv #1705 (review #1645, Copley) — the line and ticks were ribbons of a world width (0.3 % of the section's length, at least
// 1.5 m): zoomed in near collar level, perspective made them ~25 px black bars over the holes and the largest thing in a Snapshot.
// They are screen-space lines now (Line2 / LineMaterial, a width in pixels), so they stay thin reference lines at any zoom. Each
// line takes its resolution from the renderer's size at draw time, so a print-resolution capture keeps the same proportions.
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { terrainGroundAt } from "./geomath.js";
import { makeTextSprite } from "./textSprite.js";
import { fenceLabels } from "../sectionDefs.js";
import { t as tr } from "../i18n.js";

const INK = "#1a2028";
// [width in px, colour, render order]: a white halo under the dark line; a fence's lines are one thinner line
export const TRACE_STROKES = [[5, "#ffffff", 10], [2, INK, 11]];
export const FENCE_STROKES = [[1.5, INK, 11]];

const sizeV = new THREE.Vector2();
function screenLine(points, [px, color, order], tip) {
  const geo = new LineGeometry();
  geo.setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
  const mat = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: px, depthTest: false, transparent: true, opacity: 0.95 });
  mat.resolution.set(1024, 768); // replaced at each draw
  const line = new Line2(geo, mat);
  line.onBeforeRender = (renderer) => { renderer.getSize(sizeV); if (sizeV.x && sizeV.y) mat.resolution.copy(sizeV); };
  line.renderOrder = order;
  line.userData = { tip, screenWidthPx: px };
  return line;
}

export function clearSectionTraces(group) {
  group.children.slice().forEach((ch) => { group.remove(ch); ch.geometry?.dispose(); ch.material?.map?.dispose(); ch.material?.dispose(); }); // map: #1126 label textures
}

// group: the scene group (cleared first); sections: the saved sections; origin: the scene origin; terrain / collars: the ground
export function buildSectionTraces(group, sections, { origin, terrain, collars }) {
  clearSectionTraces(group);
  if (!(sections || []).length) return;
  const { x: ox, y: oy, z: oz } = origin;
  // without a terrain, flat at the median collar elevation: a median, because one outlying high collar (Harry's 1,468 m against
  // 1,077-1,160 m) lifted a max-based line ~300 m above the holes; flat, because following the nearest collars made it step
  const czs = (collars || []).map((c) => c.z).filter(Number.isFinite).sort((u, v) => u - v);
  const flatZ = czs.length ? czs[czs.length >> 1] : oz;
  const fences = fenceLabels(sections); // #1255
  const at = (x, y, z) => new THREE.Vector3(x - ox, z - oz, -(y - oy));
  sections.forEach((sct) => {
    const { ax, ay, bx, by } = sct;
    if (![ax, ay, bx, by].every(Number.isFinite)) return;
    const L = Math.hypot(bx - ax, by - ay);
    if (!(L > 0)) return;
    const ux = (bx - ax) / L, uy = (by - ay) / L, nx = -uy, ny = ux;
    const n = Math.max(2, Math.min(200, Math.ceil(L / 10)));
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const x = ax + (bx - ax) * (k / n), y = ay + (by - ay) * (k / n), g = terrain ? terrainGroundAt(terrain, x, y) : NaN;
      pts.push(at(x, y, Number.isFinite(g) ? g + 2 : flatZ + 2));
    }
    const tip = `${tr("Cross-section: {name}", { name: sct.name })}\n${Math.round(L).toLocaleString()} m, ${tr("azimuth {v}°", { v: Math.round(sct.azimuth ?? 0) })}`;
    const fence = fences.get(sct);
    const strokes = fence ? FENCE_STROKES : TRACE_STROKES;
    strokes.forEach((s) => group.add(screenLine(pts, s, tip)));
    // #1126 — end ticks toward the viewing side (n), and the labels at their tips
    const tickLen = Math.max(12, L * 0.05);
    const endB = `${sct.name}${/[\p{L}\p{N}]$/u.test(sct.name || "") ? "" : " "}′`; // a thin space before ′ after "39°"
    const ends = fence ? (fence.label ? [[ax, ay, pts[0].y + oz, fence.label]] : []) : [[ax, ay, pts[0].y + oz, sct.name], [bx, by, pts[n].y + oz, endB]];
    ends.forEach(([ex, ey, ez, label]) => {
      strokes.forEach((s) => group.add(screenLine([at(ex, ey, ez), at(ex + nx * tickLen, ey + ny * tickLen, ez)], s, tip)));
      const sp = makeTextSprite(label, { color: INK, bg: "rgba(255,255,255,0.9)" });
      sp.position.copy(at(ex + nx * tickLen * 1.15, ey + ny * tickLen * 1.15, ez));
      sp.center.set(0.5, 0.5);
      sp.renderOrder = 12;
      group.add(sp);
    });
  });
}
