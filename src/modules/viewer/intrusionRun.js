// TASKS.csv #821 — "Intrusions as bodies" (3D Modelling > Model from map): every mapped polygon of the chosen intrusive
// units becomes a closed body (lib/intrusionBody.js), one closed surface per unit, listed with the model surfaces. Closed
// like the unit volumes (#517): the volume readout, DXF / OBJ export, sections and "Restrict to a modelled volume" work.
import * as THREE from "three";
import { intrusionBody } from "../../lib/intrusionBody.js";
import { meshVolume } from "../../lib/unitVolumes.js";
import { validateSolid } from "../../lib/meshValidate.js"; // TASKS.csv #938
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
  const tb = terrain.bbox, inTerrain = (x, y) => x >= tb[0] && x <= tb[2] && y >= tb[1] && y <= tb[3]; // #2569 — a gap inside the box is filled, beyond it refused
  const o = originRef.current, stamp = Date.now(), added = [], lines = [];
  let holes = 0;
  const failed = [], pinched = [], gapFilled = { k: 0, n: 0 }, thick = []; // thick: #2642 — each sheet's thickness across the dip // depths reached by narrowing bodies that close before the chosen depth
  // TASKS.csv #938 — do two bodies cross? Widening walls make neighbouring outcrops of a unit grow into each other at
  // depth; merged into one mesh, the overlap made it self-crossing (96 crossing pairs in the review's case): inside tests
  // said "outside" between them and "Restrict to a modelled volume" refused the whole unit. Box test first, then a mesh test.
  const boxOf = (b) => { const P = b.positions, m = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (let i = 0; i < P.length; i += 3) for (let d = 0; d < 3; d++) { m[d] = Math.min(m[d], P[i + d]); m[d + 3] = Math.max(m[d + 3], P[i + d]); } return m; };
  const cross = (a, b) => {
    if (a.box[3] < b.box[0] || b.box[3] < a.box[0] || a.box[4] < b.box[1] || b.box[4] < a.box[1] || a.box[5] < b.box[2] || b.box[5] < a.box[2]) return false;
    const na = a.b.positions.length / 3, pos = new Float64Array(a.b.positions.length + b.b.positions.length);
    pos.set(a.b.positions); pos.set(b.b.positions, a.b.positions.length);
    const idx = new Uint32Array(a.b.indices.length + b.b.indices.length);
    idx.set(a.b.indices); for (let i = 0; i < b.b.indices.length; i++) idx[a.b.indices.length + i] = b.b.indices[i] + na;
    return validateSolid(pos, idx).selfIntersectingPairs > 0;
  };
  const dipRanges = [], splitUnits = [];
  p.units.forEach((unit, k) => {
    const bodies = [];
    for (const f of p.layer.features) {
      if (String(featureCategoryValue(f, p.field)) !== String(unit)) continue;
      const rings = f.parts || [];
      rings.forEach((ring, ri) => {
        // a ring inside another ring of the same feature is a hole: not modelled (the body is filled), counted
        if (rings.filter((other, oi) => oi !== ri && pointInRings(ring[0], [other])).length % 2 === 1) { holes++; return; } // inside an odd number of rings: a hole (an island in a hole is a body again)
        try {
          const b = intrusionBody(ring, groundAt, { depthM: p.depthM, wallDip: p.wallDip, flare: p.flare, inTerrain, sheet: p.sheet || null }); // sheet: #2642
          if (b.sheetThicknessM != null) thick.push(b.sheetThicknessM);
          if (b.pinchedAtM != null) pinched.push(b.pinchedAtM);
          if (b.filledTop) { gapFilled.k += b.filledTop; gapFilled.n += b.topPoints; } // #2569
          if (b.wallDipDeg) dipRanges.push(b.wallDipDeg);
          bodies.push({ b, box: boxOf(b) });
        } catch (e) { failed.push(`${unit}: ${e.message}`); }
      });
    }
    if (!bodies.length) return;
    let overlap = false;
    for (let i = 0; i < bodies.length && !overlap; i++) for (let j = i + 1; j < bodies.length && !overlap; j++) overlap = cross(bodies[i], bodies[j]);
    if (overlap) splitUnits.push(`${unit} (${bodies.length})`);
    // one closed surface per unit, or (#938) one per outcrop when the unit's bodies cross: each then a valid solid
    const groups = overlap ? bodies.map((x) => [x]) : [bodies];
    const color = p.layer.categories?.find((c) => String(c.value) === String(unit))?.color || colorForLithology(unit);
    groups.forEach((grp, gi) => {
      const pos = [], idx = [];
      let n = 0;
      for (const { b } of grp) {
        for (let i = 0; i < b.indices.length; i++) idx.push(b.indices[i] + n);
        for (let i = 0; i < b.positions.length; i++) pos.push(b.positions[i]);
        n += b.positions.length / 3;
      }
      const polys = grp.length, num = overlap ? gi + 1 : null;
      const world = Float64Array.from(pos), indices = Uint32Array.from(idx), scene = new Float32Array(world.length);
      for (let i = 0; i < world.length; i += 3) { scene[i] = world[i] - o.x; scene[i + 1] = world[i + 2] - o.z; scene[i + 2] = o.y - world[i + 1]; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(scene, 3));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
      const vol = meshVolume(world, indices);
      mesh.userData = { tip: `${polys === 1 ? tr("{unit} — intrusion body from the map (1 polygon)", { unit }) : tr("{unit} — intrusion body from the map ({n} polygons)", { unit, n: polys })}
${p.sheet ? tr("{v} Mm³, {d} m below the outcrop, a sheet dipping {dip}° toward {dir}°", { v: (vol / 1e6).toFixed(2), d: p.depthM, dip: p.sheet.dip, dir: p.sheet.dipDir }) : tr("{v} Mm³, {d} m below the outcrop, walls {dip}°", { v: (vol / 1e6).toFixed(2), d: p.depthM, dip: p.wallDip })}` }; // #992 — UI text, translated
      implicitGroupRef.current?.add(mesh);
      const id = `impl_${stamp}_intrusion_${k}${num ? `_${num}` : ""}`;
      implicitMeshesRef.current[id] = mesh;
      const dips = grp.map((x) => x.b.wallDipDeg).filter(Boolean);
      added.push({
        id, name: num ? `${unit} intrusion body ${num} (from the map)` : `${unit} intrusion body (from the map)`, visible: true, vertexCount: n, faceCount: indices.length / 3, type: "intrusion_body", relationships: [], closure: "closed",
        params: { tool: "intrusion body from the geological map (mapped outline extruded to a chosen depth; a construction, not a fitted model)", unit, layer: p.layer.name, field: p.field, polygons: polys,
          depthBelowOutcropM: p.depthM, ...(p.sheet ? { shape: "sheet (both walls dip one way)", sheetDipDeg: p.sheet.dip, sheetDipDirDeg: p.sheet.dipDir } : { wallDipDeg: p.wallDip }) /* #2642 */, walls: p.sheet ? `sheet dipping ${p.sheet.dip} toward ${p.sheet.dipDir}` : p.wallDip >= 89.99 ? "vertical" : p.flare === "in" ? "narrowing with depth" : "widening with depth", volumeM3: Math.round(vol), builtAt: new Date().toISOString(),
          ...(dips.length && !p.sheet ? { wallDipAchievedDeg: [Math.round(Math.min(...dips.map((d) => d[0]))), Math.round(Math.max(...dips.map((d) => d[1])))] } : {}), // #939
          ...(num ? { separateBecause: "this unit's outcrop bodies cross at depth, so each outcrop is its own closed body (#938)" } : {}) },
      });
      lines.push(tr("{unit} {v} Mm³ ({n} polygon(s))", { unit: num ? `${unit} ${num}` : unit, v: (vol / 1e6).toFixed(2), n: polys }));
    });
  });
  if (added.length) setImplicitSurfaces((q) => [...q, ...added]);
  const msgs = [];
  if (added.length) msgs.push(appendNotice(notice(added.length === 1 ? "Added a closed intrusion body from the map: {lines}. Each is the mapped outline taken {d} m below its lowest outcrop with {walls} walls — a construction from the map and these two settings, not a fitted model. Listed with the model surfaces: volume, export, sections and \"Restrict to a modelled volume\" work on them." : "Added {n} closed intrusion bodies from the map: {lines}. Each is the mapped outline taken {d} m below its lowest outcrop with {walls} walls — a construction from the map and these two settings, not a fitted model. Listed with the model surfaces: volume, export, sections and \"Restrict to a modelled volume\" work on them.", {
    n: added.length, lines: lines.join(", "), d: p.depthM, walls: p.sheet ? tr("sheet ({dip}° toward {dir}°)", { dip: p.sheet.dip, dir: p.sheet.dipDir }) : p.wallDip >= 89.99 ? tr("vertical") : p.flare === "in" ? tr("{dip}° inward-dipping", { dip: p.wallDip }) : tr("{dip}° outward-dipping", { dip: p.wallDip }),
  }), (holes ? tr(" {k} hole(s) inside polygons were filled (holes are not modelled).", { k: holes }) : "")
    // #2642 — a sheet's thickness, from the map: its width across the dip x sin(dip)
    + (thick.length ? (Math.round(Math.min(...thick)) === Math.round(Math.max(...thick))
      ? tr(" As a sheet it is {a} m thick: its map width across the dip direction × sin {dip}°, on level ground.", { a: Math.round(thick[0]), dip: p.sheet.dip })
      : tr(" As a sheet each body is {a}–{b} m thick: its map width across the dip direction × sin {dip}°, on level ground.", { a: Math.round(Math.min(...thick)), b: Math.round(Math.max(...thick)), dip: p.sheet.dip })) : "")
    // #938 — bodies of one unit that cross are separate surfaces (each a valid solid); their volumes overlap where they meet
    + (splitUnits.length ? tr(" With these walls the outcrop bodies of {list} grow into each other at depth, so each outcrop is its own closed body (numbered): one merged mesh would cross itself and could not restrict an estimate. Their volumes overlap where they meet, so do not add them up.", { list: splitUnits.join(", ") }) : "")
    // #939 — a narrowing body is cut off flat where its base would be a fifth of the outline, and the walls actually built
    + (pinched.length ? tr(" {k} narrow outcrop(s) would close before {d} m with these walls: they are cut off flat where the base would be a fifth of the outline ({a}–{b} m down).", { k: pinched.length, d: p.depthM, a: Math.round(Math.min(...pinched)), b: Math.round(Math.max(...pinched)) }) : "")
    + (p.wallDip < 89.99 && dipRanges.length && (Math.min(...dipRanges.map((d) => d[0])) < p.wallDip - 5 || Math.max(...dipRanges.map((d) => d[1])) > p.wallDip + 5) ? tr(" The walls as built dip {a}–{b}° (asked {dip}°): the base follows a simplified outline.", { a: Math.round(Math.min(...dipRanges.map((d) => d[0]))), b: Math.round(Math.max(...dipRanges.map((d) => d[1]))), dip: p.wallDip }) : "")));
  if (gapFilled.k) msgs.push(notice("{k} of {n} outline point(s) fell in gaps of the terrain (cells it has no ground for) and took the ground of the nearest outline point that has some.", { k: gapFilled.k, n: gapFilled.n })); // #2569
  if (failed.length) msgs.push(errorNotice(tr("{k} polygon(s) could not be built: {list}", { k: failed.length, list: [...new Set(failed)].slice(0, 3).join(" ") })));
  if (!added.length && !failed.length) msgs.push(notice("None of the chosen units has a polygon on this map."));
  setNotices((q) => [...q, ...msgs]);
  // #2569 — what happened, for the pane to keep under its button (the notice fades)
  return { added: added.length, failed: [...new Set(failed)], gapFilled: gapFilled.k ? gapFilled : null };
}
