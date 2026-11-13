// TASKS.csv #2802 — the coarse set of a long custom log (see logLod.js), loaded the first time one is wanted.
import * as THREE from "three";
import { PickStandIn } from "../../lib/viewer/pickStandIn.js";
import { buildLayerBatches } from "../../lib/viewer/layerBatches.js";
import { lazyTip } from "../../lib/viewer/lazyTip.js";
import { traceLookup } from "../../lib/viewer/modelHelpers.js";
import { POINT_PROTO } from "../../lib/viewer/protos.js";
import { resolveLayerStyle } from "../../lib/layerStyle.js";
import { customColour } from "../../lib/customColour.js";
import { isPoint, LOG_BIN_SPACINGS } from "./logLod.js";

// one hole's point readings -> bins along the hole [{ from, to, depth, n, value, row }]: a bin starts at a reading and takes the readings
// within binM of it; numeric: the mean value, else the commonest
export function binReadings(rows, binM, numeric) {
  const pts = rows.filter(isPoint).sort((a, b) => a.depth - b.depth), out = [];
  for (let i = 0; i < pts.length;) {
    const from = Number(pts[i].depth);
    let j = i, sum = 0, n = 0, dsum = 0;
    const counts = numeric ? null : new Map();
    while (j < pts.length && Number(pts[j].depth) <= from + binM) {
      const v = pts[j].value;
      if (numeric) { const x = Number(v); if (Number.isFinite(x)) { sum += x; n++; } } else counts.set(v, (counts.get(v) || 0) + 1);
      dsum += Number(pts[j].depth); j++;
    }
    const count = j - i;
    let value;
    if (numeric) value = n ? sum / n : null;
    else { let best = -1; for (const [v, c] of counts) if (c > best) { best = c; value = v; } }
    out.push({ from, to: Number(pts[j - 1].depth), depth: dsum / count, n: count, value, row: pts[i] });
    i = j;
  }
  return out;
}

const fmt = (v) => (typeof v === "number" ? String(+v.toPrecision(4)) : String(v ?? "—"));

// the tip: the bin's value with the layer's unit when it has one (Main, #2802), the readings it stands for, its depths
export function buildCoarse(group, L, traces, visibleHoles) {
  const st = resolveLayerStyle(L.layerStyles?.[`custom:${L.layer.id}`], "point");
  const markerM = 2 * 2.4 * st.size; // the full set's sphere: radius 2.4 x size (drillholeScene)
  const binM = Math.max(LOG_BIN_SPACINGS * (L.spacingM || 0), markerM);
  const sample = (L.layer.rows || []).slice(0, 2000).filter(isPoint);
  const numeric = sample.length > 0 && sample.every((r) => r.value !== "" && r.value != null && Number.isFinite(Number(r.value)));
  const byHole = new Map();
  for (const r of L.layer.rows || []) { if (!isPoint(r) || visibleHoles?.[r.hole_id] === false) continue; const a = byHole.get(r.hole_id); if (a) a.push(r); else byHole.set(r.hole_id, [r]); }
  const traceOf = new Map((traces || []).map((t) => [t.hole_id, t]));
  const tmp = new THREE.Group();
  for (const [hole, rows] of byHole) {
    const t = traceOf.get(hole); if (!t?.pts?.length) continue;
    const look = traceLookup(t.pts);
    for (const b of binReadings(rows, binM, numeric)) {
      const p = look.at(b.depth); if (!p) continue;
      const mesh = new PickStandIn(POINT_PROTO[st.shape], { color: st.color || customColour(L.layer, L.layerStyles, { value: b.value }), transparent: st.opacity < 1, opacity: st.opacity, side: st.shape === "disc" ? THREE.DoubleSide : THREE.FrontSide });
      mesh.scale.setScalar(2.4 * st.size);
      mesh.position.set(p.x, p.y, p.z);
      mesh.userData = lazyTip({ row: b.row, holeId: hole }, () => `${hole}\n${L.layer.name}: ${fmt(b.value)}${numeric && L.layer.unit ? ` ${L.layer.unit}` : ""} (${numeric ? "mean" : "most"} of ${b.n} readings)\n${+b.from.toFixed(2)}–${+b.to.toFixed(2)} m`);
      tmp.add(mesh);
    }
  }
  buildLayerBatches(tmp);
  L.coarse = [...tmp.children];
  for (const c of L.coarse) { c.userData.lodCoarse = true; group.add(c); }
  if (L.coarse.length) group.updateWorldMatrix(true, true);
  L.vh = visibleHoles;
}

