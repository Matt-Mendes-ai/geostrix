// TASKS.csv #4035 (guided modelling row 5) — the guide card's doors: what each step's `act` (lib/guide/guideSteps.js) and each "Next" after a
// failure (lib/guide/guideFailures.js nextFor) does. Pure apart from the calls it is given (env), so a test drives every door with a fake store and
// api. Nothing here runs a model: a door opens a pane filled in (lib/guide/paneIntent.js, #4033), opens a guided card (the "Build it for me"
// engines, guidedTools.js), sets what a button in the pane would set (one Undo step), or opens a dialog. Opening a pane shrinks the guide to its bar.
import { setPaneIntent } from "../../../lib/guide/paneIntent.js";
import { requestModuleAction } from "../../../lib/menuRequests.js";
import { setLeftOut } from "../../../lib/modellingCodes.js";

// every act's button: an existing label (tr() keys said where they are drawn)
export const ACT_LABELS = {
  qc: "Data QC", "add-data": "Add data", terrain: "Terrain", settings: "Model settings", mcodes: "Modelling codes", stack: "Strat. stack",
  "role-overburden": "Cover and weathering", "role-intrusion": "Modelling codes", "leave-out": "Leave out of the model", "add-all": "Add all units",
  sort: "Sort by the holes", section: "Correlation", cut: "Strat. stack", explicit: "Explicit surface", mapmodel: "Model from map", faults: "Faults",
  "draw-fault": "Faults", "stack-faults": "Faults that offset the stack", vein: "Veins and dykes", "result-block": "Build the blocks",
  alteration: "Alteration halo", grade: "Grade model", "draw-section": "Draw a section", layout: "Layout", cover: "Cover and weathering",
  layers: "Rock layers", bodies: "Intrusions and bodies",
};
// the route cards' titles (step 4)
export const ROUTE_LABELS = { computed: "Compute", drawn: "Draw", map: "Model from map" };

// env: { api (guidedApi), store, setTool (open a guided card), toBar (shrink the guide), intent = setPaneIntent, action = requestModuleAction }
// arg: what the act needs ({ codes, unit, order, asks })
export function runAct(act, arg, env) {
  const { api, store, setTool, toBar } = env, intent = env.intent || setPaneIntent, action = env.action || requestModuleAction;
  const pane = (p, extra) => { if (extra) intent({ pane: p, ...extra }); api.openPane(p, true); toBar(); };
  const a = arg || {};
  switch (act) {
    case "qc": case "data-qc": return api.openQc();
    case "add-data": return action("open-start-dialog");
    case "terrain": store.goToModule("maps"); return action("maps-terrain"); // the Terrain pane asks before any download
    case "settings": return pane("settings", a.asks ? { suggest: a.asks.suggest, group: a.asks.group, resolution: a.asks.resolution } : null);
    case "mcodes": case "role-intrusion": return pane("mcodes");
    case "stack": case "cut": case "cut-down": case "sort-by-holes": return pane("stack");
    case "add-all": return pane("stack", { addAll: { mode: "share" } }); // the logged codes with at least 1 % of the metres, as step 3 counted
    case "stack-faults": return pane("stack", { faults: true });
    case "section": return pane("correlation");
    case "explicit": return pane("explicit", a.unit ? { unit: a.unit } : null);
    case "draw-instead": store.setGuideRoute("drawn"); return pane("explicit", a.unit ? { unit: a.unit } : null);
    case "mapmodel": case "pick-map-units": case "pick-faults": return pane("mapmodel");
    case "faults": case "draw-fault": return pane("faults");
    case "sort": case "use-holes-order": return a.order?.length ? api.setStackUnits(a.order) : pane("stack");
    case "leave-out": { const names = a.codes || (a.unit ? [a.unit] : []); return names.length ? store.setModellingCodes((mc) => setLeftOut(mc, names, true)) : undefined; }
    case "result-block": api.openPane(null, true); api.showResult(); return toBar();
    case "draw-section": toBar(); return action("draw-section");
    case "layout": return store.goToModule("layout");
    case "role-overburden": case "cover": return setTool("cover");
    case "vein": return setTool("veins");
    case "layers": return setTool(act, a.units); // the card starts on the Strat. stack's units when it has two or more
    case "alteration": case "grade": case "bodies": return setTool(act);
    default: return undefined;
  }
}

// the unit an Explicit surface starts on (#4033: a unit with tops): the second rock in a steady order (the first lies under the cover, its top
// is the cover's base), else the first, else the cover itself (its base is seeded)
export function explicitUnit(facts) {
  const s = facts.order.steady;
  return s[1] || s[0] || facts.cover?.unit || null;
}
