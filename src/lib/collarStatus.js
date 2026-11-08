// TASKS.csv #2097 (review #2013, Woodjam) — a collar whose own status column says it is proposed / planned is not drilled ground:
// Woodjam's WJProp24_006 / 007 (status 'proposed', no survey, logs or assays) were counted as drilled by the planned-hole checks
// ('Same pad as ... WJProp24_006'), Undrilled zones ('10 drilled holes') and the evidence overlay. The status comes from a kept collar
// column (#1504: c.attrs) or a top-level field; only a status-like column name is read, so a 'proposed' word in a free-text note
// does not count.
const STATUS_KEY = /^(hole_?)?status$|^stage$|^hole_?stage$|^drill_?status$/i;
const PROPOSED = /^(proposed|planned|design(ed)?|prop|plan|pending|not drilled|undrilled)$/i;

export function isProposedCollar(c) {
  if (!c) return false;
  const fields = { ...(c.attrs || {}), ...(c.status != null ? { status: c.status } : {}) };
  for (const [k, v] of Object.entries(fields)) if (STATUS_KEY.test(k) && PROPOSED.test(String(v ?? "").trim())) return true;
  return false;
}

// the collars that are drilled holes (everything but those marked proposed) and how many were left out
export function drilledCollars(collars) {
  const out = [], left = [];
  for (const c of collars || []) (isProposedCollar(c) ? left : out).push(c);
  return { collars: out, proposed: left.map((c) => c.hole_id) };
}
