import { t as tr } from "./i18n.js"; // TASKS.csv #786

// TASKS.csv #1116 — "12 polygons", "1 point": one whole phrase per geometry and count, so each language writes its own
// plural (the geometry name used to be glued to an English "s")
export function featureCountText(n, geomType) {
  const c = Number(n).toLocaleString();
  if (geomType === "point") return tr(n === 1 ? "{c} point" : "{c} points", { c });
  if (geomType === "polyline") return tr(n === 1 ? "{c} line" : "{c} lines", { c });
  if (geomType === "polygon") return tr(n === 1 ? "{c} polygon" : "{c} polygons", { c });
  return tr(n === 1 ? "{c} feature" : "{c} features", { c });
}
