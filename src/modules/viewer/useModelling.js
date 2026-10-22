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
import { errorNotice, notice } from "../../lib/notices.js";
import { intervalEndIndex, intervalStartIndex, upperContactOf } from "../../lib/viewer/intervals.js";
import { findOnTrace, interceptId } from "../../lib/viewer/modelHelpers.js";
import { t as tr } from "../../lib/i18n.js"; // TASKS.csv #786

const createRunsCache = { fn: null }; // TASKS.csv #697 — modellingRuns.js once loaded

export function useModelling(ctx) {
  const {
    layers,
    modellingCodes, // TASKS.csv #599
    originRef,
    sceneToApi,
    setNotices,
    setStackUnits,
    stackUnits,
    tracesRef,
  } = ctx;

  // TASKS.csv #697 — the run functions live in ./modellingRuns.js and load on the first run. Each wrapper is stable and
  // hands the run the context of the render it was clicked in (ctxRef is refreshed every render).
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
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

  const computeIntercepts = useCallback(() => {
    const traces = tracesRef.current;
    const o = originRef.current;
    const out = [];
    // TASKS.csv #52 (c) — the VEIN layer is listed here too now. #84's exclusions already applied to
    // vein intercepts inside runVeinModel, but the table that exists to review them only ever showed
    // litho and alteration, so a vein pick could be silently excluded by a filter with no UI to see it,
    // and (c)'s named sets could not have contained one at all. Listing it closes both gaps at once.
    [["litho", "Lithology"], ["alt", "Alteration"], ["vein", "Vein / dyke"]].forEach(([layerKey, layerLabel]) => {
      const ends = intervalEndIndex(layers[layerKey]); // #354 — skip row splits inside one unit
      const starts = intervalStartIndex(layers[layerKey]); // #569 — up-holes: the top is at `to`
      (layers[layerKey] || []).forEach((r) => {
        if (isNaN(r.from)) return;
        const t = traces.find((tc) => tc.hole_id === r.hole_id);
        if (!t) return;
        const top = upperContactOf(r, (md) => findOnTrace(t.pts, md)?.y, { startIndex: starts, endIndex: ends, codes: new Set([r.value]) });
        if (top.continues) return;
        const p = findOnTrace(t.pts, top.md);
        if (!p) return;
        const api = sceneToApi(p);
        // TASKS.csv #232 — api coords are origin-relative (see sceneToApi's own comment); add the
        // scene origin back in so the table/CSV export shows real-world E/N/Z, matching what the
        // mesh-export path (meshExport.js's sceneVertsToWorld) already does for the same conversion.
        out.push({ id: interceptId(layerKey, r), layerKey, layerLabel, hole_id: r.hole_id, unit: r.value, from: top.md, x: api.x + o.x, y: api.y + o.y, z: api.z + o.z });
      });
    });
    return out;
  }, [layers.litho, layers.alt, layers.vein]);

  const mcRef = useRef(modellingCodes); // TASKS.csv #599 — read by the model check after the run (closure can be stale)
  mcRef.current = modellingCodes;

  // TASKS.csv #360 — structure picks usable as faults in the stack: one entry per structure type + name
  // (#362 structure_id), each needing a position along a hole and a dip / dip direction.
  const faultCandidates = useMemo(() => {
    const m = new Map();
    (layers.structure || []).forEach((s) => {
      if (!Number.isFinite(s.dip) || !Number.isFinite(s.azimuth)) return;
      const key = `${s.value}|${s.structure_id || ""}`;
      const e = m.get(key) || { key, type: s.value, id: s.structure_id || "", n: 0, faultLike: /flt|fault|shear|shz/i.test(`${s.value} ${s.structure_id || ""}`) };
      e.n++; m.set(key, e);
    });
    return [...m.values()].sort((a, b) => (b.faultLike - a.faultLike) || a.key.localeCompare(b.key));
  }, [layers.structure]);
  const addStackUnit = useCallback((u) => {
    if (!u || stackUnits.includes(u)) return;
    // Matches the sidecar's own surfaces[] cap (python-sidecar/app/main.py, max_length=12) — capping
    // here too gives a clear notice instead of a raw validation error back from the sidecar.
    if (stackUnits.length >= 12) { setNotices((p) => [...p, notice("Stacks are capped at 12 units (matches the sidecar's own limit) — remove one before adding another.")]); return; }
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
