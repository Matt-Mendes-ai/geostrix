// TASKS.csv #445 step 2 — the modelling runs (implicit / stacked / structural surfaces via GemPy, alteration and
// vein halos, numeric grade shells, boundary intercepts, the stratigraphic-stack editor), moved out of
// ViewerModule.jsx VERBATIM: the code between the destructuring and the return is exactly what sat in the
// component (by script, not retyped), so every TASKS.csv comment inside still applies where it stands.
// ViewerModule calls this hook at the same point in its body as the code used to run, so React's hook order,
// every useCallback / useMemo dependency array and every closure see exactly the same values as before.
// `ctx` carries what the code reads from the component (store values, state + setters, refs, helpers) —
// the list was produced by a scope analysis (eslint-scope), not by hand; the return is what the rest of
// ViewerModule uses.
// TASKS.csv #697 — the run functions themselves have since moved to ./modellingRuns.js (loaded on the first run);
// this hook keeps the synchronous parts (intercepts table, fault candidates, stack editor) and thin run wrappers.
import { useCallback, useMemo, useRef } from "react";
import { errorNotice } from "../../lib/notices.js";
import { boundaryIntercepts } from "../../lib/viewer/boundaryIntercepts.js"; // TASKS.csv #2931
import { t as tr } from "../../lib/i18n.js"; // TASKS.csv #786
import { faultLikeName } from "../../lib/layers.js"; // TASKS.csv #1549
import { useStore } from "../../lib/store.jsx"; // TASKS.csv #3116 — the built-in logs' range / despike, for the grade shell run
import { useModuleAction } from "../../lib/menuRequests.js"; // TASKS.csv #2640 Stage 2

const createRunsCache = { fn: null }; // TASKS.csv #697 — modellingRuns.js once loaded

export function useModelling(ctx) {
  const {
    layers,
    modellingCodes, // TASKS.csv #599
    originRef,
    sceneToApi,
    setNoticesToTab, // TASKS.csv #3963
    setStackUnits,
    stackUnits,
    tracesRef,
  } = ctx;

  // TASKS.csv #697 — the run functions live in ./modellingRuns.js and load on the first run. Each wrapper is stable and
  // hands the run the context of the render it was clicked in (ctxRef is refreshed every render).
  const ctxRef = useRef(ctx);
  const store = useStore(), logValidRange = store.project?.logValidRange; // #3116
  // TASKS.csv #3963 — a job's early notices go to the project it started in (its tab's list, or none once it is closed), not to the tab shown when it speaks
  const setNoticesFor = (key, updater) => setNoticesToTab?.(store.tabIdOfProjectKey?.(key), updater);
  ctxRef.current = { ...ctx, logValidRange, setLastImplicitRequest: store.setLastImplicitRequest /* #2640 */, startProjectJob: store.startProjectJob /* #3953 */, setNoticesFor /* #3963 */, generatedSurfaces: store.generatedSurfaces /* #4006 — a Faults-pane fault in the stack */ };
  const lazyRun = useCallback((name) => async (...args) => {
    let create;
    try {
      create = createRunsCache.fn || (createRunsCache.fn = (await import("./modellingRuns.js")).createModellingRuns);
    } catch (err) {
      ctxRef.current.setNotices((p) => [...p, errorNotice(tr("The modelling tools could not be loaded: {v}", { v: err?.message || err }))]);
      return undefined;
    }
    return create(ctxRef.current, mcRef)[name](...args);
  }, []);
  const runs = useMemo(() => Object.fromEntries(["runAlterationModel", "runImplicitModel", "runMapModel", "runNumericModel", "runStackModel", "runStructuralModel", "runVeinModel", "runFittedModel" /* #2640 Stage 2 */].map((n) => [n, lazyRun(n)])), [lazyRun]);
  const { runAlterationModel, runImplicitModel, runMapModel, runNumericModel, runStackModel, runStructuralModel, runVeinModel } = runs; // runMapModel: #817
  // TASKS.csv #2640 Stage 2 — Geophysics > the structure fit's 'Run the fitted model as a new version': the viewer runs it (it holds the modelling context)
  useModuleAction(["run-fitted-model"], (_a, payload) => { if (payload?.record) runs.runFittedModel(payload.record); });

  // TASKS.csv #2931 — the loop is lib/viewer/boundaryIntercepts.js (tested on a 6,390-hole project)
  const computeIntercepts = useCallback(() => boundaryIntercepts(layers, tracesRef.current, originRef.current, sceneToApi), [layers.litho, layers.alt, layers.vein]);

  const mcRef = useRef(modellingCodes); // TASKS.csv #599 — read by the model check after the run (closure can be stale)
  mcRef.current = modellingCodes;

  // TASKS.csv #360 — structure picks usable as faults in the stack: one entry per structure type + name
  // (#362 structure_id), each needing a position along a hole and a dip / dip direction.
  const faultCandidates = useMemo(() => {
    const m = new Map();
    (layers.structure || []).forEach((s) => {
      if (!Number.isFinite(s.dip) || !Number.isFinite(s.azimuth)) return;
      const key = `${s.value}|${s.structure_id || ""}`;
      const e = m.get(key) || { key, type: s.value, id: s.structure_id || "", n: 0, faultLike: faultLikeName(`${s.value} ${s.structure_id || ""}`) }; // #1549
      e.n++; m.set(key, e);
    });
    // TASKS.csv #4006 — and the faults built in the Faults pane from every kind of evidence, solved again with the stack from the inputs kept on them
    const built = (store.generatedSurfaces || []).filter((s) => s.params?.faultEvidence && s.params?.inputs?.points?.length).map((s) => ({ key: `surf|${s.id}`, type: s.name, id: "", n: s.params.inputs.points.length, faultLike: true, label: s.name, built: true }));
    return [...built, ...[...m.values()].sort((a, b) => (b.faultLike - a.faultLike) || a.key.localeCompare(b.key))];
  }, [layers.structure, store.generatedSurfaces]);
  const addStackUnit = useCallback((u) => {
    if (!u || stackUnits.includes(u)) return;
    // TASKS.csv #3162 — no cap here: the Layer-cake method has no unit limit, and a GemPy run checks its own before it starts (modellingRuns)
    setStackUnits((p) => [...p, u]);
  }, [stackUnits]);
  const removeStackUnit = useCallback((u) => setStackUnits((p) => p.filter((x) => x !== u)), []);
  const moveStackUnit = useCallback((u, dir) => {
    setStackUnits((p) => {
      const i = p.indexOf(u);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  return { addStackUnit, computeIntercepts, faultCandidates, moveStackUnit, removeStackUnit, runAlterationModel, runImplicitModel, runMapModel, runNumericModel, runStackModel, runStructuralModel, runVeinModel };
}
