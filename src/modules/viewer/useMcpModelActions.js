// TASKS.csv #3932 (batch 2, Main 2026-11-21) — an AI app's modelling change tools (build_surface, build_grade_shell; lib/mcpActions.js, only while 'Allow AI apps to make
// changes' is on) carried out in StrixViewer: the guided tools' own "Build it for me" (guided/guidedRun.js), with the same checks, settings and refusals as their cards. ViewerModule
// passes a getter (`ctx()`, read afresh: a setting takes a render to arrive) and only its 3D View instance answers (the guided tools live there). Each answer carries `revert`,
// which takes out exactly the surfaces the run added (generated surfaces are not in GeoStrix's undo history: the toast's Undo is what takes them back). The engine's own progress and Cancel
// are in the status bar while it runs. guidedRun is loaded on first use (nothing here is in the startup chunk).
import { useRef } from "react";
import { useModuleAction } from "../../lib/menuRequests.js";

const lower = (v) => String(v ?? "").trim().toLowerCase();
const fail = (error) => ({ ok: false, error });
const line = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
const lines = (xs, n) => (xs || []).map(line).filter(Boolean).slice(0, n);

// c(): { store: { layers, modellingCodes, assays, survey, assayElements, structuralTrends, collars, terrain }, api (GuidedTool's), removeSurfaces(ids) }
// p: { op: 'surface', rock } | { op: 'grade_shell', element }
export async function modelAction(c, p, load = () => import("./guided/guidedRun.js")) {
  if (!p || typeof p !== "object") return fail("Nothing asked.");
  const G = await load();
  const now = () => c();
  const ctx = G.guidedCtx(now().store, () => now().api?.computeIntercepts?.());
  const getApi = () => now().api;
  let tool, value, changed, said;
  if (p.op === "surface") {
    const choices = G.unitsByHoles(ctx);
    const rock = choices.find((u) => lower(u) === lower(p.rock));
    if (!rock) return fail(`No rock '${line(p.rock).slice(0, 64)}' in the lithology log. The rocks logged: ${choices.slice(0, 40).join(", ") || "none"}.`);
    tool = G.toolForRock(ctx, rock); value = rock; changed = tool.id === "cover" ? "cover base surface" : "body surface"; said = tool.id;
  } else if (p.op === "grade_shell") {
    const els = ctx.assayElements.map((e) => e.symbol);
    const el = els.find((s) => lower(s) === lower(p.element));
    if (!el) return fail(`No element '${line(p.element).slice(0, 32)}' in this project's assays. Available: ${els.slice(0, 40).join(", ") || "none"}.`);
    tool = G.GRADE; value = el; changed = "grade shell"; said = "grade";
  } else return fail("Unknown model request.");
  const r = await G.runGuided({ tool, value, ctx, getApi });
  if (!r.ok) return fail(line(r.error).slice(0, 400));
  const ids = r.ids;
  return { ok: true, changed, rock: p.op === "surface" ? value : undefined, element: p.op === "grade_shell" ? value : undefined, built: r.built.map((n) => line(n).slice(0, 80)).slice(0, 6), ids, tool: said,
    why: lines(r.reasons, 4), notes: lines(r.notes, 4), revert: (st) => { try { (st?.removeSurfaces || now().removeSurfaces)?.(ids); } catch { /* already gone */ } } };
}

export function useMcpModelActions(ctx, enabled = true) {
  const ref = useRef(ctx); ref.current = ctx;
  useModuleAction(["mcp-model"], (_a, p) => {
    if (!enabled) return; // the 3D View instance answers: the guided tools live there
    let done; try { done = modelAction(() => ref.current(), p); } catch { done = Promise.resolve(fail("The model could not be built.")); }
    done.catch(() => fail("The model could not be built.")).then((r) => { try { p?.reply?.(r); } catch { /* the app has gone */ } });
  });
}
