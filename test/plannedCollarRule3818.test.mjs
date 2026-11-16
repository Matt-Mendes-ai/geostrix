// TASKS.csv #3818 (Scottie Gold review) — with no terrain 'A vertical hole above the target' printed 'collar at 1208.4 m (the ground interpolated between the nearest
// collars)' from ONE pad 371 m away (relief 526 m), where the collar boxes for the same E / N refused (#3335: over three site spacings), and 'Solve collar for this
// dip/azimuth' did the same 256 m out. One rule now (judgedCollarZ), the distance in z_source. Synthetic collars on 63 m spacing.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { judgedCollarZ, collarFillAt } from "../src/lib/collarFill.js";
import { collarGround } from "../src/lib/collarGround.js";
import { drilledSiteSpacing } from "../src/lib/evidenceSources.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// a 4 x 4 grid of pads 63 m apart on a slope, the highest at 1208.35 m
const collars = [];
for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) collars.push({ hole_id: `H${i}${j}`, x: 433000 + i * 63, y: 6233000 + j * 63, z: 1000 + i * 40 + j * 29.45 });
const cg = collarGround(collars), spacing = drilledSiteSpacing(collars);

test("the collar boxes and the vertical-hole line give the same answer: nothing past three site spacings", () => {
  assert.ok(Math.abs(spacing - 63) < 1, `spacing ${spacing}`);
  const far = { x: 433000 + 3 * 63 + 371, y: 6233000 + 3 * 63 }; // 371 m beyond the highest pad
  const box = collarFillAt(cg, spacing, far.x, far.y), line = judgedCollarZ(null, cg, spacing, far.x, far.y);
  assert.equal(box.z, null); assert.equal(box.far, true);
  assert.equal(line.far, true, "the vertical-hole line refuses where the boxes refuse");
  assert.equal(line.z, null);
  assert.ok(Math.abs(line.f.nearestM - 371) < 1);
  assert.ok(Number.isFinite(cg(far.x, far.y)), "the raw ground still has a number there (what the line printed before)");
});

test("past one spacing: to the metre with the distance and the collars' range in z_source; near: to the tenth", () => {
  const mid = judgedCollarZ(null, cg, spacing, 433000 + 3 * 63 + 100, 6233000 + 60);
  assert.equal(mid.far, false); assert.equal(mid.f.coarse, true);
  assert.equal(mid.z, Math.round(mid.z), "to the metre");
  assert.match(mid.source, /^the ground interpolated between the nearest collars \(no terrain; nearest collar \d+ m away, collars used \d+ to \d+ m, to the metre\)$/);
  const near = judgedCollarZ(null, cg, spacing, 433000 + 30, 6233000 + 30);
  assert.equal(near.f.coarse, false);
  assert.match(near.source, /nearest collar \d+ m away/);
  const ter = judgedCollarZ(() => 812.34, cg, spacing, 0, 0);
  assert.deepEqual([ter.z, ter.source, ter.far], [812.34, "the terrain", false], "a terrain is read as before");
  assert.equal(judgedCollarZ(null, null, spacing, 0, 0), null);
});

test("wiring: the vertical-hole line and 'Solve collar' go through the rule; the far case offers the hole with a blank Elev; z_source carries the distance", () => {
  const p = read("../src/components/PlannedHoleParts.jsx");
  assert.match(p, /const j = judgedCollarZ\(groundAt, collarZ, siteSpacing, Number\(target\.x\), Number\(target\.y\)\);/);
  assert.match(p, /setDraft\(\(p\) => \(\{ \.\.\.withTargetXY\(p\), z: "", length: "" \}\)\)/);
  assert.match(p, /setZSource\(groundAt \? "the terrain at the target's E \/ N" : j\.source/);
  assert.match(p, /let judged = r && r\.source === "terrain" && !groundAt && !underground \? judgedCollarZ\(null, collarZ, siteSpacing, r\.x, r\.y\) : null;/);
  assert.match(p, /if \(judged\?\.far\) \{/);
  assert.match(p, /`solved on \$\{judged \? judged\.source : /);
  assert.doesNotMatch(p, /Number\.isFinite\(ground\(Number\(target\.x\), Number\(target\.y\)\)\)/, "the raw ground is not read for the vertical hole any more");
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${l}.json`))["A vertical hole above the target: no collar Elev offered, the nearest collar is {d} away, over three times the site spacing ({s} m). Type the Elev and the length, or load a terrain."], l);
});
