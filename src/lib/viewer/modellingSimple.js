// TASKS.csv #2390 (review #2325, side 5's hand-off) and #2773 — the 3D Modelling ribbon's Simple set follows the project's data: Simple
// showed geoML models (an add-on not installed, a 554 MB download), Model from map (no map) and Stereonet (no picks), and hid Strat. stack,
// Litho groups and Modelling codes on a project logged as a stratigraphic pile. Advanced always shows every tool. Pure.
import { codesInUse, codeInfo } from "../modellingCodes.js";

export const STRAT_MIN_CODES = 3; // a pile to model together: three units or more

// litho: the lithology rows; mc: the modelling codes; groupOf(code) -> its litho group's name or null; defaultRole(name) -> the guessed role
// (lib/layers.js groupMcodeRole, as the modelling runs use); mapLayers; geomlInstalled: the add-on's status; structures: structure picks
// plus outcrop measurements. -> { strat, mapModel, geoml, stereonet }: true = shown in Simple.
export function modellingSimpleTools({ litho, mc, groupOf, defaultRole, mapLayers, geomlInstalled, structures }) {
  const strat = codesInUse(litho, mc, groupOf, defaultRole).filter((c) => codeInfo(mc, c.name, defaultRole).role === "stratigraphic").length >= STRAT_MIN_CODES;
  return {
    strat,
    mapModel: (mapLayers || []).some((l) => l?.geomType === "polygon"),
    geoml: !!geomlInstalled,
    stereonet: (structures || 0) > 0,
  };
}
