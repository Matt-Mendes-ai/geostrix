// TASKS.csv #4053 (AI app access batch 4) — guide_status: where the open project is in StrixViewer's guided modelling (Model > Start here, #4015 / #4031), read-only. The same three readers the
// guide card uses — guideFacts (what the project holds), guideStatus (each of the seven steps), suggestRoute (compute, draw or from the map, with the reason) — so an AI app and the card
// cannot disagree. It reads the project's tables and counts only (no desurvey, no sidecar, no network, nothing built) and works with 'Allow AI apps to make changes' off.
// The step's title, line and question are the card's own English words; each reason and row is worded as GeoStrix shows it (in the interface language).
import { guideFacts } from "./guide/guideFacts.js";
import { guideStatus, GUIDE_STEPS } from "./guide/guideSteps.js";
import { suggestRoute } from "./guide/suggestRoute.js";

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const ROUTE_WORD = { computed: "compute it from the logs", drawn: "draw it (sections or an explicit surface)", map: "build it from the geological map" };

// snap: the project's tables (App.jsx's snapshot: collars, survey, layers, assays, assayElements, mapLayers, terrain, sections, explicitSurfaces, generatedSurfaces, stratStack, modellingCodes,
// lithoGroups, surfaceStructures, voxelModels, rasters, modelGuide)
export function guideStatusTool(snap) {
  const facts = guideFacts(snap), guide = snap.modelGuide || {};
  const status = guideStatus(facts, guide), route = suggestRoute(facts);
  const userSkipped = new Set(guide.skipped || []);
  const steps = status.steps.map((x, i) => {
    const def = GUIDE_STEPS[i], offers = (x.asks?.rows || []).map((r) => clean(`${r.code ? `${r.code}: ` : ""}${r.text || ""}${r.done ? " (done)" : ""}`)).filter(Boolean).slice(0, 6);
    const state = x.state === "skipped" ? (userSkipped.has(x.id) ? "skipped" : "not_needed") : x.state; // done | next | waiting | not_needed | skipped (by you)
    return { n: i + 1, id: x.id, title: def.title, line: def.line, state, ...(x.reason ? { reason: clean(x.reason) } : {}), ...(offers.length ? { offers } : {}) };
  });
  const at = status.at, atStep = status.steps.find((x) => x.id === at), def = GUIDE_STEPS.find((x) => x.id === at);
  const routes = [...new Set([...(route.routes || [])])];
  // the question the card would ask on that step: only where the step asks one (step 4 only when there are routes to choose between, as the card does)
  const asks = atStep?.asks, askable = !!(def?.question && asks && (at !== "build" || routes.length > 1));
  const suggestion = askable ? (at === "build" ? route.route : typeof asks.suggest === "string" ? asks.suggest : null) : null;
  return {
    project_holds: { holes: facts.holes ?? 0, holes_with_a_lithology_log: facts.logged?.holes ?? 0, holes_with_contacts_between_rocks: facts.contacts?.holes ?? 0, map_units: facts.map?.units ?? 0, terrain: !!facts.terrain, fault_evidence: (facts.faults?.picks || 0) + (facts.faults?.outcrop || 0) + (facts.faults?.logged || 0) + (facts.faults?.mapped || 0) + (facts.faults?.drawn || 0) + (facts.faults?.sectionStrings || 0), assay_rows: facts.assays?.rows ?? 0, surfaces_built: (facts.built?.strat || 0) + (facts.built?.faults || 0) + (facts.built?.veins || 0) + (facts.built?.explicit || 0) + (facts.built?.bodies || 0) },
    steps,
    next_step: { n: GUIDE_STEPS.findIndex((x) => x.id === at) + 1, id: at, title: def?.title, state: steps.find((x) => x.id === at)?.state },
    suggested_route: route.route ? { route: route.route, what: ROUTE_WORD[route.route], reason: clean(route.reason), routes_open: routes } : { route: null, reason: clean(route.reason), routes_open: routes },
    ...(askable ? { question: { text: def.question, ...(suggestion ? { suggested_answer: suggestion === "computed" || suggestion === "drawn" || suggestion === "map" ? ROUTE_WORD[suggestion] : suggestion } : {}) } } : {}),
    ...(userSkipped.size ? { skipped_by_you: [...userSkipped] } : {}),
    note: "Read from the project's tables, nothing built. A step is 'done' when the project shows it (never a stored tick), 'next' when it can be done now, 'waiting' when it needs data or an earlier step, 'not_needed' when this data makes it irrelevant.",
  };
}
