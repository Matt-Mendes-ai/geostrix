// TASKS.csv #2390 / #2773 — which 3D Modelling ribbon tools Simple shows (lib/viewer/modellingSimple.js), from the store; worked out only while
// the 3D Modelling tab is shown (active). The geoML add-on's status is asked once, and again when an add-on event says it changed.
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../../lib/store.jsx";
import { groupMcodeRole } from "../../lib/layers.js";
import { modellingSimpleTools } from "../../lib/viewer/modellingSimple.js";

const NONE = { strat: false, mapModel: false, geoml: false, stereonet: false };

export function useModellingSimple(active) {
  const { layers, modellingCodes, lithoGroups, mapLayers, surfaceStructures } = useStore();
  const [geomlInstalled, setGeomlInstalled] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    let live = true, off = () => {};
    import("../../lib/geomlAddon.js").then(({ addonStatus, onAddonEvent }) => {
      const ask = () => addonStatus().then((s) => { if (live) setGeomlInstalled(!!s?.installed); }).catch(() => {});
      ask();
      const u = onAddonEvent(() => ask()); if (typeof u === "function") off = u;
    });
    return () => { live = false; off(); };
  }, [active]);
  return useMemo(() => {
    if (!active) return NONE;
    const groupOf = (v) => (lithoGroups || []).find((g) => (g.codes || []).includes(v))?.name || null;
    const structures = (layers?.structure || []).filter((r) => Number.isFinite(Number(r.dip)) && Number.isFinite(Number(r.azimuth)) && r.dip != null && r.azimuth != null).length + (surfaceStructures || []).reduce((n, s) => n + (s.rows?.length || 0), 0);
    return modellingSimpleTools({ litho: layers?.litho, mc: modellingCodes, groupOf, defaultRole: (name) => groupMcodeRole(name, lithoGroups), mapLayers, geomlInstalled, structures });
  }, [active, layers?.litho, layers?.structure, modellingCodes, lithoGroups, mapLayers, surfaceStructures, geomlInstalled]);
}
