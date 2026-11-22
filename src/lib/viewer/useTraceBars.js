// TASKS.csv #3943 — the 3D view's bars along the trace: the Mineralization layer's chosen minerals (its style's `bars`) and, when the Assays
// section draws as bars (the 'assay' style's `bars`), the shown elements instead of their markers. Each set is one mesh in its own group beside
// the hole groups, made again when its rows, choices or the hole traces change (tracesSeq), shown with its layer. Light drawing draws the first
// LIGHT_MAX_BARS of each set.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { traceLookup } from "./modelHelpers.js";
import { MAX_BARS, LIGHT_MAX_BARS } from "../traceBarsData.js";
import { isLight } from "./lightDrawing.js";
import { CATEGORICAL_SAFE_COLORS } from "../layers.js";
import { assayHue } from "../legendGroups.js";

const dispose = (m) => { m?.geometry?.dispose?.(); m?.material?.dispose?.(); };
export const barColour = (lane) => CATEGORICAL_SAFE_COLORS[lane % CATEGORICAL_SAFE_COLORS.length];

// custom: { layers, visible, styles } (#4008) — the numeric custom layers drawn as bars (each layer's style `bar`), in lanes after the minerals
export function useTraceBars({ groupsRef, tracesRef, tracesSeq, mnlgy, mnlgyStyle, mnlgyOn, mnlgyShown, mnlgyColour, assays, assaySyms, assayStyle, assayOn, assayShown, assayElements, custom }) {
  const groupRef = useRef(null);
  const ensure = () => {
    const parent = groupsRef.current?.holes?.parent;
    if (!parent) return null;
    if (!groupRef.current) { groupRef.current = new THREE.Group(); groupRef.current.name = "trace_bars"; }
    if (groupRef.current.parent !== parent) parent.add(groupRef.current);
    return groupRef.current;
  };
  const minChosen = mnlgyStyle?.bars, asOn = !!assayStyle?.bars;
  const customOn = custom ? Object.keys(custom.styles || {}).filter((k) => k.startsWith("custom:") && custom.styles[k]?.bar).join("|") + "#" + (custom.layers || []).map((l) => l.id + (custom.visible?.[l.id] === false ? "-" : "")).join(",") : "";
  const wantCustom = !!customOn.split("#")[0];
  useEffect(() => {
    const g = ensure();
    if (!g) return undefined;
    while (g.children.length) dispose(g.children.pop());
    const wantMin = !!(minChosen?.length && mnlgyOn), wantAssay = !!(asOn && assayOn && assaySyms?.length);
    if (!wantMin && !wantAssay && !wantCustom) return undefined;
    let gone = false;
    // the bars' code (the mesh, its shader, the bar data) loads with the first bar chosen (startup size)
    Promise.all([import("./traceBars.js"), import("../traceBarsData.js"), wantCustom ? import("../customBars.js") : null]).then(([{ traceBarsMesh }, { mineralBars, assayBars }, cb]) => {
    if (gone) return;
    const max = isLight() ? LIGHT_MAX_BARS : MAX_BARS;
    const looks = new Map(), traceOf = new Map((tracesRef.current || []).map((t) => [t.hole_id, t.pts]));
    const lookOf = (h) => { if (!looks.has(h)) looks.set(h, traceOf.has(h) ? traceLookup(traceOf.get(h)) : null); return looks.get(h); };
    if (wantMin) {
      const { bars } = mineralBars(mnlgy, minChosen, { shown: mnlgyShown, max });
      const ids = minChosen.slice(0, max), m = traceBarsMesh(bars, lookOf, (lane) => (mnlgyColour ? mnlgyColour(ids[lane], lane) : barColour(lane)));
      if (m) { m.name = "mnlgy_bars"; g.add(m); }
    }
    if (wantCustom && cb) { // #4008 — numeric custom layers: a lane each, after the minerals
      const lay = cb.barLayers(custom.layers, custom.visible, custom.styles, max), { bars } = cb.customBars(lay, { laneStart: wantMin ? Math.min(minChosen.length, max) : 0 });
      const first = wantMin ? Math.min(minChosen.length, max) : 0, m = traceBarsMesh(bars, lookOf, (lane) => cb.customBarColour(lay[lane - first] || lay[0], lane, custom.styles));
      if (m) { m.name = "custom_bars"; g.add(m); }
    }
    if (wantAssay) {
      const { bars } = assayBars(assays, assaySyms, { shown: assayShown, max });
      const m = traceBarsMesh(bars, lookOf, (lane) => assayHue(assaySyms[lane], assayElements)); // lane: the element's place among those chosen; its own hue (the markers')
      if (m) { m.name = "assay_bars"; g.add(m); }
    }
    }).catch(() => { /* offline chunk: no bars */ });
    return () => { gone = true; };
  }, [mnlgy, minChosen, mnlgyOn, assays, assaySyms, asOn, assayOn, assayElements, tracesSeq, customOn, custom?.layers]); // the shown / colour callbacks are read when it builds
  useEffect(() => () => { const g = groupRef.current; if (!g) return; while (g.children.length) dispose(g.children.pop()); g.parent?.remove(g); }, []);
}
