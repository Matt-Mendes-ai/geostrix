// Moved out of ViewerModule.jsx (TASKS.csv #1084 size cap) for #1697; unchanged.
import { LAYER_META } from "../layers.js";

// TASKS.csv #1891 — what a pick in the view landed on, in a few words: the object's tip (its first line) or the kind of group it sits in
const HIT_KINDS = { voxels: "a block model", terrain: "the terrain", implicit: "a generated surface", rasters: "a raster", omf: "an OMF object", planned: "a planned hole", mapLayers: "a map layer", sectionImages: "a section image", surface_samples: "a surface sample", assay: "an assay interval" };
export function hitLabel(obj) {
  let kind = null;
  for (let n = obj; n; n = n.parent) {
    const tip = n.userData?.tip;
    if (typeof tip === "string" && tip.trim()) { const line = tip.split("\n")[0].trim(); if (line.length <= 60) return line; const cut = line.lastIndexOf(" ", 60); return `${line.slice(0, cut > 20 ? cut : 60)}…`; } // cut at a word (#1943)
    if (n.name && n.parent?.name === "root") kind = HIT_KINDS[n.name] || (LAYER_META[n.name] ? "a drillhole" : n.name);
  }
  return kind;
}
