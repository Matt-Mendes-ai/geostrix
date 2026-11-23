// TASKS.csv #4032 (#4015 guided modelling, row 2: the guide's saved place; docs/ideas/guided-modelling-design.md section 2) — the project field
// modelGuide = { route, skipped, at }: the route chosen in step 4 (null until chosen), the step ids the person skipped, and the step the guide was
// last on (null: the first step neither done nor skipped). Track "view" (projectFields.js, v33): saved, per tab, autosaved with the project, and
// changing it is not an edit (no unsaved prompt, no Undo step). Done states are never stored: the guide reads them from the project each time.
// Step ids are the guide's own (GUIDE_STEPS, lib/guide/guideSteps.js); this file keeps any short id so it never depends on that list.
export const GUIDE_ROUTES = ["computed", "drawn", "map"]; // design section 1, step 4: Computed / Drawn / From the map
const MAX_ID = 40, MAX_SKIPPED = 20;

export const emptyGuide = () => ({ route: null, skipped: [], at: null });

const id = (v) => (typeof v === "string" && v && v.length <= MAX_ID ? v : null);

// a stored guide as the app holds it; a file before v33, or a damaged value: an empty guide (the guide then starts at its first open step)
export function guideFromFile(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return emptyGuide();
  const skipped = Array.isArray(v.skipped) ? [...new Set(v.skipped.map(id).filter(Boolean))].slice(0, MAX_SKIPPED) : [];
  return { route: GUIDE_ROUTES.includes(v.route) ? v.route : null, skipped, at: id(v.at) };
}

export const guideIsEmpty = (g) => !g || (!g.route && !(g.skipped || []).length && !g.at);

// pure edits, each returning the same object when nothing changes (so the store sees no change)
export function withRoute(g, route) {
  const cur = g || emptyGuide(), next = GUIDE_ROUTES.includes(route) ? route : null;
  return cur.route === next ? cur : { ...emptyGuide(), ...cur, route: next };
}
export function withSkipped(g, stepId, skip = true) {
  const cur = g || emptyGuide(), s = id(stepId), list = cur.skipped || [];
  if (!s || list.includes(s) === !!skip) return cur;
  return { ...emptyGuide(), ...cur, skipped: skip ? [...list, s].slice(-MAX_SKIPPED) : list.filter((x) => x !== s) };
}
export function withAt(g, stepId) {
  const cur = g || emptyGuide(), next = stepId == null ? null : id(stepId);
  return cur.at === next ? cur : { ...emptyGuide(), ...cur, at: next };
}

// the store's setters over the one field: setGuideRoute(route), setGuideSkipped(stepId, skip), setGuideAt(stepId)
export function guideSetters(setModelGuide) {
  return {
    setGuideRoute: (route) => setModelGuide((g) => withRoute(g, route)),
    setGuideSkipped: (stepId, skip = true) => setModelGuide((g) => withSkipped(g, stepId, skip)),
    setGuideAt: (stepId) => setModelGuide((g) => withAt(g, stepId)),
  };
}
