// TASKS.csv #3162 — the GemPy engine's own bounds on one model (python-sidecar/app/main.py ImplicitModelRequest: surfaces max_length,
// faults max_length), from the security hardening (fe73b024). The app had no matching check: a 13-unit Model from map stack (Mount
// Raymond) went to the engine and came back as its raw validation text. Raised to 16 units (Mount Raymond's map has 13 tops), not 24:
// an erosional stack is one solve per unit, and a 24-unit test (Mount Raymond's tops split, 1,426 points) passed 40 minutes against 16
// at 12 units on a busy CPU (its splits also added orientations, so that overstates it).
// Keep these equal to main.py's (test/gempyLimits3162 reads both).
export const GEMPY_MAX_SURFACES = 16;
export const GEMPY_MAX_FAULTS = 6;

// the engine's list-length refusal ("surfaces: List should have at most 12 items after validation, not 13") in words; other text unchanged.
// The runs check the counts first; this is for an engine with other bounds (an older or newer sidecar).
export function plainEngineError(text) {
  if (typeof text !== "string") return text;
  return text.replace(/(?:request\.)?(surfaces|faults)(?:\.\d+)?: List should have at most (\d+) items? after validation, not (\d+)/g,
    (_, what, max, n) => `The modelling engine takes at most ${max} ${what === "faults" ? "faults" : "units"} in one model, and this one has ${n}`);
}

// TASKS.csv #3162 — Model from map samples the map's contacts every MAP_CONTACT_STEP_M on the terrain. On Mount Raymond's 24 x 30 km sheet
// that gave 15,334 points, and GemPy's memory grows with the square of the points (the interpolation's matrix): the run passed 13.5 GB
// in five minutes without finishing. Over MAP_POINT_BUDGET the step is lengthened to keep about that many points (on Mount Raymond about
// 95 m, finer than its 250 m model cells); a small map keeps the 25 m step. Measured live at the budget (Mount Raymond, 4,016 points,
// 262 orientations, 13 tops): the engine's peak 3.7 GB, so a 16 GB computer has room to spare. Its TIME on a sheet that size is the
// field's evaluation, not the points' memory: over the app's 15 minutes on a busy CPU (see the TASKS row).
export const MAP_CONTACT_STEP_M = 25;
export const MAP_POINT_BUDGET = 4000;
// lengthM: the summed length of the contact lines in use, times the tops each gives points to -> the step (m)
export const mapContactStep = (lengthM, budget = MAP_POINT_BUDGET) => (lengthM / MAP_CONTACT_STEP_M > budget ? Math.ceil(lengthM / budget) : MAP_CONTACT_STEP_M);

// specs: the run's surfaces ({ fault }) -> null, or { surfaces, faults, maxSurfaces, maxFaults, overSurfaces, overFaults }
export function gempyLimitCheck(specs) {
  let surfaces = 0, faults = 0;
  for (const s of specs || []) if (s?.fault) faults++; else surfaces++;
  const overSurfaces = surfaces > GEMPY_MAX_SURFACES, overFaults = faults > GEMPY_MAX_FAULTS;
  return overSurfaces || overFaults ? { surfaces, faults, maxSurfaces: GEMPY_MAX_SURFACES, maxFaults: GEMPY_MAX_FAULTS, overSurfaces, overFaults } : null;
}
