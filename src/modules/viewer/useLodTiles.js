// TASKS.csv #3252 — the 3D View's detail tiles (imagery: lib/viewer/lodDrape.js, phase 2; terrain: lib/viewer/lodTerrain.js, phase 3), wired
// from here so ViewerModule.jsx stays under its size cap (test/viewerModuleSize1084): ViewerModule calls this hook once, after the effects that
// build the raster drapes and the terrain (it reads their meshes), and ticks the returned object from its render loop. Each module is loaded with
// import() the first time something it can tile is shown, never at startup.
import { useEffect, useMemo, useRef, useState } from "react";
import { detailTilesPrefs, setDetailTiles, gpuClass, rendererName, terrainOffReason } from "../../lib/viewer/detailTilesPref.js"; // the 'Detail tiles' switches
import { problemReportInfo } from "../../lib/desktop.js"; // this computer's memory, for the terrain tiles' default

const tiledTerrain = (t) => !!t && !!(t.lod || /^(AWS Terrain Tiles|Copernicus DEM|NRCan)/.test(String(t.source?.service || ""))); // #3515: the COG models too

// refs: { rasterGroupRef, rasterMeshesRef, terrainGroupRef, terrainMeshRef, mapLayerMeshesRef, rendererRef, originRef, lastActivityRef };
// state: { rasters, terrain, collars, mapLayers, project, rebuildSeq, deferRound, skip: () => buildDefer.skip() }
// -> a stable { tick(camera, viewportH), drape(), terrain() } (the animate loop keeps the first one), and on it each render: prefs ({ imagery,
// terrain, terrainChosen }), offReason (why the terrain tiles start off here, or null) and setPref(kind, on)
export { tiledTerrain };
export function useLodTiles(refs, { rasters, terrain, collars, mapLayers, project, rebuildSeq, deferRound, skip }) {
  const drapeRef = useRef(null), terrainRef = useRef(null);
  const api = useRef(null);
  if (!api.current) api.current = {
    tick(camera, h) { drapeRef.current?.tick(camera, h); terrainRef.current?.tick(camera, h); }, // the terrain tiles after the imagery tiles they draw
    drape: () => drapeRef.current,
    terrain: () => terrainRef.current,
  };
  const wake = () => { refs.lastActivityRef.current = Date.now(); }; // a tile that arrives redraws an idle view
  // TASKS.csv #3252 (Main's condition: light on cheap laptops) — the switches, kept on this computer; the terrain tiles start off on software or
  // integrated graphics, or 8 GB of memory or less
  const [machine, setMachine] = useState({ gpu: null, memoryGB: null });
  const [prefSeq, setPrefSeq] = useState(0);
  const prefs = useMemo(() => detailTilesPrefs(machine), [machine, prefSeq]);
  useEffect(() => { let live = true; problemReportInfo().then((i) => { if (live && i?.memoryGB?.total > 0) setMachine((m) => ({ ...m, memoryGB: i.memoryGB.total })); }).catch(() => {}); return () => { live = false; }; }, []);
  useEffect(() => { if (machine.gpu == null && refs.rendererRef.current) setMachine((m) => ({ ...m, gpu: gpuClass(rendererName(refs.rendererRef.current)) || "discrete" })); });
  Object.assign(api.current, { prefs, offReason: terrainOffReason(machine), setPref: (kind, on) => { setDetailTiles(kind, on); setPrefSeq((n) => n + 1); } });
  // phase 2 — the imagery tiles follow the rasters, the terrain and the origin
  useEffect(() => {
    if (!refs.rasterGroupRef.current || skip()) return undefined;
    const ctx = { enabled: prefs.imagery, group: refs.rasterGroupRef.current, cache: refs.rasterMeshesRef.current, rasters, terrain, origin: refs.originRef.current, renderer: refs.rendererRef.current, wake };
    if (drapeRef.current) { drapeRef.current.sync(ctx); return undefined; }
    if (!terrain || !prefs.imagery || !rasters.some((r) => r.lod)) return undefined;
    let live = true;
    import("../../lib/viewer/lodDrape.js").then((m) => { if (!live) return; drapeRef.current = drapeRef.current || m.createLodDrape(); drapeRef.current.sync(ctx); });
    return () => { live = false; };
  }, [rasters, terrain, collars, rebuildSeq, deferRound, prefs.imagery]);
  // phase 3 — the terrain tiles (display only), after the terrain mesh is built
  useEffect(() => {
    if (!refs.terrainGroupRef.current || skip()) return undefined;
    const ctx = { enabled: prefs.terrain, group: refs.terrainGroupRef.current, terrain, terrainMesh: refs.terrainMeshRef.current, epsg: project?.crsSet === false ? null : project?.epsg, origin: refs.originRef.current, rasters, rasterCache: refs.rasterMeshesRef.current, mapLayers, mapLayerCache: refs.mapLayerMeshesRef.current, lodDrape: () => drapeRef.current, wake };
    if (terrainRef.current) { terrainRef.current.sync(ctx); return undefined; }
    if (!prefs.terrain || !tiledTerrain(terrain)) return undefined;
    let live = true;
    import("../../lib/viewer/lodTerrain.js").then((m) => { if (!live) return; terrainRef.current = terrainRef.current || m.createLodTerrain(); terrainRef.current.sync(ctx); });
    return () => { live = false; };
  }, [terrain, collars, rasters, mapLayers, project?.epsg, project?.crsSet, rebuildSeq, deferRound, prefs.terrain, prefs.imagery]);
  useEffect(() => () => { drapeRef.current?.dispose(); terrainRef.current?.dispose(); }, []);
  return api.current;
}
