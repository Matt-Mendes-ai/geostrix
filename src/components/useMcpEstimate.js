// TASKS.csv #3932 batch 3 (Matt, 2026-11-22: "a grade block model tool (Grade estimation through the switch)") — an AI app's build_grade_estimate runs THIS
// dialog, as a person would: StrixViewer opens it ("mcp-estimate-open"), the element is chosen, the dialog's own defaults from the data settle (the cell, the
// search, the budget's reach, the unsampled metres' reading, what it kept from the last run in this project), Run, then Add to project. Nothing is chosen
// here: a run the dialog would not start (over the block budget, a choice it still needs, a variogram question) is refused with the dialog's reason and the
// dialog stays open for the user. The answer carries the result's lines as the dialog shows them and its "Not a resource estimate." paragraph word for word.
//   g(): the dialog's state and functions, read afresh (GradeEstimationModal passes a getter); the result panel and the paragraph are read from the page
//   (data-mcp="estimate-result" / "estimate-not-resource"), the words the user sees.
import { useRef } from "react";
import { useModuleAction } from "../lib/menuRequests.js";

const fail = (error) => ({ ok: false, error });
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const SKIP = "button, input, select, details, svg, canvas, table, textarea";
// the result panel's lines as shown: each child's text, line by line as drawn (innerText; textContent ran 'Data support' and '19,266 interpolated' together),
// without the controls (the name box, Add, Grade-tonnage) and without the estimate check's own block (its swath plots and figures: the dialog shows them)
const textOf = (el) => (typeof el.innerText === "string" ? el.innerText : el.textContent || "");
export function resultLines(root, max = 18) {
  if (!root) return [];
  const out = [];
  const take = (el) => { for (const l of textOf(el).split(/\n+/)) { const t = clean(l); if (t) out.push(t); } };
  for (const el of root.children) {
    if (el.matches?.("[data-estimate-check]") || el.querySelector?.("[data-estimate-check]")) continue;
    if (el.matches?.(SKIP) || el.querySelector?.(SKIP)) {
      for (const c of el.children) if (!(c.matches?.(SKIP) || c.querySelector?.(SKIP))) take(c);
      continue;
    }
    take(el);
  }
  return out.map((t) => t.slice(0, 300)).slice(0, max);
}

// p: { element }. -> { ok, changed, name, id, ids, element, method, blocks, lines, not_a_resource_estimate, revert } | { ok: false, error }
export async function estimateAction(g, p, { sleep = realSleep, settleMs = 30000, runMs = 9 * 60000, doc = typeof document !== "undefined" ? document : null } = {}) {
  const want = clean(p?.element).toLowerCase();
  let s = g();
  if (s.running) return fail("Grade estimation is already running in GeoStrix: one at a time. Try again when it has finished.");
  if (s.sourceKey !== "assay") s.setSourceKey("assay"); // an element of the assays, not a log the dialog was last left on
  for (let w = 0; g().sourceKey !== "assay"; w += 50) { if (w > 3000) return fail("GeoStrix did not switch Grade estimation to the assays. Try again."); await sleep(50); }
  s = g();
  const el = s.symbols.find((x) => String(x).toLowerCase() === want);
  if (!el) return fail(`No element '${clean(p?.element).slice(0, 32)}' with lab values in this project's assays. Available: ${s.symbols.slice(0, 40).join(", ") || "none"}.`);
  if (s.symbol !== el) s.setSymbol(el);
  // the dialog's defaults settle: the element is in, the reach of the grid is worked out, and nothing changes for a moment
  let calm = 0, last = null;
  for (let w = 0; ; w += 100) {
    const n = g(), sig = `${n.symbol}|${n.reachPending}|${n.overLimit}|${n.unsReady}|${n.cellLabel}|${n.searchRadius}`;
    calm = sig === last && n.symbol === el && !n.reachPending ? calm + 100 : 0; last = sig;
    if (calm >= 600) break;
    if (w > settleMs) return fail("Grade estimation did not settle on its settings (the grid's reach is still being worked out). Try again.");
    await sleep(100);
  }
  s = g();
  if (!s.bounds) return fail("Grade estimation has no grid: no loaded collar has a recorded length or survey data, so the grid has no depth to reach. Import hole lengths or surveys first.");
  if (s.overLimit) return fail(`The grid is over the ${Number(s.blockBudget).toLocaleString("en-US")}-block budget at the dialog's cell size: change the cell size or the cell budget in the Grade estimation dialog open in GeoStrix, then ask again.`);
  if (!s.unsReady) return fail("Grade estimation needs a choice first: how the unsampled metres inside the sampled holes are read. Make it in the dialog open in GeoStrix, then ask again.");
  const prev = s.result;
  s.run();
  await sleep(200); // run() clears the last result and error: let that render before reading them
  let saw = false;
  for (let w = 0; ; w += 100) {
    const n = g();
    if (n.running) saw = true;
    else if (saw || n.error || n.weakFitAsk || (n.result && n.result !== prev)) break;
    if (w > runMs) return fail("Grade estimation is still running in GeoStrix; its progress is in the dialog.");
    await sleep(100);
  }
  await sleep(150); // the result panel renders
  s = g();
  if (s.weakFitAsk) return fail("The variogram fitted to these composites is weak, and the dialog asks how to go on (inverse distance, or krige anyway): answer it in GeoStrix.");
  if (s.error) return fail(clean(s.error).slice(0, 400));
  if (!s.result) return fail("Nothing was estimated.");
  const lines = resultLines(doc?.querySelector('[data-mcp="estimate-result"]'));
  const notResource = clean(doc?.querySelector('[data-mcp="estimate-not-resource"]')?.textContent);
  if (!(s.result.blocksEstimated > 0)) return fail(["No block was estimated.", ...lines.slice(0, 6)].join(" ").slice(0, 900));
  const name = s.resultName(), before = new Set(s.voxelIds());
  s.addToProject();
  let ids = [];
  for (let w = 0; w < 5000 && !ids.length; w += 50) { await sleep(50); ids = g().voxelIds().filter((id) => !before.has(id)); }
  if (!ids.length) return fail("The estimate ran but could not be added to the project.");
  const r = s.result, pr = r.params || {};
  return { ok: true, changed: "block model", name: clean(name).slice(0, 160), id: ids[0], ...(ids.length > 1 ? { ids } : {}), element: pr.element || el, unit: pr.unit || null, method: pr.method || null,
    blocks: r.blocksEstimated, cell_m: pr.cellSizeM ?? null, search_m: pr.searchRadiusM ?? null, lines, not_a_resource_estimate: notResource || null,
    revert: (st) => { for (const id of ids) { try { (st?.removeVoxelModel || g().removeVoxelModel)?.(id); } catch { /* already gone */ } } } };
}

// in GradeEstimationModal: useMcpEstimate(() => ({ ...the dialog's state and functions }))
export function useMcpEstimate(get) {
  const ref = useRef(get); ref.current = get;
  useModuleAction(["mcp-estimate"], (_a, p) => {
    let done; try { done = estimateAction(() => ref.current(), p); } catch { done = Promise.resolve(fail("The estimate could not be run.")); }
    done.catch(() => fail("The estimate could not be run.")).then((r) => { try { p?.reply?.(r); } catch { /* the app has gone */ } });
  });
}
