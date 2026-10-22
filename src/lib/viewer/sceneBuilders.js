// TASKS.csv #693 step 2 — the per-kind scene rebuilds (raster drapes, boundaries, map layers, section images, surface
// structure symbols, OMF objects, terrain), moved out of ViewerModule.jsx's effects VERBATIM except for mechanical renames
// (xGroupRef.current -> group, the mesh cache ref -> cache, originRef.current -> origin, rendererRef.current ->
// renderer). Each takes the three.js group it owns, its id -> object cache (mutated in place; the caller keeps the
// object) and the store list, and makes the group match the list. ViewerModule calls them from the same effects, with
// the same dependencies. No React here, so they run in Node with three (test/sceneBuilders693.test.mjs).
import * as THREE from "three";
import { sampleTerrainElevation } from "./geomath.js";
import { drawMapLayer, mapStyleSignature, mapTextureSize, STRUCTURE_CLASS_COLORS } from "../mapLayers.js";
import { decodeNoDataMask, isNoData } from "../demFill.js"; // TASKS.csv #421
import { buildAdaptiveTerrain } from "../terrainMesh.js"; // TASKS.csv #796

// ---------- rebuild raster drapes (TASKS.csv #24, #81) ----------
// Deliberately its own effect, not folded into the geometry-rebuild effect above: rasters come from
// the store's persisted `rasters` list (imported once via the Geophysics module, not re-derived from
// collars/survey/layers every render), so it only needs to re-run when that list changes, the origin
// shifts (collars changing re-centers everything else in the scene, so the drape has to follow to
// stay aligned — reads originRef.current, which the effect above keeps current, and this effect is
// declared after it so within one render pass the origin is already up to date), or `terrain`
// changes (a "drape on terrain" raster needs to re-sample if the terrain surface itself changed).
export function syncRasterDrapes(group, cache, rasters, { origin, terrain, renderer }) {
  const wantedIds = new Set(rasters.map((r) => r.id));
  // Drop meshes for rasters that were removed.
  Object.keys(cache).forEach((id) => {
    if (!wantedIds.has(id)) {
      const mesh = cache[id];
      group.remove(mesh); mesh.geometry?.dispose?.(); mesh.material?.map?.dispose?.(); mesh.material?.dispose?.();
      delete cache[id];
    }
  });
  const { x: ox, y: oy, z: oz } = origin;
  rasters.forEach((r) => {
    const [xmin, ymin, xmax, ymax] = r.bbox;
    const w = Math.max(0.001, xmax - xmin), h = Math.max(0.001, ymax - ymin);
    const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
    const elevation = r.elevation ?? oz;
    // TASKS.csv #81 — "drape on terrain" only actually applies if a terrain surface exists; a
    // raster imported before any terrain was loaded (or with drapeMode explicitly "flat") stays a
    // flat plane at `elevation`, same as #24's original behavior.
    const drapeOnTerrain = r.drapeMode === "terrain" && !!terrain;
    // Rebuild geometry when the drape MODE changes (flat <-> terrain) or the terrain surface itself
    // changes (a re-imported/updated terrain would otherwise leave a stale drape shape) — everything
    // else (opacity, elevation for flat mode) is a cheap in-place update on the existing mesh.
    const geoKey = drapeOnTerrain ? `terrain:${terrain.id}` : "flat";
    let mesh = cache[r.id];
    if (mesh && mesh.userData.geoKey !== geoKey) {
      // Dispose geometry AND material/texture here — the `!mesh` branch below always builds a fresh
      // texture+material from `r.dataUrl` rather than reusing the old ones, so leaving the old
      // material/texture undisposed here leaked a full-resolution GPU texture on every drape-mode
      // toggle or terrain replacement (TASKS.csv bug pass).
      group.remove(mesh); mesh.geometry.dispose(); mesh.material?.map?.dispose?.(); mesh.material?.dispose?.();
      mesh = null;
    }
    if (!mesh) {
      const texture = new THREE.TextureLoader().load(r.dataUrl);
      texture.colorSpace = THREE.SRGBColorSpace;
      // Sharpen oblique/close-up viewing of the drape (TASKS.csv "bad quality" report) — anisotropic
      // filtering only helps texels that ARE there look crisper at a grazing angle, it can't invent
      // resolution the source grid didn't have (see raster.js's MAX_TEXTURE_SIZE comment).
      texture.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: r.opacity ?? 0.85, side: THREE.DoubleSide, depthWrite: false });
      let geometry;
      if (drapeOnTerrain) {
        // Bug fix (user report: "image is not draping correctly... zones of discrepancies"). Two
        // compounding issues here, both about how closely this mesh actually hugs the terrain mesh
        // underneath it: (1) SEG was a flat 48 regardless of how much of the terrain's own (up to
        // 200x200) grid this raster's footprint covers — a raster spanning most/all of a rugged
        // terrain (real mountain topography, not a gentle slope) was being approximated by a much
        // coarser mesh than the terrain itself, so the drape cut straight across ridges/valleys the
        // terrain mesh actually resolves, instead of following them — visible as patchy gaps/seams
        // wherever local relief was sharper than 48 segments could capture. Now scaled to the
        // terrain's own resolution over the raster's footprint fraction (capped for perf). (2) even
        // with matched resolution, a drape sampled to sit exactly ON the terrain surface is a classic
        // z-fighting setup — two coincident (or near-coincident, given #1's approximation error)
        // surfaces at the same depth flicker unpredictably between which one the GPU draws on top,
        // which reads exactly as "overall ok, but some zones look wrong" since it's viewpoint- and
        // precision-dependent, not a real gap in the data. A small constant elevation nudge (well
        // under a metre, invisible at any real-world project scale) lifts the drape just clear of the
        // terrain so it always wins the depth test cleanly.
        const rasterFracX = w / Math.max(1e-6, terrain.bbox[2] - terrain.bbox[0]);
        const rasterFracY = h / Math.max(1e-6, terrain.bbox[3] - terrain.bbox[1]);
        const SEG = Math.round(Math.min(160, Math.max(48, Math.max(rasterFracX * terrain.gridW, rasterFracY * terrain.gridH))));
        const Z_FIGHT_EPSILON = 0.15; // world units (metres) — lifts the drape just clear of the terrain mesh
        geometry = new THREE.PlaneGeometry(w, h, SEG, SEG);
        const pos = geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          // Plane starts in the XY plane (local X = world easting offset, local Y = world northing
          // offset, BEFORE the -90° X rotation below lays it flat) — sample the real-world point at
          // this vertex and set local Z (which becomes scene Y = elevation, post-rotation).
          const localX = pos.getX(i), localY = pos.getY(i);
          const worldX = cx + localX, worldY = cy + localY;
          const el = sampleTerrainElevation(terrain, worldX, worldY);
          pos.setZ(i, el - oz + Z_FIGHT_EPSILON);
        }
        pos.needsUpdate = true;
        geometry.computeVertexNormals();
      } else {
        geometry = new THREE.PlaneGeometry(w, h);
      }
      mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2; // lie flat: plane's local Y (image "up"/north, per texture V) becomes -scene.z, matching the app's north = -z convention
      mesh.userData.geoKey = geoKey;
      group.add(mesh);
      cache[r.id] = mesh;
    } else {
      // Same shape as before — only position/material properties can change live via the sidebar
      // controls.
      mesh.material.opacity = r.opacity ?? 0.85;
    }
    mesh.visible = r.visible !== false;
    // A terrain-draped mesh's vertices already carry their own (terrain-relative) elevation — only
    // its X/Z footprint comes from cx/cy; a flat drape's single elevation still comes from `r.elevation`.
    mesh.position.set(cx - ox, drapeOnTerrain ? 0 : elevation - oz, -(cy - oy));
  });
}

// ---------- rebuild boundary polylines (Geosoft .ply import) ----------
// Own effect/group, same reasoning as the raster-drape effect above. Each boundary can have multiple
// polylines (multi-part boundaries are real — see geosoft.js's parsePLYBoundary comment), rendered
// as one THREE.LineLoop per part under a per-boundary THREE.Group so visibility/color/opacity toggle
// the whole boundary at once. Every loop is closed (LineLoop, not Line) even for source files that
// don't explicitly repeat the first vertex — real samples are inconsistent about that, and a closed
// loop is the more useful default for a property/survey boundary either way.
export function syncBoundaries(group, cache, boundaries, { origin, terrain }) {
  const wantedIds = new Set(boundaries.map((b) => b.id));
  Object.keys(cache).forEach((id) => {
    if (!wantedIds.has(id)) {
      const g = cache[id];
      group.remove(g);
      g.children.forEach((line) => { line.geometry.dispose(); line.material.dispose(); });
      delete cache[id];
    }
  });
  const { x: ox, y: oy, z: oz } = origin;
  boundaries.forEach((b) => {
    // Rebuilt from scratch on every relevant change (own polylines, drape mode, terrain content, or
    // origin shift) rather than diffed in place — a boundary is a handful of vertices at most (real
    // samples: a few dozen), so this is cheap enough not to need the raster effect's more careful
    // geoKey-based reuse.
    let g = cache[b.id];
    if (g) { group.remove(g); g.children.forEach((line) => { line.geometry.dispose(); line.material.dispose(); }); }
    g = new THREE.Group();
    const drapeOnTerrain = b.drapeMode === "terrain" && !!terrain;
    const elevation = b.elevation ?? oz;
    const material = new THREE.LineBasicMaterial({ color: b.color || "#e2a63c" });
    (b.polylines || []).forEach((pts, pi) => {
      if (pts.length < 2) return;
      const positions = new Float32Array(pts.length * 3);
      pts.forEach((p, i) => {
        // TASKS.csv #408 — a 3D string (DXF with elevations) is drawn at its own vertex Z.
        const el = drapeOnTerrain ? sampleTerrainElevation(terrain, p.x, p.y) : (b.useVertexZ && Number.isFinite(p.z) ? p.z : elevation);
        positions[i * 3] = p.x - ox;
        positions[i * 3 + 1] = el - oz;
        positions[i * 3 + 2] = -(p.y - oy);
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      // TASKS.csv #408 — open strings stay open; only polylines flagged closed (or boundaries without
      // flags, i.e. every pre-#408 import) are drawn as loops.
      const isClosed = Array.isArray(b.closedFlags) ? !!b.closedFlags[pi] : true;
      g.add(isClosed ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material));
    });
    g.visible = b.visible !== false;
    group.add(g);
    cache[b.id] = g;
  });
}

// ---------- rebuild draped map layers (TASKS.csv #316) ----------
// Each GIS map layer is rasterized into a canvas (mapLayers.js explains why a texture, not triangulated
// polygons) and laid on a terrain-conforming grid built the same way raster drapes are (#81), lifted a
// little higher than a raster (0.3 m vs 0.15 m) so a geology map sits over a hillshade or mag grid
// rather than z-fighting with it. Three levels of rebuild, cheapest first: opacity/visibility are
// material/mesh flags; a style change (colours, hidden units, outlines, colour-by field) re-rasterizes
// into the existing texture's canvas; only a drape change (terrain replaced, flat<->terrain, origin
// shift, flat elevation) rebuilds geometry.
export function syncMapLayers(group, cache, mapLayers, { origin, terrain, renderer }) {
  const disposeMesh = (mesh) => { group.remove(mesh); mesh.geometry?.dispose?.(); mesh.material?.map?.dispose?.(); mesh.material?.dispose?.(); };
  const wanted = new Set(mapLayers.map((l) => l.id));
  Object.keys(cache).forEach((id) => { if (!wanted.has(id)) { disposeMesh(cache[id]); delete cache[id]; } });
  const { x: ox, y: oy, z: oz } = origin;
  const maxTex = Math.min(4096, renderer?.capabilities?.maxTextureSize || 4096);
  mapLayers.forEach((l, li) => {
    if (!l.bbox || !l.features?.length) return;
    // Later layers sit 0.2 m above earlier ones so two overlapping maps never z-fight with each other.
    const lift = 0.3 + li * 0.2;
    // Pad a little so outlines on the layer's outer edge aren't clipped in half.
    const [bx0, by0, bx1, by1] = l.bbox;
    const pad = Math.max(bx1 - bx0, by1 - by0) / 2000 + 1;
    const bbox = [bx0 - pad, by0 - pad, bx1 + pad, by1 + pad];
    const w = bbox[2] - bbox[0], h = bbox[3] - bbox[1];
    const cx = (bbox[0] + bbox[2]) / 2, cy = (bbox[1] + bbox[3]) / 2;
    const drapeOnTerrain = l.drapeMode === "terrain" && !!terrain;
    const geoKey = `${drapeOnTerrain ? `terrain:${terrain.id}` : `flat:${l.elevation || 0}`}|${ox},${oy},${oz}|${lift}|${bbox.join(",")}`;
    const styleKey = mapStyleSignature(l);
    let mesh = cache[l.id];
    if (mesh && mesh.userData.geoKey !== geoKey) { disposeMesh(mesh); mesh = null; delete cache[l.id]; }
    if (!mesh) {
      const { width, height } = mapTextureSize(bbox, { targetMetresPerPixel: 1, maxSize: maxTex });
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: l.opacity ?? 0.6, side: THREE.DoubleSide, depthWrite: false });
      let geometry;
      if (drapeOnTerrain) {
        // Same resolution reasoning as the raster drape above: follow the terrain's own grid over this
        // layer's footprint (x1.5 so the drape doesn't cut corners between terrain samples), capped.
        const fracX = w / Math.max(1e-6, terrain.bbox[2] - terrain.bbox[0]);
        const fracY = h / Math.max(1e-6, terrain.bbox[3] - terrain.bbox[1]);
        const segX = Math.round(Math.min(256, Math.max(32, fracX * terrain.gridW * 1.5)));
        const segY = Math.round(Math.min(256, Math.max(32, fracY * terrain.gridH * 1.5)));
        geometry = new THREE.PlaneGeometry(w, h, segX, segY);
        const pos = geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const el = sampleTerrainElevation(terrain, cx + pos.getX(i), cy + pos.getY(i));
          pos.setZ(i, el - oz + lift);
        }
        pos.needsUpdate = true;
      } else {
        geometry = new THREE.PlaneGeometry(w, h);
      }
      mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2; // plane local +Y (image top = north) becomes scene -z, the app's north
      mesh.position.set(cx - ox, drapeOnTerrain ? 0 : (l.elevation || 0) - oz + lift - 0.3, -(cy - oy));
      mesh.renderOrder = 2 + li;
      mesh.userData = { geoKey, styleKey: null, canvas };
      group.add(mesh);
      cache[l.id] = mesh;
    }
    if (mesh.userData.styleKey !== styleKey) {
      const { canvas } = mesh.userData;
      drawMapLayer(canvas.getContext("2d"), l, bbox, canvas.width, canvas.height);
      mesh.material.map.needsUpdate = true;
      mesh.userData.styleKey = styleKey;
    }
    mesh.material.opacity = l.opacity ?? 0.6;
    mesh.visible = l.visible !== false;
  });
}

// ---------- georeferenced section images (TASKS.csv #630) ----------
// One textured quad per image through its four world corners (sectionGeoref.js: an affine maps the image to a
// parallelogram, so plain UVs on two triangles reproduce it exactly). Double-sided, so it reads from either side
// of the section. Rebuilt only when the corners, the image or the scene origin change; opacity / visibility are
// applied in place.
export function syncSectionImages(group, cache, sectionImages, { origin, renderer, onTextureLoad }) {
  const { x: ox, y: oy, z: oz } = origin;
  const meshes = cache;
  const dispose = (m) => { group.remove(m); m.geometry?.dispose?.(); m.material?.map?.dispose?.(); m.material?.dispose?.(); };
  const wanted = new Set((sectionImages || []).map((im) => im.id));
  Object.keys(meshes).forEach((id) => { if (!wanted.has(id)) { dispose(meshes[id]); delete meshes[id]; } });
  (sectionImages || []).forEach((im) => {
    if (!im.corners || im.corners.length !== 4 || !im.dataUrl) return;
    const geoKey = `${ox},${oy},${oz}|${im.corners.flat().join(",")}|${im.dataUrl.length}`;
    let mesh = meshes[im.id];
    if (mesh && mesh.userData.geoKey !== geoKey) { dispose(mesh); mesh = null; delete meshes[im.id]; }
    if (!mesh) {
      const pos = new Float32Array(im.corners.flatMap(([x, y, z]) => [x - ox, z - oz, -(y - oy)]));
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), 2)); // TL, TR, BR, BL
      geometry.setIndex([0, 3, 1, 1, 3, 2]);
      geometry.computeBoundingSphere();
      const texture = new THREE.TextureLoader().load(im.dataUrl, () => { onTextureLoad?.(); });
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
      const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, opacity: im.opacity ?? 1 });
      mesh = new THREE.Mesh(geometry, material);
      mesh.userData = { geoKey };
      group.add(mesh);
      meshes[im.id] = mesh;
    }
    mesh.material.opacity = im.opacity ?? 1;
    mesh.material.transparent = (im.opacity ?? 1) < 1;
    mesh.material.depthWrite = (im.opacity ?? 1) >= 1;
    mesh.material.needsUpdate = true;
    mesh.visible = im.visible !== false;
  });
}

// ---------- rebuild surface structure symbols (TASKS.csv #317) ----------
// One InstancedMesh of thin discs per imported file (a disc lying in the measured plane, i.e. its axis
// along the pole) plus one LineSegments of down-dip ticks from each disc's centre — two draw calls per
// file however many measurements it holds, same "don't do it one mesh per item" rule as #312. The tick
// is what makes a moderately dipping disc readable from above, where its tilt alone is hard to judge.
export function syncSurfaceStructures(group, cache, surfaceStructures, { origin, terrain }) {
  Object.values(cache).forEach((g) => { group.remove(g); g.children.forEach((c) => { c.geometry?.dispose?.(); c.material?.dispose?.(); c.dispose?.(); }); }); // #433 — InstancedMesh buffers
  for (const id of Object.keys(cache)) delete cache[id]; // the caller owns the object: emptied, not replaced
  const { x: ox, y: oy, z: oz } = origin;
  const up = new THREE.Vector3(0, 1, 0);
  surfaceStructures.forEach((set) => {
    const rows = set.rows || [];
    if (!rows.length) return;
    const size = set.size ?? 25;
    const g = new THREE.Group();
    const inst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 28), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), rows.length);
    const tickPos = new Float32Array(rows.length * 6);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(size, size, size), col = new THREE.Color();
    const pole = new THREE.Vector3(), down = new THREE.Vector3();
    rows.forEach((r, i) => {
      let z = r.z;
      if (terrain && (set.snapToTerrain !== false || z == null)) z = sampleTerrainElevation(terrain, r.x, r.y);
      if (z == null) z = oz;
      const dd = (r.dipDir * Math.PI) / 180, dp = (r.dip * Math.PI) / 180;
      // Upward pole (E, N, U) -> scene (x = E, y = U, z = -N).
      pole.set(Math.sin(dd) * Math.sin(dp), Math.cos(dp), -Math.cos(dd) * Math.sin(dp)).normalize();
      q.setFromUnitVectors(up, pole);
      const lift = size * 0.5 * Math.sin(dp) + 0.5; // keep the disc's lower rim out of the ground
      p.set(r.x - ox, z - oz + lift, -(r.y - oy));
      m.compose(p, q, sc);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, col.set(STRUCTURE_CLASS_COLORS[r.cls] || STRUCTURE_CLASS_COLORS.other));
      down.set(Math.sin(dd) * Math.cos(dp), -Math.sin(dp), -Math.cos(dd) * Math.cos(dp)).multiplyScalar(size * 0.75);
      tickPos.set([p.x, p.y, p.z, p.x + down.x, p.y + down.y, p.z + down.z], i * 6);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    g.add(inst);
    const tickGeo = new THREE.BufferGeometry();
    tickGeo.setAttribute("position", new THREE.BufferAttribute(tickPos, 3));
    g.add(new THREE.LineSegments(tickGeo, new THREE.LineBasicMaterial({ color: 0x1b1b1b })));
    g.visible = set.visible !== false;
    group.add(g);
    cache[set.id] = g;
  });
}

// ---------- rebuild OMF objects (TASKS.csv — Open Mining Format import) ----------
// Own effect/group, same reasoning as the boundary/raster effects above. Unlike boundaries (always a
// handful of vertices), an OMF point set/surface can be genuinely large (a real lithology wireframe
// or an assay-derived point set can run into the thousands to tens of thousands of vertices), so
// this deliberately uses ONE draw call per object (THREE.Points for point sets, THREE.LineSegments
// for line sets, a single indexed THREE.Mesh for triangulated surfaces) rather than one mesh per
// vertex/point the way e.g. the per-hole assay spheres do — same "don't do it the expensive way"
// lesson from this session's render-loop/geometry-grouping performance work, applied proactively
// here since OMF imports are exactly the kind of large external dataset that would suffer most from
// a one-mesh-per-point approach.
export function syncOmfObjects(group, cache, omfObjects, { origin }) {
  const disposeObj = (obj) => {
    group.remove(obj);
    obj.geometry?.dispose?.();
    const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
    mats.forEach((m) => m.dispose?.());
  };
  const wantedIds = new Set(omfObjects.map((o) => o.id));
  Object.keys(cache).forEach((id) => {
    if (!wantedIds.has(id)) { disposeObj(cache[id]); delete cache[id]; }
  });
  const { x: ox, y: oy, z: oz } = origin;
  omfObjects.forEach((o) => {
    if (cache[o.id]) { disposeObj(cache[o.id]); delete cache[o.id]; }
    const [gox, goy, goz] = o.origin || [0, 0, 0];
    const n = (o.vertices || []).length / 3;
    if (!n) return;
    // Same world->scene convention as everywhere else in this file: scene x = world x - ox,
    // scene y = world z - oz (elevation is "up" in the 3D view), scene z = -(world y - oy).
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const wx = gox + o.vertices[i * 3], wy = goy + o.vertices[i * 3 + 1], wz = goz + o.vertices[i * 3 + 2];
      positions[i * 3] = wx - ox;
      positions[i * 3 + 1] = wz - oz;
      positions[i * 3 + 2] = -(wy - oy);
    }
    const color = o.color || "#5a9bd4";
    let obj;
    if (o.kind === "points") {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      obj = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 3.5, sizeAttenuation: true }));
    } else if (o.kind === "lines") {
      const segs = o.segments || [];
      const segPositions = new Float32Array(segs.length * 3);
      for (let i = 0; i < segs.length; i++) {
        const vi = segs[i];
        segPositions[i * 3] = positions[vi * 3]; segPositions[i * 3 + 1] = positions[vi * 3 + 1]; segPositions[i * 3 + 2] = positions[vi * 3 + 2];
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(segPositions, 3));
      obj = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
    } else if (o.kind === "surface") {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setIndex(o.triangles || []);
      geometry.computeVertexNormals();
      obj = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    } else {
      return;
    }
    obj.visible = o.visible !== false;
    group.add(obj);
    cache[o.id] = obj;
  });
}

// ---------- rebuild terrain surface (TASKS.csv #77) ----------
// Own effect, own group, same reasoning as the raster-drape effect above: driven by the store's
// persisted (single) `terrain` object, not by layer-visibility churn, and needs to re-run when the
// scene origin shifts so it stays aligned with everything else.
// Removes and disposes `previous` (the mesh it returned last time, or null) and returns the new terrain mesh, or null
// with no terrain. #796: grids above ADAPTIVE_TERRAIN_NODES are drawn as an adaptive mesh, cached per terrain object
// so a re-centred scene does not rebuild it.
const ADAPTIVE_TERRAIN_NODES = 90000;
const adaptiveTerrainCache = new WeakMap();
export function syncTerrain(group, previous, terrain, { origin }) {
  if (previous) {
    group.remove(previous);
    previous.geometry.dispose();
    previous.material.dispose();
  }
  if (!terrain) return null;
  const { x: ox, y: oy, z: oz } = origin;
  const [xmin, ymin, xmax, ymax] = terrain.bbox;
  const { gridW, gridH, elevations } = terrain;
  // Built directly as a custom BufferGeometry (not PlaneGeometry+per-vertex Z tweak like the raster
  // drape above) since every vertex here has an independently meaningful world position, not just a
  // displaced flat grid — keeps the row/column -> world -> scene mapping explicit and easy to check
  // against parseDEM's own row-0-is-north convention.
  const mask = decodeNoDataMask(terrain.noDataMask);
  if (gridW * gridH > ADAPTIVE_TERRAIN_NODES) {
    // TASKS.csv #796 — High / Very high detail grids: only the nodes an adaptive mesh needs (lib/terrainMesh.js)
    let am = adaptiveTerrainCache.get(terrain);
    if (!am) { am = buildAdaptiveTerrain(gridW, gridH, elevations, mask ? (k) => isNoData(mask, k) : null); adaptiveTerrainCache.set(terrain, am); }
    const nv = am.vertexIds.length;
    const positions = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2);
    for (let n = 0; n < nv; n++) {
      const idx = am.vertexIds[n], i = idx % gridW, j = (idx - i) / gridW;
      positions[n * 3] = xmin + (i / (gridW - 1)) * (xmax - xmin) - ox;
      positions[n * 3 + 1] = elevations[idx] - oz;
      positions[n * 3 + 2] = -(ymax - (j / (gridH - 1)) * (ymax - ymin) - oy);
      uvs[n * 2] = i / (gridW - 1);
      uvs[n * 2 + 1] = 1 - j / (gridH - 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(am.indices, 1));
    geometry.computeVertexNormals();
    geometry.userData.adaptive = { triangles: am.triangles, maxError: am.maxError, nodes: gridW * gridH };
    const material = new THREE.MeshLambertMaterial({ color: terrain.color || "#8a7f68", side: THREE.DoubleSide, transparent: (terrain.opacity ?? 1) < 1, opacity: terrain.opacity ?? 1 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = terrain.visible !== false;
    group.add(mesh);
    return mesh;
  }
  const positions = new Float32Array(gridW * gridH * 3);
  const uvs = new Float32Array(gridW * gridH * 2);
  for (let j = 0; j < gridH; j++) {
    const worldY = ymax - (j / (gridH - 1)) * (ymax - ymin); // row 0 = north/ymax edge
    for (let i = 0; i < gridW; i++) {
      const worldX = xmin + (i / (gridW - 1)) * (xmax - xmin);
      const el = elevations[j * gridW + i];
      const idx = j * gridW + i;
      positions[idx * 3] = worldX - ox;
      positions[idx * 3 + 1] = el - oz;
      positions[idx * 3 + 2] = -(worldY - oy);
      uvs[idx * 2] = i / (gridW - 1);
      uvs[idx * 2 + 1] = 1 - j / (gridH - 1);
    }
  }
  const indices = [];
  // TASKS.csv #421 — leave out every triangle touching a no-data node (filled only for sampling).
  for (let j = 0; j < gridH - 1; j++) {
    for (let i = 0; i < gridW - 1; i++) {
      const a = j * gridW + i, b = a + 1, c = a + gridW, d = c + 1;
      if (mask && (isNoData(mask, a) || isNoData(mask, b) || isNoData(mask, c) || isNoData(mask, d))) continue;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({ color: terrain.color || "#8a7f68", side: THREE.DoubleSide, transparent: (terrain.opacity ?? 1) < 1, opacity: terrain.opacity ?? 1 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = terrain.visible !== false;
  group.add(mesh);
  return mesh;
}
