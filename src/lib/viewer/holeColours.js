// TASKS.csv #1504 (review #1497, Lawyers) — holes coloured by a field of the collar file (year, drill type, prospect, status): the
// collar marker and the trace line of each hole take its value's colour, and the legend lists them. A pass over the built scene,
// never a rebuild: it runs again after each rebuild (ViewerModule keys it on tracesSeq), and clearing the field puts the shared
// collar material and the grey trace back.
import * as THREE from "three";
import { CATEGORICAL_SAFE_COLORS } from "../layers.js";
import { pickOnlyMaterial, syncBatchedInstances, eachLayerMember } from "./layerBatches.js";

export const NO_VALUE_COLOUR = "#9aa3ad";
export const TRACE_GREY = 0x445064;

// -> { field, colourOf(collar) -> hex, items: [[value, hex, count]] } or null (no field / no collar has it)
export function holeColourScheme(collars, field) {
  if (!field) return null;
  const counts = new Map();
  let missing = 0;
  for (const c of collars || []) { const v = String(c?.attrs?.[field] ?? "").trim(); if (v) counts.set(v, (counts.get(v) || 0) + 1); else missing++; }
  if (!counts.size) return null;
  const values = [...counts.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const hex = new Map(values.map((v, i) => [v, CATEGORICAL_SAFE_COLORS[i % CATEGORICAL_SAFE_COLORS.length]]));
  return {
    field,
    colourOf: (c) => hex.get(String(c?.attrs?.[field] ?? "").trim()) || NO_VALUE_COLOUR,
    items: [...values.map((v) => [v, hex.get(v), counts.get(v)]), ...(missing ? [[null, NO_VALUE_COLOUR, missing]] : [])],
  };
}

// The holes group's (the litho group's before #2319) collar markers (userData.collar) and trace lines (Line with userData.holeId). A batched marker (more than ~24
// holes, layerBatches.js) is not in the group's children (#1540: reached through its batch, eachLayerMember) and shares its
// pick-only material's colour with every other: it gets its own, and its batch is re-synced.
export function applyHoleColours(group, scheme, { collarMaterial, collarsById } = {}) {
  if (!group) return 0;
  const mats = new Map(), touched = new Set();
  const matFor = (hex) => mats.get(hex) || mats.set(hex, new THREE.MeshBasicMaterial({ color: hex })).get(hex);
  let n = 0;
  eachLayerMember(group, (ch) => {
    if (ch.userData?.collar) {
      const c = collarsById?.get(String(ch.userData.collar.hole_id)) || ch.userData.collar;
      const hex = scheme ? scheme.colourOf(c) : null;
      if (ch.userData.batched) {
        ch.material = pickOnlyMaterial(hex ? { ...ch.material, color: new THREE.Color(hex) } : (collarMaterial || ch.material));
        touched.add(ch);
      } else ch.material = hex ? matFor(hex) : (collarMaterial || ch.material);
      n++;
    } else if (ch.isLine && ch.userData?.holeId != null && ch.material?.color) {
      const c = collarsById?.get(String(ch.userData.holeId));
      const hex = scheme && c ? scheme.colourOf(c) : null;
      ch.material.color.set(hex || TRACE_GREY);
      ch.material.opacity = hex ? 0.95 : 0.5;
      ch.material.needsUpdate = true;
    }
  });
  if (touched.size) for (const inst of group.children) if (inst.isInstancedMesh && inst.userData?.batchMembers?.some((m) => touched.has(m))) syncBatchedInstances(inst);
  return n;
}

// the legend section: "Holes by {field}", one row per value (with its hole count), "(no value)" last
export function holeColourLegendGroup(scheme, label, noValueLabel) {
  if (!scheme) return null;
  return { key: "hole_colour", label, items: scheme.items.map(([v, hex, n]) => [`${v == null ? noValueLabel : v} (${n})`, hex]) };
}
