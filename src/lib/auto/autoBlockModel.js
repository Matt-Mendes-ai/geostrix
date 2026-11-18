// TASKS.csv #3898 — "Build it for me" for the block model (grade estimation): the block size, the box, the search and the samples per
// block, each from the project's own drilling, with the reason in words. See autoCommon.js for the shape of the result.
//
// input: { collars: [{ hole_id, x, y }], samples: [{ hole_id, x, y, z, from, to, value }] (desurveyed sample centres),
//          hasDensity: whether the project has densities (tonnes need them) }
// -> values: { blockSize: { x, y, z }, bounds: { minX, maxX, minY, maxY, minZ, maxZ }, searchRadius, minHoles, maxSamples, maxPerHole }
import { MAX_BLOCKS } from "../estimationMeta.js";
import { fmtNum } from "../i18n.js";
import { thin, fin, niceNumber, metres, siteSpacing, sampleLength, extentOf, holesOf, autoResult, because, say } from "./autoCommon.js";

export function autoBlockModel({ collars = [], samples = [], hasDensity = false } = {}) {
  const pts = thin(samples.filter((s) => fin(s.x) && fin(s.y) && fin(s.z)));
  const holes = holesOf(pts), { sites, spacing } = siteSpacing(collars);
  const problems = [], notes = [];
  if (sites < 3 || !spacing) problems.push(say("Too few drill sites ({n}): a block model needs holes at three or more places to estimate between them.", { n: sites }));
  if (holes < 3) problems.push(holes === 1 ? say("Samples in only one hole: a block model needs samples in three or more holes.") : say("Samples in only {n} holes: a block model needs samples in three or more holes.", { n: holes }));
  const len = sampleLength(pts);
  if (!len) problems.push(say("The samples have no From / To depths, so their length, and the block height, cannot be read."));
  if (problems.length) return autoResult(null, [], notes, problems);

  const reasons = [];
  // across: a quarter of the spacing between drill sites, so a block sits between holes, not on top of several
  let xy = niceNumber(spacing / 4);
  // height: about two sample lengths, never shorter than one sample and never taller than the block is wide
  let z = niceNumber(Math.max(len, Math.min(xy, 2 * len)));
  reasons.push(because("blockSize", "Blocks {x} x {x} m across: about a quarter of the median spacing between drill sites ({s} m).", { x: metres(xy), s: metres(spacing) }));
  reasons.push(because("blockSize", "Blocks {z} m high: about two sample lengths (the median sample is {l} m long), and no taller than they are wide.", { z: metres(z), l: metres(len) }));

  // the box: the samples' extent, half a drill spacing wider all round, one block deeper and higher
  const e = extentOf(pts), padXY = spacing / 2;
  const bounds = { minX: e.minX - padXY, maxX: e.maxX + padXY, minY: e.minY - padXY, maxY: e.maxY + padXY, minZ: e.minZ - z, maxZ: e.maxZ + z };
  reasons.push(because("bounds", "The model covers the samples and half a drill spacing ({p} m) beyond them, so the edge holes are inside it.", { p: metres(padXY) }));

  // the block count, kept under what one run can estimate: the blocks grow, in steps, until the box fits
  const count = () => Math.ceil((bounds.maxX - bounds.minX) / xy) * Math.ceil((bounds.maxY - bounds.minY) / xy) * Math.ceil((bounds.maxZ - bounds.minZ) / z);
  let grew = false;
  while (count() > MAX_BLOCKS) { xy = niceNumber(xy * 2); if (count() > MAX_BLOCKS) z = niceNumber(z * 2); grew = true; }
  if (grew) reasons.push(because("blockSize", "The blocks were enlarged to {x} x {x} x {z} m so the model stays under {max} blocks, what one run can estimate.", { x: metres(xy), z: metres(z), max: fmtNum(MAX_BLOCKS) }));

  // the search: one and a half drill spacings, so a block between holes reaches the holes around it (a whole number of blocks)
  const searchRadius = +(Math.ceil((1.5 * spacing) / xy) * xy).toPrecision(6);
  reasons.push(because("searchRadius", "Search radius {r} m: one and a half drill spacings, so a block between holes reaches the holes around it.", { r: metres(searchRadius) }));
  const minHoles = 2;
  reasons.push(because("minHoles", "At least two holes for each block, so no block is estimated from one hole alone."));
  // per hole: the samples within about two block heights; in all: that many from each hole the radius can reach
  const maxPerHole = Math.max(2, Math.ceil((2 * z) / len));
  const holesInReach = Math.max(2, Math.round((Math.PI * searchRadius * searchRadius) / (spacing * spacing)));
  const maxSamples = Math.min(64, holesInReach * maxPerHole);
  reasons.push(because("maxSamples", "Up to {k} samples from each hole (those within about two block heights) and {n} in all: about {h} holes lie within the search radius.", { k: maxPerHole, n: maxSamples, h: holesInReach }));

  if (!hasDensity) notes.push(say("The project has no density: the blocks get grades, but no tonnes. Add a density log or a density per unit for tonnes."));
  return autoResult({ blockSize: { x: xy, y: xy, z }, bounds, searchRadius, minHoles, maxSamples, maxPerHole }, reasons, notes, problems);
}
