// TASKS.csv #759 / #1807 / #3413 and the section work since — what a section window is sent: the holes, intervals, points and planes in its
// corridor, the legend, the block-model slices, the surface traces, the planned holes and their pierce points, the point surveys, and the
// modelled-unit backdrop (modelBackdropFor). TASKS.csv #3996 — moved out of ViewerModule.jsx as they were (its cap, and the startup bundle:
// loaded with the first section, with modelSection / sectionScatter / sectionLegend / piercePoints). c: the viewer's state, refs and helpers.
import { LAYER_META, colorForVoxelValue } from "../../lib/layers.js";
import { alphaOnlyFan, meanPole } from "../../lib/sectionStructures.js"; // TASKS.csv #1130
import { assayLegendGroups, voxelLegendGroups, numericLayerLegendGroups, assayHue } from "../../lib/legendGroups.js";
import { sectionBarSets, withAssayBarLook } from "../../lib/sectionBars.js"; // TASKS.csv #4002
import { corridorRuns, mdInRuns } from "../../lib/sectionCorridor.js"; // TASKS.csv #499
import { corridorScatter } from "../../lib/sectionScatter.js"; // TASKS.csv #1807
import { sectionCustomLegendItems } from "../../lib/customColour.js"; // TASKS.csv #2669
import { sectionNumericLegendItems } from "../../lib/sectionLegend.js"; // TASKS.csv #3413
import { piercePoints as surfacePierces } from "../../lib/piercePoints.js"; // TASKS.csv #1009
import { voxelCellShown, terrainGroundAt } from "../../lib/viewer/geomath.js";
import { sectionGrid, sameLine, unpackUnits, sectionPixels, blockSpacing, sectionZRange } from "../../lib/modelSection.js"; // TASKS.csv #759
import { unitAt } from "../../lib/modelCheck.js"; // TASKS.csv #356
import { plannedTrace } from "../../lib/plannedTrace.js"; // TASKS.csv #524
import { distToSegment } from "./ViewerParts.jsx";

const toRad = (d) => (d * Math.PI) / 180;
const plannedHoleTrace = (hole) => plannedTrace(hole); // as ViewerModule's (TASKS.csv #188 / #524)

export function makeSectionPayload(c) {
  const { lastLithBlock, lithUnitColor, terrain, tracesRef, assayDisplayElements, assayElements, assayStyle, assays, layers, plannedHoles, customLayers, effectiveColor, effectiveLabel, geophysPtsColorMode, geophysPtsMax, geophysPtsMin, geophysPtsStops, geophysSurveys, implicitMeshesRef, implicitSurfaces, isRowVisible, layerPrimitivesFor, layerStyles, layerVisible, numericClip, numericLayerColor, numericSymbology, originRef, pierceSurfaces, placedSurfaceSamples, project, structurePicksWithHoleAttitude, visibleHoles, voxelModels } = c;
  // TASKS.csv #759 — the last model's units on this section as a picture (drawn behind the holes in the section
  // window): exact when the run evaluated this saved section on this same line, else read from the model's block at its
  // cell size, and said so. Nodes above the ground are left out. Coordinates: world E / N / elevation.
  const modelBackdropFor = (a, b, secId, showTerrain, corridor) => {
    const lb = lastLithBlock;
    if (!lb?.block) return null;
    const colorOf = (u) => (u === lb.aboveLabel || /^above the top of /.test(u) ? "#d4d4d4" : lithUnitColor(lb, u));
    const ev = secId && lb.sections?.[secId];
    let grid, units, source;
    if (ev && sameLine({ ax: a.x, ay: a.y, bx: b.x, by: b.y }, ev)) {
      const g = ev.grid;
      grid = { len: g.len, z0: g.z0, z1: g.z1, nx: g.nx, ny: g.ny, dl: g.dl, nodes: Array.from(g.ij, (k) => ({ i: k % g.nx, j: Math.floor(k / g.nx) })) };
      units = unpackUnits(ev.units);
      source = `evaluated exactly every ${Math.round(g.dl)} m`;
    } else {
      const o = lb.origin, [, , , , bz0, bz1] = lb.block.extent, sp = blockSpacing(lb.block);
      const groundAt = terrain && showTerrain ? (x, y) => terrainGroundAt(terrain, x, y) : null; // TASKS.csv #927
      const tracePts = tracesRef.current.flatMap((t) => t.wx.map((x, i) => ({ x, y: t.wy[i], z: t.wz[i] })));
      const [zl, zh] = sectionZRange(tracePts, a, b, corridor, bz0 + o.z, bz1 + o.z);
      grid = sectionGrid(a, b, zl, zh, { maxPts: 40000, minSpacing: Math.max(1, Math.min(sp.horizontal, sp.vertical) / 2), groundAt });
      if (!grid) return null;
      const above = `above the top of ${lb.units[0]?.name || "the model"} (not modelled)`;
      units = grid.nodes.map((n) => { const u = unitAt(lb.block, n.x - o.x, n.y - o.y, n.z - o.z); return u === undefined ? null : u === null ? above : u; });
      source = `read from the model's block (cells about ${Math.round(sp.horizontal)} x ${Math.round(sp.vertical)} m; a model run evaluates the most recent sections exactly)`;
    }
    if (!units.some((u) => u != null)) return null;
    const cv = document.createElement("canvas");
    cv.width = grid.nx; cv.height = grid.ny;
    cv.getContext("2d").putImageData(new ImageData(sectionPixels(grid, units, colorOf), grid.nx, grid.ny), 0, 0);
    const seen = [...new Set(units.filter((u) => u != null))];
    return { name: `Model: ${lb.title} (${lb.when})`, source, len: grid.len, z0: grid.z0, z1: grid.z1, dataUrl: cv.toDataURL("image/png"), legend: seen.map((u) => [`Model: ${u}`, colorOf(u)]) };
  };
  const buildSectionPayload = (a, b, corridor, scope = {}, secId = null) => {
    const azimuth = (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360;
    const holesInBand = tracesRef.current.filter((t) => (visibleHoles[t.hole_id] !== false || t.hole_id === scope.holeAsked /* #3680 — asked for by name */) && t.wx.some((wx, i) => distToSegment(wx, t.wy[i], a.x, a.y, b.x, b.y) <= corridor));
    const holeIds = new Set(holesInBand.map((t) => t.hole_id));
    // TASKS.csv #499 — each hole carries the depth runs that are actually inside the corridor and its offset
    // from the line; everything drawn on the hole is clipped to those runs below (sectionCorridor.js).
    const holes = holesInBand.map((t) => {
      const trace = t.pts.map((p, i) => ({ md: p.md, x: t.wx[i], y: t.wy[i], z: t.wz[i] }));
      const cr = corridorRuns(trace, a, b, corridor);
      return { hole_id: t.hole_id, trace, runs: cr.runs, minOffset: cr.minOffset, maxOffset: cr.maxOffset };
    });

    // User request: "make the geophysics voxel display on the cross section too" (reference: a Rogue
    // Geoscience section PDF showing a classified geophysics grid draped as a colored background behind
    // the drillhole traces). Slices every visible block/voxel model along the same section line/corridor
    // used for holes above, reusing the model's OWN color legend (colorForVoxelValue — the same stops/
    // palette/colorMode already driving its 3D-view appearance, imported from layers.js) so a color here
    // means exactly the same thing it does in the 3D view. Method: for each cell whose CENTER falls
    // within the corridor of the section line (same distToSegment test used for holes — an approximation,
    // not exact cell-polygon/plane intersection, but consistent with how every other section element
    // here already works via center-point/interpolation rather than true 3D geometry), project the cell
    // onto the section line to get its position (l = distance along the line) and width there. A cell is
    // an axis-aligned box in world x/y, and the section line can run at any azimuth relative to that grid
    // — the correct projected width of an axis-aligned box with half-extents (dx/2, dy/2) onto a unit
    // direction (ux, uy) is |ux|*dx/2 + |uy|*dy/2 (a standard separating-axis-theorem projection, not a
    // guess), so that's used for each rectangle's along-line half-width rather than just dx or dy alone.
    const secDx = b.x - a.x, secDy = b.y - a.y;
    const secLen = Math.hypot(secDx, secDy) || 1;
    const secUx = secDx / secLen, secUy = secDy / secLen;
    const along = (x, y) => (x - a.x) * secUx + (y - a.y) * secUy;
    const voxelSlices = [];
    (voxelModels || []).forEach((model) => {
      if (!model.cells?.length) return;
      // scope.voxelModelIds (an explicit array, possibly empty) OVERRIDES live 3D-view visibility for
      // this section specifically; scope.voxelModelIds == null falls back to the pre-existing
      // model.visible check, unchanged.
      if (scope.voxelModelIds != null) { if (!scope.voxelModelIds.includes(model.id)) return; }
      else if (model.visible === false) return;
      const rects = [];
      model.cells.forEach((c) => {
        if (!voxelCellShown(model, c)) return; // TASKS.csv #321, #1161
        if (distToSegment(c.x, c.y, a.x, a.y, b.x, b.y) > corridor) return;
        const l = along(c.x, c.y);
        const halfWidthL = Math.abs(secUx * (c.dx || 0)) / 2 + Math.abs(secUy * (c.dy || 0)) / 2;
        if (l + halfWidthL < 0 || l - halfWidthL > secLen) return; // entirely off the drawn extent
        rects.push({ l0: l - halfWidthL, l1: l + halfWidthL, z0: c.z - (c.dz || 0) / 2, z1: c.z + (c.dz || 0) / 2, color: colorForVoxelValue(model, c.value) });
      });
      if (rects.length) voxelSlices.push({ id: model.id, name: model.name, rects, legend: voxelLegendGroups([{ ...model, visible: true }])[0] || null }); // #1373 key
    });

    const { intervals, points } = layerPrimitivesFor(holeIds, scope); // #525 — shared with the level plan

    const planes = [];
    if (scope.layerKeys != null ? scope.layerKeys.includes("structure") : layerVisible.structure) {
      // TASKS.csv #1130 — alpha-only picks (no beta): a fan of possible apparent dips and the most likely one, from the
      // mean pole of the oriented picks of the same type (else of all oriented picks); hole attitude at the pick from
      // structurePicksWithHoleAttitude (the stereonet's Terzaghi source)
      const rows = structurePicksWithHoleAttitude || [];
      const oriented = rows.filter((s) => Number.isFinite(s.dip) && Number.isFinite(s.azimuth));
      const priorAll = meanPole(oriented), priorBy = new Map();
      const priorFor = (v) => { if (!priorBy.has(v)) priorBy.set(v, meanPole(oriented.filter((s) => s.value === v))); return priorBy.get(v) || priorAll; };
      rows.filter((s) => holeIds.has(s.hole_id) && isRowVisible("structure", s)).forEach((s) => {
        const color = effectiveColor("structure", s.value);
        const label = effectiveLabel("structure", s.value);
        let apparentDip = null, fan = null;
        if (s.dip != null && !isNaN(s.dip) && s.azimuth != null && !isNaN(s.azimuth)) {
          const deltaAz = toRad(s.azimuth - azimuth);
          apparentDip = Math.atan(Math.tan(toRad(s.dip)) * Math.cos(deltaAz)) * (180 / Math.PI);
        } else if (Number.isFinite(s.alpha) && Number.isFinite(s.holeAz) && Number.isFinite(s.holeDip)) {
          fan = alphaOnlyFan(s.alpha, s.holeAz, s.holeDip, azimuth, priorFor(s.value)); // #1130
        }
        planes.push({ hole_id: s.hole_id, depth: s.depth, color, label: `Structure: ${label}`, apparentDip, ...(fan ? { fan: fan.fan, likely: fan.likely, likelyFrom: fan.likelyFrom, alpha: s.alpha } : {}) });
      });
    }

    // TASKS.csv #499 — keep only what lies in the corridor: intervals / assay bars clipped to the in-corridor runs,
    // points and structures kept when their depth is in one. (Before, a hole touching the corridor anywhere had
    // its whole log drawn as if on the section.)
    {
      const runsOf = new Map(holes.map((h) => [h.hole_id, h.runs]));
      const clip = (holeId, from, to) => (runsOf.get(holeId) || []).map(([r0, r1]) => [Math.max(from, r0), Math.min(to, r1)]).filter(([f, t]) => t - f > 1e-6);
      const kept = intervals.flatMap((iv) => clip(iv.hole_id, iv.from, iv.to).map(([f, t]) => ({ ...iv, from: f, to: t })));
      intervals.length = 0; intervals.push(...kept);
      const keptPts = points.flatMap((pt) => {
        if (pt.assay) { const c = clip(pt.hole_id, pt.assay.from, pt.assay.to); return c.length ? [{ ...pt, md: (c[0][0] + c[c.length - 1][1]) / 2, assay: { ...pt.assay, from: c[0][0], to: c[c.length - 1][1] } }] : []; }
        return mdInRuns(pt.md, runsOf.get(pt.hole_id)) ? [pt] : [];
      });
      points.length = 0; points.push(...keptPts);
      const keptPlanes = planes.filter((pl) => mdInRuns(pl.depth, runsOf.get(pl.hole_id)));
      planes.length = 0; planes.push(...keptPlanes);
    }
    // TASKS.csv #4002 — the 3D view's bars along the trace (#3943), clipped to the runs in the buffer as above: its chosen minerals as lanes, and
    // its assay bars as the look of the grade bars; none when the 3D view draws none (or this section leaves the layer out)
    const barSets = (() => {
      const runsOf = new Map(holes.map((h) => [h.hole_id, h.runs]));
      const clip = (holeId, from, to) => (runsOf.get(holeId) || []).map(([r0, r1]) => [Math.max(from, r0), Math.min(to, r1)]).filter(([f, t]) => t - f > 1e-6);
      const mnOn = scope.layerKeys != null ? scope.layerKeys.includes("mnlgy") : layerVisible.mnlgy || !!scope.also?.includes("mnlgy");
      return sectionBarSets({ holeIds, clip, mineralTitle: LAYER_META.mnlgy.label,
        mnlgy: { rows: layers.mnlgy, chosen: layerStyles?.mnlgy?.bars, on: mnOn, shown: (r) => isRowVisible("mnlgy", r), codeColour: (v) => effectiveColor("mnlgy", v) },
        assay: { on: !!layerStyles?.assay?.bars && points.some((p) => p.assay), rows: assays, syms: assayDisplayElements, units: Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit])), hue: (s) => assayHue(s, assayElements) } });
    })();
    if (barSets.assayLanes) { const looked = withAssayBarLook(points, barSets.assayLanes); points.length = 0; points.push(...looked); }

    // User request (TASKS.csv #112): "Will need an elevation profile on the cross section from SRTM."
    // Samples the loaded terrain surface at regular steps along the section line (same
    // sampleTerrainElevation bilinear sampler the raster-drape/terrain-following code above already
    // uses) and hands the pop-out a simple {d, z} polyline — d = distance along the section line in
    // world units from point a, z = terrain elevation there — so it can draw a topographic profile
    // above the drillhole traces. null (not an empty array) when there's no terrain loaded, so
    // SectionWindow.jsx can tell "no terrain" apart from "terrain but this line is entirely off its
    // coverage" (the latter still returns an array, just possibly a short/partial one).
    let elevationProfile = null;
    const showTerrain = scope.showTerrain != null ? scope.showTerrain : true;
    if (terrain && showTerrain) {
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      // TASKS.csv #573 — sampled at the DEM's own cell size (was a fixed 100 points: every 50 m on a 5 km section,
      // cutting ridges / gullies a 30 m SRTM or 1 m LiDAR grid has, and the planned-collar snap interpolated across
      // them), at least 100 and at most 2000 points per section — bilinear lookups, once per section build.
      const [txmin, tymin, txmax, tymax] = terrain.bbox;
      const cell = Math.min((txmax - txmin) / Math.max(1, terrain.gridW - 1), (tymax - tymin) / Math.max(1, terrain.gridH - 1));
      const STEPS = Math.max(100, Math.min(2000, Math.ceil(dist / Math.max(cell, 1e-6))));
      const pts = [];
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        // #573 — off the terrain the sampler returns the nearest edge value: leave a gap, not a flat fake ground
        if (x < txmin || x > txmax || y < tymin || y > tymax) continue;
        const el = terrainGroundAt(terrain, x, y); // TASKS.csv #927 — a gap over the fill too
        if (Number.isFinite(el)) pts.push({ d: dist * t, z: el });
      }
      elevationProfile = pts;
    }

    // User request: "we need the legend to update matching the cross section" — a Layout legend bound
    // to a cross-section snapshot needs to know exactly which discrete categories are actually drawn
    // in THAT section (not the project's full lithology vocabulary, and not a live theme, since a
    // snapshot has neither once it's flattened to an image). Built from the SAME {color,label} pairs
    // already computed above for intervals/planes, so it's guaranteed to match the picture pixel-for-
    // pixel — deliberately excludes geotech/mag.susc./assay values (their color encodes a continuous
    // number, and assay point labels embed the sample's own grade, so deduping those would produce
    // either a meaningless single swatch or one row per sample rather than a bounded category list).
    const legendPrefixes = ["litho", "alt", "vein", "breccia", "weath", "structzone", "litho_gc", "alt_gc"].map((k) => `${LAYER_META[k].label}: `);
    const legendSeen = new Set();
    const legendItems = [];
    intervals.forEach((r) => {
      if (!legendPrefixes.some((p) => r.label.startsWith(p))) return;
      const dedupeKey = `${r.label}|${r.color}`;
      if (legendSeen.has(dedupeKey)) return;
      legendSeen.add(dedupeKey);
      legendItems.push([r.label, r.color]);
    });
    planes.forEach((r) => {
      const dedupeKey = `${r.label}|${r.color}`;
      if (legendSeen.has(dedupeKey)) return;
      legendSeen.add(dedupeKey);
      legendItems.push([r.label, r.color]);
    });
    legendItems.sort((a, b) => a[0].localeCompare(b[0]));
    // TASKS.csv #2669 — the custom layers drawn on the section (a strat-unit ribbon, a gamma log): their classes, or their ramp
    legendItems.push(...sectionCustomLegendItems(customLayers, new Set([...intervals, ...points].map((r) => String(r.layer || "")).filter((k) => k.startsWith("custom:")).map((k) => k.slice(7))), layerStyles));
    { const nk = ["sg", "geotech", "recovery", "magsusc"].filter((k) => intervals.some((r) => r.layer === k) || points.some((r) => r.layer === k)); if (nk.length) legendItems.push(...sectionNumericLegendItems(numericLayerLegendGroups({ keys: nk, layers, layerVisible: Object.fromEntries(nk.map((k) => [k, true])), isRowVisible, colorOf: numericLayerColor, symbology: numericSymbology, clips: numericClip, fieldColours: true /* #3553 off; #3704 — the key names the methods the ribbons are coloured by */ }))); } // TASKS.csv #3377 / #3413 — the numeric ribbons' keys (SG, RQD %, recovery, mag susc), as the 3D legend's

    // TASKS.csv #357 — model surfaces and imported solids ON the section. Every visible implicit/solid mesh
    // is cut by the vertical section plane (per-triangle sign test, once per section): the geologist can
    // now see the surface they are correcting on the section they draw contacts on, the Leapfrog/Micromine
    // edit loop. Segments come back in section coordinates (l along the line, z elevation), clipped to the
    // drawn extent. Scene -> world: E = x + ox, N = oy - z, Z = y + oz.
    const surfaceTraces = [];
    {
      const o = originRef.current;
      const nx = -secUy, ny = secUx; // horizontal normal of the section plane
      const nameOf = Object.fromEntries((implicitSurfaces || []).map((sf) => [sf.id, sf.name]));
      Object.entries(implicitMeshesRef.current || {}).forEach(([id, mesh]) => {
        if (!mesh?.visible || !mesh.geometry?.attributes?.position) return;
        const pos = mesh.geometry.attributes.position.array;
        const index = mesh.geometry.index ? mesh.geometry.index.array : null;
        const triCount = index ? index.length / 3 : pos.length / 9;
        const segs = [];
        const P = (vi) => { const E = pos[vi * 3] + o.x, N = o.y - pos[vi * 3 + 2], Z = pos[vi * 3 + 1] + o.z; return { l: along(E, N), d: (E - a.x) * nx + (N - a.y) * ny, z: Z }; };
        for (let t = 0; t < triCount; t++) {
          const i0 = index ? index[t * 3] : t * 3, i1 = index ? index[t * 3 + 1] : t * 3 + 1, i2 = index ? index[t * 3 + 2] : t * 3 + 2;
          const v = [P(i0), P(i1), P(i2)];
          const cut = [];
          for (let e = 0; e < 3; e++) {
            const p = v[e], q = v[(e + 1) % 3];
            if ((p.d <= 0 && q.d > 0) || (p.d > 0 && q.d <= 0)) {
              const f = p.d / (p.d - q.d);
              cut.push([p.l + (q.l - p.l) * f, p.z + (q.z - p.z) * f]);
            }
          }
          if (cut.length === 2 && !(cut[0][0] < 0 && cut[1][0] < 0) && !(cut[0][0] > secLen && cut[1][0] > secLen)) segs.push([cut[0][0], cut[0][1], cut[1][0], cut[1][1]]);
        }
        if (segs.length) surfaceTraces.push({ id, name: nameOf[id] || String(mesh.userData?.tip || id).split("\n")[0], color: `#${(mesh.material?.color?.getHex?.() ?? 0xc8a24a).toString(16).padStart(6, "0")}`, segs });
      });
    }
    // TASKS.csv #395 — planned holes within the corridor, drawn dashed on the section (targeting is done on
    // sections: the next hole goes under the last intercept).
    const plannedOnSection = [];
    (plannedHoles || []).forEach((h) => {
      const tr = plannedHoleTrace(h);
      if (!tr?.length || !tr.some((p) => distToSegment(p.x, p.y, a.x, a.y, b.x, b.y) <= corridor)) return;
      // TASKS.csv #1010 — with the depths along the planned trace (ticks and the end depth on the section) and where it
      // crosses the visible modelled surfaces (#1009), labelled with their depths
      plannedOnSection.push({ name: h.name || h.id, trace: tr.map((p) => ({ x: p.x, y: p.y, z: p.z, md: p.md })), pierces: surfacePierces(tr, pierceSurfaces).map((q) => ({ x: q.x, y: q.y, z: q.z, md: q.md, name: q.surfaceName })) });
    });

    const modelBackdrop = modelBackdropFor(a, b, secId, showTerrain, corridor); // #759
    if (modelBackdrop) modelBackdrop.legend.forEach((it) => legendItems.push(it));
    const assayLegend = barSets.assayLanes ? [] /* #4002 — bars in the elements' hues: their scale is keyed instead */ : assayLegendGroups({ assays, assayElements, assayVisible: true, assayDisplayElements, assayStyle, displayUnits: project?.displayUnits }); // #3236 // #1475 — the section window keys the grades it draws
    const scatter = corridorScatter({ geophysPts: layerVisible.geophys_pts ? layers.geophys_pts : null, geophysStyle: { stops: geophysPtsStops, colorMode: geophysPtsColorMode, min: geophysPtsMin, max: geophysPtsMax, surveys: geophysSurveys /* #1587 */ }, samples: layerVisible.surface_samples ? placedSurfaceSamples : null }, a, b, corridor); // #1807
    return { azimuth, holes, intervals, points, planes, elevationProfile, legendItems, assayLegend, voxelSlices, surfaceTraces, plannedHoles: plannedOnSection, modelBackdrop, scatter, scatterCounts: scatter.counts, mineralBars: barSets.mineralBars, barKeyRows: barSets.keyRows /* #4002 */ };
  };
  return buildSectionPayload;
}
