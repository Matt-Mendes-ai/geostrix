// TASKS.csv #3843 — what the Stereonet needs to cut its readings by place: a ground-point-in-window test from the 3D View's camera and the
// project's boundaries. Scene axes: x = east, y = elevation (the origin's own level is 0), z = -north.
import * as THREE from "three";

const _v = new THREE.Vector3();
export function makeStereonetLocate(camera, mount, origin, boundaries, collars) {
  const w = mount?.clientWidth || 0, h = mount?.clientHeight || 0;
  const inView = camera && w > 0 && h > 0 && origin ? (x, y) => {
    _v.set(x - origin.x, 0, -(y - origin.y)).project(camera);
    return _v.z >= -1 && _v.z <= 1 && Math.abs(_v.x) <= 1 && Math.abs(_v.y) <= 1;
  } : null;
  return {
    inView,
    boundaries: (boundaries || []).filter((b) => b?.polylines?.length).map((b) => ({ id: b.id, name: b.name, polylines: b.polylines })),
    collarXY: new Map((collars || []).map((c) => [c.hole_id, { x: c.x, y: c.y }])),
  };
}
