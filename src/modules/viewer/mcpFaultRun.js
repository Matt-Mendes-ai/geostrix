// TASKS.csv #4053 (AI app access batch 4, Matt 2026-11-24: "let's keep adding AI tools to MCP", Modelling) — an AI app's build_fault: the Faults pane's own build (#4006 / #4013,
// flat sheeted planes; faultRun.js's buildFaultPlanes, the function its Build button runs) from the fault evidence the project holds in the holes, as the pane reads it
// (faultGather.js), with the pane's own verdicts when there is too little. One fault a call. Only the evidence a person would tick first is used by default (oriented fault picks,
// logged fault intervals, outcrop fault measurements); a mapped, drawn or section-string line is named in `evidence` and must then be the only one of its kind (the pane starts
// each line left out: lumping a map's faults into one surface would be wrong). The planes need no solver, so the answer comes at once. Each sheet is a surface of its own; the
// answer's `revert` takes out exactly those (generated surfaces are not in the undo history: the toast's Undo does it).
import { gatherFaultEvidence } from "./faultGather.js";
import { buildFaultPlanes, FAULT_CHECK_M } from "./faultRun.js";
import { faultSpec } from "../../lib/faultEvidence.js";
import { t as tr } from "../../lib/i18n.js";

const KINDS = ["pick", "logged", "outcrop", "mapped", "drawn", "string"];
const DEFAULT_KINDS = ["pick", "logged", "outcrop"];
const LINE_KINDS = new Set(["mapped", "drawn", "string"]);
const fail = (error) => ({ ok: false, error });
const line = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
const WHAT = { pick: "oriented fault picks", logged: "logged fault intervals", outcrop: "outcrop fault measurements", mapped: "mapped fault lines", drawn: "drawn fault lines", string: "section fault strings" };
const pts = (n) => (n === 1 ? "1 point" : `${n} points`);
const held = (items) => KINDS.map((k) => [k, items.filter((it) => it.kind === k).reduce((a, it) => a + it.points.length, 0)]).filter(([, n]) => n).map(([k, n]) => `${WHAT[k]}: ${pts(n)}`).join(", ") || "none";

// c: { store: { layers, terrain, sections }, faults: { traces (a getter), surfaceStructures, mapLayers, addSurface(mesh) -> id }, removeSurfaces(ids) }
// p: { name?, evidence?: [kind], extent?: "box" | "finite", margin_m?, sheet_gap_m?, dip?, dip_direction? }
export function faultAction(c, p = {}) {
  const f = c.faults || {}, s = c.store || {};
  const name = line(p.name) || "Fault 1"; // project data: English, the pane's own default name
  const items = gatherFaultEvidence({ traces: f.traces?.() || [], layers: s.layers || {}, surfaceStructures: f.surfaceStructures || [], mapLayers: f.mapLayers || [], sections: s.sections || [], terrain: s.terrain || null });
  if (!items.length) return fail("No fault evidence yet: the Faults pane reads oriented fault picks and logged fault intervals on the holes, outcrop fault measurements, and mapped, drawn or section fault lines. None is in this project.");
  const asked = Array.isArray(p.evidence) && p.evidence.length ? p.evidence.map((k) => String(k).toLowerCase()) : null;
  for (const k of asked || []) if (!KINDS.includes(k)) return fail(`Unknown evidence '${line(k).slice(0, 24)}'. The kinds are: ${KINDS.join(", ")}. This project holds: ${held(items)}.`);
  const wanted = asked || DEFAULT_KINDS;
  for (const k of wanted) { const n = items.filter((it) => it.kind === k).length; if (LINE_KINDS.has(k) && n > 1) return fail(`${n} ${WHAT[k]} are in this project: each line is likely its own fault, and one surface through all of them would be wrong. Build them one at a time in the Faults pane (each line gets its fault there).`); }
  const chosen = items.filter((it) => wanted.includes(it.kind));
  if (!chosen.length) return fail(`No ${wanted.map((k) => WHAT[k]).join(" or ")} in this project. It holds: ${held(items)}${asked ? "" : "; name 'evidence' to use another kind"}.`);
  const extent = p.extent === "finite" ? "finite" : "box";
  if (p.extent != null && p.extent !== "box" && p.extent !== "finite") return fail("'extent' is 'box' (through the model box, the pane's default) or 'finite' (the evidence plus a margin).");
  const marginM = Number.isFinite(p.margin_m) && p.margin_m >= 0 ? p.margin_m : 200, gapM = Number.isFinite(p.sheet_gap_m) && p.sheet_gap_m >= 1 ? p.sheet_gap_m : 25;
  const dip = Number.isFinite(p.dip) ? p.dip : null, dipDir = Number.isFinite(p.dip_direction) ? p.dip_direction : null;
  if ((dip != null) !== (dipDir != null)) return fail("Give 'dip' and 'dip_direction' together.");
  if (dip != null && (dip < 0 || dip > 90 || dipDir < 0 || dipDir > 360)) return fail("'dip' is 0 to 90 degrees and 'dip_direction' is 0 to 360.");
  const spec = faultSpec(chosen, { dip, dipDir });
  const fault = { i: 0, name, items: chosen, spec };
  const msgs = [];
  if (!spec.ok) return fail(line(spec.why === "no-orientation" ? `${tr("{name}: points on one line; give a dip.", { name })} Give 'dip' and 'dip_direction' (the pane's Dip and towards).` : tr("{name}: no evidence placed.", { name })));
  const { made } = buildFaultPlanes({ faults: [fault], extent, marginM, gapM, dips: { 0: { dip, dipDir } }, terrain: s.terrain || null, traces: f.traces?.() || [], addSurface: f.addSurface, msgs });
  if (!made.length) return fail(line(msgs.join(" ") || "Nothing was built."));
  const ids = made.map((m) => m.id).filter(Boolean);
  const kinds = {}; for (const it of chosen) kinds[it.kind] = (kinds[it.kind] || 0) + it.points.length;
  const poor = made.filter((m) => m.fit && m.fit.typicalMissM > FAULT_CHECK_M);
  const warnings = [...(spec.guess ? [tr("A guess: few points or one hole. Check it against the logs.")] : []),
    ...(poor.length ? [`${poor.length === 1 ? "This sheet doesn't" : `${poor.length} of ${made.length} sheets don't`} fit ${poor.length === 1 ? "its" : "their"} points well (typical miss over ${FAULT_CHECK_M} m, the Faults pane's own Check distance): ${poor.slice(0, 4).map((m) => `${m.name} misses its ${m.fit.points} points by ${m.fit.typicalMissM} m typical, ${m.fit.worstMissM} m worst`).join("; ")}. Do not present ${poor.length === 1 ? "it" : "them"} as a good fault: the evidence is more than one fault, or a folded one. Check ${poor.length === 1 ? "it" : "them"} against the logs in the Faults pane.`] : [])].map((w) => line(w).length < 300 ? line(w) : String(w).replace(/\s+/g, " ").trim().slice(0, 900));
  return {
    ok: true, changed: made.length === 1 ? "fault surface" : "fault surfaces", name, built: made.map((m) => m.name), ids, shape: "sheeted planes", extent, ...(extent === "finite" ? { margin_m: marginM } : {}),
    evidence: Object.entries(kinds).map(([k, n]) => `${WHAT[k]}: ${pts(n)}`),
    sheets: made.map((m) => ({ name: m.name, dip: m.dip, dip_direction: m.dipDir, ...(m.fit ? { points: m.fit.points, typical_miss_m: m.fit.typicalMissM, worst_miss_m: m.fit.worstMissM } : {}), ...(m.folded ? { folded: true } : {}) })),
    // the pane shows each sheet's miss and its Check (points over 10 m off); an AI app is told in words when a sheet does not fit its points: the typical miss over the pane's Check distance
    ...(warnings.length ? { warnings } : {}),
    notes: [...(extent === "box" ? ["Through the box a fault runs past its evidence: there it is extrapolated, not observed."] : []), ...msgs].map(line).slice(0, 8),
    revert: (st) => { try { (st?.removeSurfaces || c.removeSurfaces)?.(ids); } catch { /* already gone */ } },
  };
}
