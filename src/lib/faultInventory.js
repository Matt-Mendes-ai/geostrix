// TASKS.csv #4006 — the Faults pane gathers every fault tool in one place (a user could not find the fault tool GeoStrix has: the tools were
// spread over Structures, Strat. stack, Model from map, Explicit surface, Domains, Interpretation lines, the section window and the Stereonet).
// This counts the fault evidence a project holds, by kind, so each row of the pane can say what it would work from. Pure: no React, no store.

import { roleForLithology } from "./layers.js";

// words that make a map line, a structure type or a note read as a fault (Model from map's own test, #817)
export const FAULT_TEXT = /fault|thrust|shear/i;
// a logged code or note that reads as a fault zone: the lithology roles (fault, gouge...) and the structure-zone codes; a breccia alone is not a
// fault (a hydrothermal breccia is not), a fault breccia is
export const FAULT_CODE = /^(fl|flt|fz|fltz|fltbx|gge|gouge|shz|sz)$|fault|gouge|shear|mylonit|cataclas/i;

export const isFaultCode = (v) => { const s = String(v ?? "").trim(); return !!s && (FAULT_CODE.test(s) || roleForLithology(s) === "fault"); };

// line features of the ordinary map layers whose attributes mention a fault (interpretation lines are counted on their own)
export function mappedFaultFeatures(mapLayers) {
  const out = [];
  for (const l of mapLayers || []) {
    if (l?.interpretation || !Array.isArray(l?.features)) continue;
    for (const f of l.features) if ((f.parts?.length || f.geometry) && Object.values(f.attributes || {}).some((v) => FAULT_TEXT.test(String(v)))) out.push({ layer: l, feature: f });
  }
  return out;
}

// interpretation lines drawn as a fault or a shear (#3972 adds the level)
export function drawnFaultLines(mapLayers) {
  const out = [];
  for (const l of mapLayers || []) if (l?.interpretation) for (const f of l.features || []) if (/^(fault|shear)$/i.test(String(f.attributes?.type || ""))) out.push({ layer: l, feature: f });
  return out;
}

// -> { picks, pickTypes, outcrop, logged, mapped, drawn, sectionStrings, surfaces, inStack }
export function faultInventory({ faultCandidates = [], mapLayers = [], sections = [], implicitSurfaces = [], surfaceStructures = [], stackFaults = [], layers = {} } = {}) {
  const faultPicks = (faultCandidates || []).filter((c) => c.faultLike && !c.built); // built: a fault made in the Faults pane, not picks
  let logged = 0;
  for (const [key, rows] of Object.entries(layers || {})) if (key !== "structure" && Array.isArray(rows)) for (const r of rows) if (r && r.from != null && r.to != null && isFaultCode(r.value)) logged++;
  return {
    picks: faultPicks.reduce((n, c) => n + (c.n || 0), 0),
    pickTypes: new Set(faultPicks.map((c) => c.type)).size,
    outcrop: (surfaceStructures || []).reduce((n, s) => n + (s.rows || []).filter((r) => r.cls === "fault").length, 0),
    logged,
    mapped: mappedFaultFeatures(mapLayers).length,
    drawn: drawnFaultLines(mapLayers).length,
    sectionStrings: (sections || []).reduce((n, s) => n + (s.contacts || []).filter((c) => c.kind === "fault").length, 0),
    surfaces: (implicitSurfaces || []).filter((s) => s.type === "fault").length,
    inStack: (stackFaults || []).length,
  };
}
