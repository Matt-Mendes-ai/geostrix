// TASKS.csv #3055 (the rest of #2932, WA iron) — the assay markers written straight into compact batch arrays: no object per sample.
// Each marker was a PickStandIn (vectors, a quaternion, a material, a userData closure), then grouped by buildLayerBatches and copied into
// a compact batch's arrays (#1643); on 148,000 Fe samples that was most of a 1.6-1.9 s element switch. Here each family (the marker's shared
// geometry, transparency, opacity and face side) collects its rows' matrices, colours and userData as it goes, and becomes one compact
// InstancedMesh (addCompactBatch). A family too small to batch (BATCH_MIN) is made as stand-ins as before, so it draws as a plain Mesh.
import * as THREE from "three";
import { addCompactBatch } from "./layerBatches.js";
import { PickStandIn, colorFrom } from "./pickStandIn.js";

export const BATCH_MIN = 24; // layerBatches' BATCH_MIN_MEMBERS: below it a family is drawn as plain meshes

export function makeAssayBatcher({ minBatch = BATCH_MIN } = {}) { // minBatch: #3144 — the coarse set batches every family
  const fams = new Map();
  const t = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1) };
  const m = new THREE.Matrix4();
  // TASKS.csv #3506 — consecutive markers nearly always share the family and the colour (a run of one class along a hole): the last family and the
  // last colour are reused by identity, so no key string is built and no colour looked up per marker (148,000 of each switching Fe on, WA iron)
  let lastF = null, lastColor, lastRgb = null;
  return {
    // place(t) sets t.position / quaternion / scale (placeAssayMarker) and returns false to skip the row; userData() makes the row's
    // userData (its lazy tip), only for a row that is drawn
    add(geometry, { color, transparent = false, opacity = 1, side = THREE.FrontSide }, place, userData) {
      t.position.set(0, 0, 0); t.quaternion.identity(); t.scale.set(1, 1, 1);
      if (!place(t)) return false;
      let f = lastF;
      if (!f || f.geometry !== geometry || f.transparent !== transparent || f.opacity !== opacity || f.side !== side) {
        const key = `${geometry.uuid}|${transparent ? 1 : 0}|${opacity}|${side}`;
        f = fams.get(key);
        if (!f) fams.set(key, (f = { geometry, transparent, opacity, side, base: new Float32Array(16 * 256), col: new Float32Array(3 * 256), rows: [], colors: [] })); // base / col: growing typed arrays, #3506
        lastF = f;
      }
      m.compose(t.position, t.quaternion, t.scale);
      const e = m.elements, at = f.rows.length;
      // TASKS.csv #3506 — written straight into typed arrays that double when full: 16 + 3 numbers a marker pushed into plain arrays, then copied
      // by Float32Array.from, were most of this build's garbage (the same float32 values: Float32Array.from rounded them the same way)
      if ((at + 1) * 16 > f.base.length) { const nb = new Float32Array(f.base.length * 2); nb.set(f.base); f.base = nb; const nc = new Float32Array(f.col.length * 2); nc.set(f.col); f.col = nc; }
      for (let k = 0; k < 16; k++) f.base[at * 16 + k] = e[k];
      if (!lastRgb || color !== lastColor) { const c = colorFrom(color, true); lastColor = color; lastRgb = [c.r, c.g, c.b]; }
      f.col[at * 3] = lastRgb[0]; f.col[at * 3 + 1] = lastRgb[1]; f.col[at * 3 + 2] = lastRgb[2];
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
        if (count >= minBatch) { addCompactBatch(group, f.geometry, f, f.base.slice(0, count * 16), f.rows, f.col.slice(0, count * 3)); continue; }
        for (let i = 0; i < count; i++) {
          const s = new PickStandIn(f.geometry, { color: f.colors[i], transparent: f.transparent, opacity: f.opacity, side: f.side });
          m.fromArray(f.base, i * 16).decompose(s.position, s.quaternion, s.scale);
          s.userData = f.rows[i];
          group.add(s);
        }
      }
      fams.clear(); lastF = null; lastRgb = null;
      return n;
    },
  };
}
