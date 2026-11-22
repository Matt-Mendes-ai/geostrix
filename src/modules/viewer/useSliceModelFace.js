// TASKS.csv #3765 — a sliced block model is drawn as its back wall only (the logic: lib/viewer/sliceModelFace.js, loaded the first time a slice with a
// thickness is on: nothing of it is in the startup chunk). refresh: the voxel build's other inputs (it may make new meshes)
// TASKS.csv #4020 — the wall is a filled colour map sampled from the cells, made again when the slab moves (its position, direction, thickness);
// -> what a thick slab shows, for the slice pane: "mean" | "middle" | null (no block model in the slab)
import { useEffect, useRef, useState } from "react";

export function useSliceModelFace({ voxelMeshesRef, slicePlanesRef, originRef, activityRef, slice3d, voxelModels, refresh = [] }) {
  const on = !!slice3d?.on && Number(slice3d.thickness) > 0, used = useRef(false);
  const [reduce, setReduce] = useState(null);
  useEffect(() => {
    if (!on && !used.current) return undefined; // never switched on: nothing to take off
    let alive = true;
    const timer = setTimeout(() => { // #4020 — after the slider's render; a newer slab replaces it
      import("../../lib/viewer/sliceModelFace.js").then((m) => {
        if (!alive) return;
        used.current = true;
        const faces = m.applySliceFace({ voxelMeshesRef, slicePlanesRef, voxelModels, on, origin: originRef?.current });
        setReduce(faces.some((f) => f.reduce === "mean") ? "mean" : faces.length ? "middle" : null);
        if (activityRef) activityRef.current = Date.now(); // #441 — the render loop draws the new face
      });
    }, 30);
    return () => { alive = false; clearTimeout(timer); };
  }, [on, voxelModels, slice3d?.on, slice3d?.thickness, slice3d?.pos, slice3d?.azimuth, slice3d?.mode, refresh[0], refresh[1]]);
  return on ? reduce : null;
}
