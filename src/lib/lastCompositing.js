// TASKS.csv #2224 (review #2174, WA lode gold) — Estimation and the grade shell composite the raw assays themselves (the same routine as
// Geochem > Compositing, compositeDownhole) and never referred to that tool: a geologist who built 1 m capped composites there got 2 m
// uncapped ones here unless they retyped every setting. Geochem > Compositing now leaves its settings here (for this window and this
// project only: they are not saved in the project file), and the two tools offer them.
let last = null;

// token: the store's getProjectToken() (the open tab and its load); s: { symbol, length, minCoverage (0-1), cap (number or null), domain (a label or null) }
export function rememberCompositing(token, s) {
  last = token && s && s.symbol && s.length > 0 ? { ...s, token } : null;
}

// isSameProject: the store's isSameProject(token) -> the settings, or null (none yet, another project, another element)
export function lastCompositing(isSameProject, symbol) {
  if (!last || !isSameProject?.(last.token)) return null;
  return symbol && last.symbol !== symbol ? null : last;
}

// does a tool's own setting already match? (cap: null / NaN / blank = no cap)
const capOf = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) || !(Number(v) > 0) ? null : Number(v));
export function sameCompositing(a, { length, minCoverage, cap }) {
  return !!a && Math.abs(a.length - Number(length)) < 1e-9 && Math.abs(a.minCoverage - Number(minCoverage)) < 1e-9 && capOf(a.cap) === capOf(cap);
}

export function forgetCompositing() { last = null; } // tests
