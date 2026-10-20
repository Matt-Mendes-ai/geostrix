// TASKS.csv #637 — an OMF file's elements turned into GeoStrix project objects, shared by the Geophysics tab's
// "Import OMF" and the Woodjam sample project (which ships the 2023 ZTEM inversion as OMF). Moved unchanged from
// GeophysicsModule.importOmf: points / lines / surfaces become omfObjects; volumes (tensor-grid block models) become
// voxel models through omfVolumeToCells, coarsened to `maxCells`, with the file's own colour legend when it has one.
import { parseOMF, omfVolumeToCells } from "./omf.js";
import { cellValueRange } from "./voxel.js";
import { logStops, SEQUENTIAL_ANCHORS } from "./inversion.js";

// attribute: the cell attribute to show when a volume carries several (e.g. two inversion iterations); null = the first.
export async function omfToProjectObjects(arrayBuffer, maxCells, { attribute = null } = {}) {
  const project = await parseOMF(arrayBuffer);
  const omfObjects = [], voxelModels = [], skipped = [], notes = [];
  for (const el of project.elements) {
    if (el.kind === "skipped") { skipped.push(`${el.name} (${el.reason})`); continue; }
    if (el.kind === "points" || el.kind === "lines" || el.kind === "surface") {
      const hex = el.color ? `#${el.color.slice(0, 3).map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}` : undefined;
      omfObjects.push({ name: el.name, description: el.description, kind: el.kind, color: hex, origin: el.origin, vertices: el.vertices, segments: el.segments, triangles: el.triangles, attributes: el.attributes });
    } else if (el.kind === "volume") {
      // #159 — a large real block model is coarsened (block-averaged) to the cell budget so it can't hang the 3D view
      const pick = attribute && (el.attributes || []).some((a) => a.name === attribute) ? attribute : null;
      const { cells, attrName, availableAttrs, coarsenNote, colormap, air } = omfVolumeToCells(el, pick, maxCells);
      if (!cells.length) {
        skipped.push(`${el.name} (volume has no numeric cell attribute to render${availableAttrs?.length ? ` — found: ${availableAttrs.join(", ")}, none usable` : ""})`);
        continue;
      }
      const { min, max } = cellValueRange(cells);
      // the file's own ScalarColormap as {value, color} stops over its limits; else log stops for a wide positive range
      let colorInit = {};
      if (colormap?.gradient?.length) {
        const g = colormap.gradient;
        const [lo, hi] = Array.isArray(colormap.limits) && colormap.limits.length === 2 ? colormap.limits : [min, max];
        colorInit = { colorMode: "continuous", stops: g.map((color, i) => ({ value: lo + (g.length > 1 ? (i / (g.length - 1)) * (hi - lo) : 0), color })) };
      } else if (min > 0 && max / min >= 100) {
        colorInit = { colorMode: "continuous", stops: logStops(min, max, SEQUENTIAL_ANCHORS) }; // #482, as #481
      }
      if (air?.count) notes.push(`${el.name}: ${air.count.toLocaleString()} cells at ${Number(air.value).toPrecision(3)} (the tiny value this model uses for air above the ground) treated as air (no data).`);
      voxelModels.push({ name: `${el.name} (${attrName})`, source: "omf", cells, min, max, ...colorInit });
      if (coarsenNote) notes.push(`${el.name}: ${coarsenNote}`);
    }
  }
  return { omfObjects, voxelModels, skipped, notes };
}
