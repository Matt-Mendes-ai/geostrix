// TASKS.csv #821 — "Intrusions as bodies" (3D Modelling > Model from map): every mapped polygon of the chosen intrusive
// units becomes a closed body (lib/intrusionBody.js), one closed surface per unit, listed with the model surfaces. Closed
// like the unit volumes (#517): the volume readout, DXF / OBJ export, sections and "Restrict to a modelled volume" work.
import * as THREE from "three";
import { intrusionBody } from "../../lib/intrusionBody.js";
import { meshVolume } from "../../lib/unitVolumes.js";
import { featureCategoryValue, pointInRings } from "../../lib/mapLayers.js";
import { colorForLithology } from "../../lib/layers.js";
import { terrainGroundAt } from "../../lib/viewer/geomath.js";
import { notice, errorNotice, appendNotice } from "../../lib/notices.js";
import { t as tr } from "../../lib/i18n.js";

// p: { layer, field, units, depthM, wallDip, flare }; scene: { implicitGroupRef, implicitMeshesRef, originRef,
// setImplicitSurfaces, setNotices, terrain }
export function buildIntrusionBodies(p, { implicitGroupRef, implicitMeshesRef, originRef, setImplicitSurfaces, setNotices, terrain }) {
  if (!terrain?.bbox) { setNotices((q) => [...q, notice("Intrusion bodies need a terrain: their tops are the ground inside each mapped polygon. Fetch or import one first.")]); return; }
  const groundAt = (x, y) => terrainGroundAt(terrain, x, y); // TASKS.csv #927
  const o = originRef.current, stamp = Date.now(), added = [], lines = [];
  let holes = 0;
  const failed = [], pinched = []; // depths reached by narrowing bodies that close before the chosen depth
  p.units.forEach((unit, k) => {
    const pos = [], idx = [];
    let n = 0, polys = 0;
    for (const f of p.layer.features) {
      if (String(featureCategoryValue(f, p.field)) !== String(unit)) continue;
      const rings = f.parts || [];
      rings.forEach((ring, ri) => {
        // a ring inside another ring of the same feature is a hole: not modelled (the body is filled), counted
        if (rings.filter((other, oi) => oi !== ri && pointInRings(ring[0], [other])).length % 2 === 1) { holes++; return; } // inside an odd number of rings: a hole (an island in a hole is a body again)
        try {
          const b = intrusionBody(ring, groundAt, { depthM: p.depthM, wallDip: p.wallDip, flare: p.flare });
          if (b.pinchedAtM != null) pinched.push(b.pinchedAtM);
          for (let i = 0; i < b.indices.length; i++) idx.push(b.indices[i] + n);
          for (let i = 0; i < b.positions.length; i++) pos.push(b.positions[i]);
          n += b.positions.length / 3;
          polys++;
        } catch (e) { failed.push(`${unit}: ${e.message}`); }
      });
    }
    if (!polys) return;
    const world = Float64Array.from(pos), indices = Uint32Array.from(idx), scene = new Float32Array(world.length);
    for (let i = 0; i < world.length; i += 3) { scene[i] = world[i] - o.x; scene[i + 1] = world[i + 2] - o.z; scene[i + 2] = o.y - world[i + 1]; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(scene, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    const color = p.layer.categories?.find((c) => String(c.value) === String(unit))?.color || colorForLithology(unit);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
    const vol = meshVolume(world, indices);
    mesh.userData = { tip: `${unit} — intrusion body from the map (${polys} polygon${polys === 1 ? "" : "s"})\n${(vol / 1e6).toFixed(2)} Mm³, ${p.depthM} m below the outcrop, walls ${p.wallDip}°` };
    implicitGroupRef.current?.add(mesh);
    const id = `impl_${stamp}_intrusion_${k}`;
    implicitMeshesRef.current[id] = mesh;
    added.push({
      id, name: `${unit} intrusion body (from the map)`, visible: true, vertexCount: n, faceCount: indices.length / 3, type: "intrusion_body", relationships: [], closure: "closed",
      params: { tool: "intrusion body from the geological map (mapped outline extruded to a chosen depth; a construction, not a fitted model)", unit, layer: p.layer.name, field: p.field, polygons: polys,
        depthBelowOutcropM: p.depthM, wallDipDeg: p.wallDip, walls: p.wallDip >= 89.99 ? "vertical" : p.flare === "in" ? "narrowing with depth" : "widening with depth", volumeM3: Math.round(vol), builtAt: new Date().toISOString() },
    });
    lines.push(tr("{unit} {v} Mm³ ({n} polygon(s))", { unit, v: (vol / 1e6).toFixed(2), n: polys }));
  });
  if (added.length) setImplicitSurfaces((q) => [...q, ...added]);
  const msgs = [];
  if (added.length) msgs.push(appendNotice(notice(added.length === 1 ? "Added a closed intrusion body from the map: {lines}. Each is the mapped outline taken {d} m below its lowest outcrop with {walls} walls — a construction from the map and these two settings, not a fitted model. Listed with the model surfaces: volume, export, sections and \"Restrict to a modelled volume\" work on them." : "Added {n} closed intrusion bodies from the map: {lines}. Each is the mapped outline taken {d} m below its lowest outcrop with {walls} walls — a construction from the map and these two settings, not a fitted model. Listed with the model surfaces: volume, export, sections and \"Restrict to a modelled volume\" work on them.", {
    n: added.length, lines: lines.join(", "), d: p.depthM, walls: p.wallDip >= 89.99 ? tr("vertical") : p.flare === "in" ? tr("{dip}° inward-dipping", { dip: p.wallDip }) : tr("{dip}° outward-dipping", { dip: p.wallDip }),
  }), (holes ? tr(" {k} hole(s) inside polygons were filled (holes are not modelled).", { k: holes }) : "")
    + (p.wallDip < 89.99 && p.flare !== "in" ? tr(" Walls that widen with depth can make neighbouring outcrops of a unit grow into each other: where they overlap, the unit's volume counts the overlap twice.") : "")
    + (pinched.length ? tr(" {k} narrow outcrop(s) close before {d} m with these walls and end where they close ({a}–{b} m down).", { k: pinched.length, d: p.depthM, a: Math.round(Math.min(...pinched)), b: Math.round(Math.max(...pinched)) }) : "")));
  if (failed.length) msgs.push(errorNotice(tr("{k} polygon(s) could not be built: {list}", { k: failed.length, list: [...new Set(failed)].slice(0, 3).join(" ") })));
  if (!added.length && !failed.length) msgs.push(notice("None of the chosen units has a polygon on this map."));
  setNotices((q) => [...q, ...msgs]);
}
