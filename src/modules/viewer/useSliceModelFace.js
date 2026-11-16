// TASKS.csv #3765 — a sliced block model is drawn as its back wall only (the logic: lib/viewer/sliceModelFace.js, loaded the first time a slice with a
// thickness is on: nothing of it is in the startup chunk). refresh: the voxel build's other inputs (it may make new meshes)
import { useEffect, useRef } from "react";

export function useSliceModelFace({ voxelMeshesRef, slicePlanesRef, rendererRef, slice3d, voxelModels, refresh = [] }) {
  const on = !!slice3d?.on && Number(slice3d.thickness) > 0, used = useRef(false);
  useEffect(() => {
    if (!on && !used.current) return undefined; // never switched on: nothing to take off
    let alive = true;
    import("../../lib/viewer/sliceModelFace.js").then((m) => { if (!alive) return; used.current = true; m.applySliceFace({ voxelMeshesRef, slicePlanesRef, rendererRef, voxelModels, on }); });
    return () => { alive = false; };
  }, [on, voxelModels, slice3d?.on, slice3d?.thickness, refresh[0], refresh[1]]);
}
