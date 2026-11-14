// TASKS.csv #3266 (review #3195, Galore Creek) — 167 interval measurements with both alpha and beta (34 fault / shear zones of a custom
// 'Fault structures' layer, 133 veins of the Veins layer) were never oriented: the Stereonet counted the faults as 'alpha only (no beta)' and
// did not read the veins at all, so the fault log could not be used as faults. The layer picks with a beta are oriented as the structure
// file's alpha / beta picks are: the hole's surveyed attitude at the interval's mid-depth, and the reference line the project's structure
// picks were imported with (the majority, when both; the bottom-of-hole line when the project has none, said as `refAssumed`).
// -> { picks: every layer pick (oriented or alpha-only), oriented: those oriented, ref, refAssumed }
import { customAlphaPicks, orientPairedPicks } from "./alphaPicks.js";
import { orientFromAlphaBeta, betaReferenceCounts } from "./coreOrientation.js";
import { surveyAzimuthDipAt } from "./desurvey.js";

export function orientedLayerPicks({ structure, customLayers, veins, collars, survey }) {
  const raw = customAlphaPicks(customLayers, veins);
  const b = betaReferenceCounts(structure || []), ref = b.top > b.bottom ? "top" : "bottom", refAssumed = b.top + b.bottom === 0;
  if (!raw.some((p) => Number.isFinite(p.beta))) return { picks: raw, oriented: [], ref, refAssumed };
  const collarById = new Map((collars || []).map((c) => [c.hole_id, c])), byHole = new Map();
  for (const s of survey || []) { if (!byHole.has(s.hole_id)) byHole.set(s.hole_id, []); byHole.get(s.hole_id).push(s); }
  const att = (p) => { const c = collarById.get(p.hole_id); return c ? surveyAzimuthDipAt(c, byHole.get(p.hole_id) || [], Number(p.depth)) : null; };
  const picks = orientPairedPicks(raw, att, ref, orientFromAlphaBeta).map((p) => (p.alphaOnly ? p : { ...p, refAssumed }));
  return { picks, oriented: picks.filter((p) => !p.alphaOnly), ref, refAssumed };
}
