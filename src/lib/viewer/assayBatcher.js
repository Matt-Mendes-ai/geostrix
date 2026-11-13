// TASKS.csv #3055 (the rest of #2932, WA iron) — the assay markers written straight into compact batch arrays: no object per sample.
// Each marker was a PickStandIn (vectors, a quaternion, a material, a userData closure), then grouped by buildLayerBatches and copied into
// a compact batch's arrays (#1643); on 148,000 Fe samples that was most of a 1.6-1.9 s element switch. Here each family (the marker's shared
// geometry, transparency, opacity and face side) collects its rows' matrices, colours and userData as it goes, and becomes one compact
// InstancedMesh (addCompactBatch). A family too small to batch (BATCH_MIN) is made as stand-ins as before, so it draws as a plain Mesh.
import * as THREE from "three";
import { addCompactBatch } from "./layerBatches.js";
import { PickStandIn, colorFrom } from "./pickStandIn.js";

export const BATCH_MIN = 24; // layerBatches' BATCH_MIN_MEMBERS: below it a family is drawn as plain meshes

export function makeAssayBatcher() {
  const fams = new Map();
  const t = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1) };
  const m = new THREE.Matrix4();
  return {
    // place(t) sets t.position / quaternion / scale (placeAssayMarker) and returns false to skip the row; userData() makes the row's
    // userData (its lazy tip), only for a row that is drawn
    add(geometry, { color, transparent = false, opacity = 1, side = THREE.FrontSide }, place, userData) {
      t.position.set(0, 0, 0); t.quaternion.identity(); t.scale.set(1, 1, 1);
      if (!place(t)) return false;
      const key = `${geometry.uuid}|${transparent ? 1 : 0}|${opacity}|${side}`;
      let f = fams.get(key);
      if (!f) fams.set(key, (f = { geometry, transparent, opacity, side, base: [], col: [], rows: [], colors: [] }));
      m.compose(t.position, t.quaternion, t.scale);
      const e = m.elements;
      for (let k = 0; k < 16; k++) f.base.push(e[k]);
      const c = colorFrom(color, true);
      f.col.push(c.r, c.g, c.b);
      f.colors.push(color);
      f.rows.push(userData());
      return true;
    },
    // -> the number of rows written; the families go into `group` (compact batches, or stand-ins for buildLayerBatches to finish)
    finish(group) {
      let n = 0;
      for (const f of fams.values()) {
        const count = f.rows.length;
        n += count;
        if (count >= BATCH_MIN) { addCompactBatch(group, f.geometry, f, Float32Array.from(f.base), f.rows, Float32Array.from(f.col)); continue; }
        for (let i = 0; i < count; i++) {
          const s = new PickStandIn(f.geometry, { color: f.colors[i], transparent: f.transparent, opacity: f.opacity, side: f.side });
          m.fromArray(f.base, i * 16).decompose(s.position, s.quaternion, s.scale);
          s.userData = f.rows[i];
          group.add(s);
        }
      }
      fams.clear();
      return n;
    },
  };
}
