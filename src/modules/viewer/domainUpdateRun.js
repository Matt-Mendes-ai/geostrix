// TASKS.csv #3673 phase 2 — "Update an imported domain with new drilling" (the Grade shell pane): an imported solid (a DXF / OMF domain) is
// redrawn with the holes drilled from a year on, the old mesh a soft prior (lib/viewer/domainUpdate.js), the work in the estimation worker
// (shellPost's update step), and a report of what changed. Loaded when the button is used, not at startup.
import * as THREE from "three";
import { landed } from "../../lib/projectJobs.js"; // TASKS.csv #3953
import { t as tr } from "../../lib/i18n.js";
import { notice, errorNotice } from "../../lib/notices.js";
import { desurveyHole } from "../../lib/desurvey.js";
import { compositeDownhole, gradeUnitLabel } from "../../lib/geochem.js";
import { excludeQAQC } from "../../lib/qaqc.js";
import { samplePointsFromIntervals } from "../../lib/estimation.js";
import { runEstimation } from "../../lib/estimationClient.js";
import { sampleSpacing } from "../../lib/sampleSpacing.js";
import { computeMeshVolume } from "../../lib/volumetrics.js";
import { MAX_BLOCKS, gridBlockCount, cellToFit } from "../../lib/estimationMeta.js";
import { indicatorPoints, ENVELOPE_TARGET_TRIANGLES } from "../../lib/viewer/shellEnvelope.js";
import { meshOfPost } from "../../lib/viewer/shellPost.js";
import { holeYear, newHoleIds, domainPlaneSearch } from "../../lib/viewer/domainUpdate.js"; // domainPlaneSearch: #3876 (#3674)

// how many holes, and which, were drilled from `firstYear` on (for the pane's line)
export function holesFromYear(collars, firstYear) {
  const ids = [];
  for (const c of collars || []) { const y = holeYear(c); if (y != null && y >= firstYear) ids.push(c.hole_id); }
  return ids;
}

// ctx: the pane's (implicitSurfaces, implicitMeshesRef, implicitGroupRef, originRef, setImplicitSurfaces, setNotices, assays, assayElements, collars,
// survey, desurveyMethod, numericIncludeQAQC, numericCompositeLength, numericMinCoverage, numericCellSize, numericMaxBlocks);
// opts: { surfaceId, firstYear, symbol, cutoff, iso, onProgress, signal } -> the new surface's id, or null
// TASKS.csv #3674 — opts.select: { mode: "year" | "list" | "date", ... } (lib/viewer/domainUpdate.js newHoleIds) in place of firstYear; opts.priorWidthM and opts.newReachM (m) set the
// prior's width and the new data's reach (blank: half a sample spacing and one spacing, as before)
export async function runDomainUpdate(ctx, { surfaceId, firstYear, select = null, priorWidthM = null, newReachM = null, symbol, cutoff, iso = 0.5, onProgress = null, signal = null, job = null /* TASKS.csv #3953 — the store's project job: the new surface goes to the project it was run in */ }) {
  const { implicitSurfaces, implicitMeshesRef, implicitGroupRef, originRef, setImplicitSurfaces, setNotices, assays, assayElements, collars, survey, desurveyMethod } = ctx;
  const say = (n) => setNotices((p) => [...p, n]);
  const surf = (implicitSurfaces || []).find((s) => s.id === surfaceId), mesh = implicitMeshesRef.current?.[surfaceId];
  if (!surf || !mesh?.geometry) { say(errorNotice(tr("Pick an imported domain to update."))); return null; }
  if (!Number.isFinite(cutoff)) { say(errorNotice(tr("Enter a cut-off first."))); return null; }
  const o = originRef.current, sp = mesh.geometry.getAttribute("position").array, nv = sp.length / 3;
  // the old mesh in world coordinates (the scene's frame: x = east - origin, y = elevation - origin, z = -(north - origin))
  const P = new Float64Array(nv * 3);
  for (let i = 0; i < nv; i++) { P[3 * i] = sp[3 * i] + o.x; P[3 * i + 1] = o.y - sp[3 * i + 2]; P[3 * i + 2] = sp[3 * i + 1] + o.z; }
  const ix = mesh.geometry.getIndex(), I = ix ? Uint32Array.from(ix.array) : Uint32Array.from({ length: nv }, (_, i) => i);
  // the composites, placed; the new holes and the older ones
  const units = Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit])), unit = units[symbol] || "ppm", unitL = gradeUnitLabel(symbol, unit);
  const rows = ctx.numericIncludeQAQC ? assays : excludeQAQC(assays || []);
  const comps = compositeDownhole(rows, symbol, unit, units, { length: ctx.numericCompositeLength || 2, minCoverage: ctx.numericMinCoverage ?? 0.5 });
  const { points } = samplePointsFromIntervals(comps, collars, survey, desurveyHole, desurveyMethod);
  const sel = select || { mode: "year", year: firstYear }, selIds = new Set(newHoleIds(collars, sel));
  const S = sampleSpacing(points)?.medianM;
  if (!(S > 0)) { say(errorNotice(tr("The holes' samples are too few to tell their spacing: no update."))); return null; }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < P.length; i += 3) { if (P[i] < x0) x0 = P[i]; if (P[i] > x1) x1 = P[i]; if (P[i + 1] < y0) y0 = P[i + 1]; if (P[i + 1] > y1) y1 = P[i + 1]; if (P[i + 2] < z0) z0 = P[i + 2]; if (P[i + 2] > z1) z1 = P[i + 2]; }
  const pad = 2 * S, bounds = { xmin: x0 - pad, xmax: x1 + pad, ymin: y0 - pad, ymax: y1 + pad, zmin: z0 - pad, zmax: z1 + pad };
  const inB = (q) => q.x > bounds.xmin && q.x < bounds.xmax && q.y > bounds.ymin && q.y < bounds.ymax && q.z > bounds.zmin && q.z < bounds.zmax;
  const isNew = (q) => selIds.has(q.hole_id);
  const newNear = points.filter((q) => isNew(q) && inB(q)), oldNear = points.filter((q) => !isNew(q) && inB(q));
  const newHoles = [...selIds], newHolesNear = new Set(newNear.map((q) => q.hole_id));
  if (!newNear.length) { say(sel.mode === "year" ? notice("None of the {n} hole(s) drilled from {year} on has {symbol} composites within {d} m of \"{name}\": nothing to update.", { n: newHoles.length, year: firstYear, symbol, d: Math.round(pad), name: surf.name }) : notice("None of the {n} chosen hole(s) has {symbol} composites within {d} m of \"{name}\": nothing to update.", { n: newHoles.length, symbol, d: Math.round(pad), name: surf.name })); return null; }
  // the cell: the Grade shell pane's, within its block budget
  const budget = Number(ctx.numericMaxBlocks) || MAX_BLOCKS;
  let cell = Math.max(1, Number(ctx.numericCellSize) || 10);
  if (gridBlockCount(bounds, cell) > budget) cell = cellToFit(bounds, budget, cell);
  const xyz = (q) => ({ x: q.x, y: q.y, z: q.z }), full = (q) => ({ x: q.x, y: q.y, z: q.z, value: q.value, length: q.length, hole_id: q.hole_id });
  const atCut = [...newNear, ...oldNear].filter((q) => q.value >= cutoff).map((q) => ({ ...xyz(q), hole_id: q.hole_id }));
  // TASKS.csv #3876 (#3674) — the new holes' indicator searched along the domain's own plane (an ellipsoid of the 2-spacing sphere's volume), or the
  // sphere when the domain has no clear plane
  const plane = domainPlaneSearch(P, 2 * S);
  const t0 = performance.now();
  let g;
  try {
    g = await runEstimation("dense", indicatorPoints(newNear, cutoff), {
      bounds, cellSize: { dx: cell, dy: cell, dz: cell }, method: "idw2", searchRadius: plane ? plane.majorM : 2 * S, minSamples: 1, maxSamples: 16, minHoles: 1, maxBlocks: budget,
      ...(plane ? { trend: { basis: plane.basis, scales: plane.scales } } : {}), // #3876 (#3674)
      post: {
        iso, closeOutside: true, ground: null, inShellPoints: [], farPoints: null,
        update: { positions: P, indices: I, widthM: priorWidthM > 0 ? priorWidthM : S / 2, influenceM: newReachM > 0 ? newReachM : S, newPoints: newNear.map(xyz), reportPoints: newNear.map(full), refPoints: oldNear.map(full), cutoff, nearM: S },
        // a part of the old domain is kept by its own composites at the cut-off (one hole is enough: the domain was drawn round it)
        envelope: { clean: { keepPoints: atCut, keepHoles: 1 }, targetTriangles: ENVELOPE_TARGET_TRIANGLES, smooth: { iterations: 10 }, gradePoints: [...newNear, ...oldNear].map(full), cutoff },
      },
    }, { onProgress, signal });
  } catch (e) { if (!e?.cancelled) say(errorNotice(tr("Updating \"{name}\" failed: {v}", { name: surf.name, v: e?.message || e }))); return null; }
  if (job && !(await landed(job))) return null; // TASKS.csv #3953 — its project closed: nothing lands; in another tab: when that tab is shown
  const post = g.post, rep = post?.update;
  if (!post || !rep || !post.faces?.length) { say(errorNotice(tr("Updating \"{name}\" gave no surface.", { name: surf.name }))); return null; }
  const mc = meshOfPost(post), pos = new Float32Array(mc.vertices.length * 3);
  mc.vertices.forEach((v, i) => { pos[3 * i] = v[0] - o.x; pos[3 * i + 1] = v[2] - o.z; pos[3 * i + 2] = -(v[1] - o.y); });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(mc.faces.flat());
  geo.computeVertexNormals();
  const out = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x4f9fd8, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
  const vol = computeMeshVolume(geo);
  const name = `${surf.name.replace(/ \(imported\)$/, "")} updated with ${sel.mode === "list" ? (newHoles.length === 1 ? "1 chosen hole" : `${newHoles.length} chosen holes`) : sel.mode === "date" ? `holes from ${sel.date}` : `holes from ${firstYear}`}`;
  out.userData = { tip: `${name}\n${mc.vertices.length} vertices, ${mc.faces.length} faces` };
  implicitGroupRef.current?.add(out);
  const id = `impl_${Date.now()}_domainupdate`;
  implicitMeshesRef.current[id] = out;
  const pct = (v) => (v == null ? "—" : Math.round(100 * v));
  const holes = rep.holes.filter((h) => h.status !== "away"), count = (s) => holes.filter((h) => h.status === s).length;
  const params = {
    tool: "domain update", from: surf.name, element: symbol, unit, cutoff, probability: iso, ...(sel.mode === "year" ? { holesFromYear: firstYear } : sel.mode === "date" ? { holesFromDate: sel.date, dateField: sel.field } : { holesFromList: newHoles }),
    newHoles: newHoles.length, newHolesNear: newHolesNear.size, newComposites: newNear.length, olderComposites: oldNear.length,
    indicatorSearch: plane ? { along: "the domain's own plane", dip: plane.trend.dip, dipAzimuth: plane.trend.dipAzimuth, axesM: plane.axesM } : { sphereM: Math.round(2 * S) }, // #3876 (#3674)
    sampleSpacingM: Math.round(S * 10) / 10, priorWidthM: Math.round((priorWidthM > 0 ? priorWidthM : S / 2) * 10) / 10, newDataInfluenceM: Math.round((newReachM > 0 ? newReachM : S) * 10) / 10, cellSizeM: cell,
    reference: rep.reference, holes: holes.map((h) => ({ hole_id: h.hole_id, status: h.status, insideShare: h.insideShare, outsideShare: h.outsideShare, composites: h.n })),
    atCutOutside: rep.atCutOutside, belowInside: rep.belowInside,
    volumeM3: { old: Math.round(rep.oldM3), new: Math.round(rep.newM3), added: Math.round(rep.addedM3), removed: Math.round(rep.removedM3), mesh: vol.watertight ? Math.round(vol.volumeM3) : null },
    seconds: Math.round((performance.now() - t0) / 100) / 10, generatedAt: new Date().toISOString(),
  };
  setImplicitSurfaces((p) => [...p, { id, name, visible: true, vertexCount: mc.vertices.length, faceCount: mc.faces.length, type: "mineralization_envelope", relationships: [], closure: "natural", params }]);
  if (sel.mode !== "year") say(notice("Updated \"{name}\" with {what} ({near} near it): {agree} agree with it, {outside} have more grade just outside it than its own holes, {weaker} are weaker inside it, {dis} both. Volume {old} -> {new} Mm³: {add} added, {rem} removed.", {
    name: surf.name, what: sel.mode === "list" ? tr("the {n} chosen hole(s)", { n: newHoles.length }) : tr("the {n} hole(s) dated {date} or later", { n: newHoles.length, date: sel.date }), near: newHolesNear.size, agree: count("agrees"), outside: count("grade outside"), weaker: count("weaker inside"), dis: count("disagrees"),
    old: (rep.oldM3 / 1e6).toFixed(1), new: (rep.newM3 / 1e6).toFixed(1), add: (rep.addedM3 / 1e6).toFixed(2), rem: (rep.removedM3 / 1e6).toFixed(2) }));
  else say(notice("Updated \"{name}\" with the {n} hole(s) drilled from {year} on ({near} near it): {agree} agree with it, {outside} have more grade just outside it than its own holes, {weaker} are weaker inside it, {dis} both. {a} composite(s) at or above {cutoff} {unit} lie just outside it ({am} m), {b} below it inside it ({bm} m). Volume {old} -> {new} Mm³: {add} added, {rem} removed. Its own holes: {ri} % at or above inside it, {ro} % just outside.", {
    name: surf.name, n: newHoles.length, year: firstYear, near: newHolesNear.size, agree: count("agrees"), outside: count("grade outside"), weaker: count("weaker inside"), dis: count("disagrees"),
    a: rep.atCutOutside.n, am: Math.round(rep.atCutOutside.m), b: rep.belowInside.n, bm: Math.round(rep.belowInside.m), cutoff, unit: unitL,
    old: (rep.oldM3 / 1e6).toFixed(1), new: (rep.newM3 / 1e6).toFixed(1), add: (rep.addedM3 / 1e6).toFixed(2), rem: (rep.removedM3 / 1e6).toFixed(2), ri: pct(rep.reference.insideShare), ro: pct(rep.reference.outsideShare) }));
  if (plane) say(notice("The new holes' grade was spread along \"{name}\"'s own plane (dip {dip}° towards {az}°): {a} x {b} x {c} m, the volume of a {r} m sphere.", { name: surf.name, dip: Math.round(plane.trend.dip), az: Math.round(plane.trend.dipAzimuth), a: Math.round(plane.axesM[0]), b: Math.round(plane.axesM[1]), c: Math.round(plane.axesM[2]), r: Math.round(2 * S) })); // #3876 (#3674)
  if (holes.length) say(notice("The holes against \"{name}\": {list}.", { name: surf.name, list: holes.slice(0, 12).map((h) => tr("{hole} {status} (inside {i} %, just outside {o} %)", { hole: h.hole_id, status: tr(h.status), i: pct(h.insideShare), o: pct(h.outsideShare) })).join("; ") + (holes.length > 12 ? "; …" : "") }));
  return id;
}
