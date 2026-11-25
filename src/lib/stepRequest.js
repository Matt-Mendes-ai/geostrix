// TASKS.csv #4070 — a step pane's step asked for from outside it (the Guide's doors, #4033; an AI app pressing a pane's main button, #4053):
// requestStep("mapmodel", "data") opens that step now, or when the pane next mounts. Plain JS so a non-React module (useMcpMapModel.js) can ask.
const asked = new Map();
export const STEP_EVENT = "geostrix-step-request";

export function requestStep(id, key) {
  asked.set(id, key);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(STEP_EVENT, { detail: { id } }));
}

// the step asked for this pane, once (null when none)
export function takeStep(id) {
  if (!asked.has(id)) return null;
  const k = asked.get(id);
  asked.delete(id);
  return k;
}
