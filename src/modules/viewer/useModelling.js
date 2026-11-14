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

const createRunsCache = { fn: null }; // TASKS.csv #697 — modellingRuns.js once loaded

export function useModelling(ctx) {
  const {
    layers,
    modellingCodes, // TASKS.csv #599
    originRef,
    sceneToApi,
    setStackUnits,
    stackUnits,
    tracesRef,
  } = ctx;

  // TASKS.csv #697 — the run functions live in ./modellingRuns.js and load on the first run. Each wrapper is stable and
  // hands the run the context of the render it was clicked in (ctxRef is refreshed every render).
  const ctxRef = useRef(ctx);
  const logValidRange = useStore().project?.logValidRange; // #3116
  ctxRef.current = { ...ctx, logValidRange };
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
  const runs = useMemo(() => Object.fromEntries(["runAlterationModel", "runImplicitModel", "runMapModel", "runNumericModel", "runStackModel", "runStructuralModel", "runVeinModel"].map((n) => [n, lazyRun(n)])), [lazyRun]);
  const { runAlterationModel, runImplicitModel, runMapModel, runNumericModel, runStackModel, runStructuralModel, runVeinModel } = runs; // runMapModel: #817

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
    return [...m.values()].sort((a, b) => (b.faultLike - a.faultLike) || a.key.localeCompare(b.key));
  }, [layers.structure]);
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
