// TASKS.csv #4093 (AI app access batch 5, piece C) — an AI app's anomaly_score runs THE Multivariate anomaly score dialog (McdAnomalyPanel, #1999), as a person would: Geochem opens it, the samples, the
// sampling type and the elements the call names are put in it (its own defaults, read from the data, unless named), its own Score and Write the score are pressed, and the dialog's numbers are read back.
// It writes ONE new calculated element (a column on the samples; an existing column is never replaced: the dialog refuses a name in use, and so does this). The score ranks how unusual each sample's
// composition is, not a probability of mineralization: the answer says so. The answer's `revert` (mcpActions.js) takes the column out again.
//   g(): the dialog's state, setters and its run / write, read afresh (the panel passes a getter over a ref).
import { useRef } from "react";
import { useModuleAction } from "../lib/menuRequests.js";

const fail = (error) => ({ ok: false, error });
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lower = (v) => String(v ?? "").trim().toLowerCase();
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

// p: { source?: 'assays' | 'surface', medium?, elements?, name? } -> { ok, changed: 'calculated element', name, source, ... } | { ok: false, error }
export async function anomalyAction(g, p, { sleep = realSleep, runMs = 9 * 60000 } = {}) {
  let s = g();
  for (let w = 0; !s && w < 15000; w += 100) { await sleep(100); s = g(); }
  if (!s) return fail("The Multivariate anomaly score dialog did not open in GeoStrix. Try again.");
  if (s.busy) return fail("A score is already being computed in GeoStrix: one at a time.");
  const want = p?.source == null ? null : lower(p.source);
  if (want && want !== "assays" && want !== "surface") return fail("'source' is 'assays' (the lab rows of the drill assays) or 'surface' (the surface samples).");
  if (want === "assays" && !s.hasAssays) return fail("This project has no drill assays to score.");
  if (want === "surface" && !s.hasSurface) return fail("This project has no surface samples to score.");
  if (want && s.source !== want) { s.setSource(want); s.setPicked(null); s.reset(); await sleep(300); s = g(); }
  if (p?.medium != null) {
    if (s.source !== "surface") return fail("'medium' is for the surface samples.");
    const all = lower(p.medium) === "all";
    const m = all ? s.ALL : s.media.find((x) => lower(x) === lower(p.medium));
    if (!m) return fail(`No sampling type '${String(p.medium).slice(0, 40)}'. The types: ${s.media.slice(0, 12).join(", ")} (or 'all').`);
    s.setMedium(m); s.setPicked(null); s.reset(); await sleep(300); s = g();
  }
  if (p?.elements != null) {
    const have = s.elements.filter((e) => !e.calculated).map((e) => e.symbol);
    const want2 = (Array.isArray(p.elements) ? p.elements : []).map(String);
    const syms = want2.map((x) => have.find((h) => lower(h) === lower(x)));
    if (syms.some((x) => !x)) return fail(`Not elements of these samples: ${want2.filter((_, i) => !syms[i]).slice(0, 6).join(", ")}. The elements: ${have.slice(0, 24).join(", ")}.`);
    s.setPicked([...new Set(syms)]); s.reset(); await sleep(300); s = g();
  }
  if (s.chosen.length < 3) return fail(`The score needs at least three elements; ${s.chosen.length === 0 ? "none" : "only " + s.chosen.join(", ")} qualify by the dialog's defaults (a value on 90 % of the samples, few below detection). Name them in 'elements'.`);
  if (s.pool.length < 5) return fail(`Only ${s.pool.length} sample(s) to score: too few for a robust multivariate score.`);
  // the column's name: the dialog's rule (letters, digits, underscores; not one in use)
  let name = p?.name != null ? String(p.name).trim() : s.name;
  if (p?.name != null) {
    if (!NAME.test(name)) return fail("'name' starts with a letter or underscore and holds letters, digits and underscores.");
    if (s.elements.some((e) => e.symbol === name)) return fail(`'${name}' already exists as a column: GeoStrix does not replace it. Choose another name.`);
  } else if (s.elements.some((e) => e.symbol === name)) {
    for (let i = 2; i < 100 && s.elements.some((e) => e.symbol === name); i++) name = `${s.name}_${i}`;
  }
  if (name !== s.name) { s.setName(name); await sleep(200); s = g(); }
  s.run();
  let done = null;
  for (let w = 0; w < runMs; w += 200) {
    await sleep(200); s = g();
    if (s.err) return fail(String(s.err).slice(0, 300));
    if (s.res) { done = s; break; }
  }
  if (!done) return fail("The score is still being computed in GeoStrix: its progress is in the dialog.");
  await sleep(200); s = g(); // the Write button reads the result: wait for the render that has it
  if (!s.res || !s.validName) return fail("The score could not be written: its column name is not valid.");
  const top = s.top.slice(0, 3).map(([r, v]) => ({ sample: String(s.where(r)).slice(0, 60), score: Number(v.toFixed(2)) }));
  const out = { ok: true, changed: "calculated element", name, source: s.source, ...(s.source === "surface" && s.medium !== s.ALL ? { medium: s.medium } : {}), samples_scored: s.res.used, of: s.pool.length, elements: [...s.chosen], above_line: s.res.flagged, line: Number(s.res.cutoff.toFixed(2)), most_unusual: top,
    note: "The score ranks how unusual each sample's whole composition is: it is not a probability of mineralization." };
  s.write();
  return out;
}

export function useMcpAnomaly(getState) {
  const ref = useRef(null);
  ref.current = getState();
  useModuleAction(["mcp-mcd-run"], async (_a, p) => {
    const reply = (r) => { try { p?.reply?.(r); } catch { /* gone */ } };
    try { reply(await anomalyAction(() => ref.current, p)); } catch { reply(fail("The score could not be made.")); }
  });
}
