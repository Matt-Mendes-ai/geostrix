// TASKS.csv #2823 — the collar markers' size: resolved from the setting (figureOverlay.collarSize) and the drilling, applied by the scene
// build at its end (after the holes are batched) and again here when only the setting changes (no rebuild). lib/viewer/collarMarkerSize.js.
import { useEffect, useRef } from "react";
import { applyCollarMarkerSize, resolveCollarRadius } from "../../lib/viewer/collarMarkerSize.js";

export function useCollarMarkerSize(setting, layerGroupsRef, anchorsRef) {
  const settingRef = useRef(setting);
  settingRef.current = setting;
  const api = useRef(null);
  if (!api.current) api.current = { apply: (group, anchors) => applyCollarMarkerSize(group, resolveCollarRadius(settingRef.current, anchors)) };
  useEffect(() => {
    const g = layerGroupsRef.current?.holes;
    if (g) api.current.apply(g, anchorsRef.current);
  }, [setting, layerGroupsRef, anchorsRef]);
  return api.current;
}
