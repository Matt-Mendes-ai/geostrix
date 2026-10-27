// TASKS.csv #824 — digitizing a section image in the 3D view: the plane of the image, a click ray meeting it, the camera
// square on to it (not mirrored), polylines densified for the explicit surface
import test from "node:test";
import assert from "node:assert/strict";
import { imagePlane, rayPlane, imageCoords, facingCamera, densify3 } from "../src/lib/sectionDigitize3d.js";

// a vertical section image along azimuth 60°, 800 m long, from 1200 m down to 700 m elevation
const az = (60 * Math.PI) / 180, E0 = 500000, N0 = 6000000;
const along = (m) => [E0 + m * Math.sin(az), N0 + m * Math.cos(az)];
const corners = [[...along(0), 1200], [...along(800), 1200], [...along(800), 700], [...along(0), 700]];

test("#824 the image's plane, and a click ray meeting it lands on the section", () => {
  const P = imagePlane(corners);
  assert.ok(Math.abs(P.w - 800) < 1e-6 && Math.abs(P.h - 500) < 1e-6);
  assert.ok(Math.abs(P.n[2]) < 1e-12, "a vertical section has a horizontal normal");
  // a ray from a camera off the section, aimed at the point 300 m along, 950 m elevation
  const target = [...along(300), 950];
  const eye = [target[0] + 400 * P.n[0] + 50, target[1] + 400 * P.n[1] - 30, 1300];
  const dir = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  const hit = rayPlane(eye, dir, P);
  assert.ok(Math.hypot(hit[0] - target[0], hit[1] - target[1], hit[2] - target[2]) < 1e-6);
  const c = imageCoords(hit, P);
  assert.ok(Math.abs(c.s - 300 / 800) < 1e-9 && Math.abs(c.t - 250 / 500) < 1e-9);
  assert.equal(rayPlane(eye, [P.u[0], P.u[1], P.u[2]], P), null, "a ray parallel to the section never meets it");
  assert.equal(rayPlane(eye, dir.map((v) => -v), P), null, "nor one pointing away");
});

test("#824 the camera faces the image square on, reading left to right, and the image fits", () => {
  const P = imagePlane(corners);
  const cam = facingCamera(P, { fovDeg: 45, aspect: 1.6 });
  assert.ok(Math.abs(cam.phi - Math.PI / 2) < 1e-9, "level");
  // the eye direction in scene axes (E, Z, -N) is along the normal
  const d = [Math.sin(cam.phi) * Math.sin(cam.theta), Math.cos(cam.phi), Math.sin(cam.phi) * Math.cos(cam.theta)];
  const nScene = [P.n[0], P.n[2], -P.n[1]];
  assert.ok(Math.abs(Math.abs(d[0] * nScene[0] + d[1] * nScene[1] + d[2] * nScene[2]) - 1) < 1e-9, "square on");
  const right = [d[2], 0, -d[0]]; // up x d
  const uScene = [P.u[0], P.u[2], -P.u[1]];
  assert.ok(right[0] * uScene[0] + right[2] * uScene[2] > 0.99, "the image's left edge is on the left of the screen");
  const halfH = cam.radius * Math.tan((45 * Math.PI) / 360);
  assert.ok(halfH >= 250 && halfH * 1.6 >= 400, "the whole image is in view");
  assert.deepEqual(cam.target.map(Math.round), [Math.round((corners[0][0] + corners[2][0]) / 2), Math.round((corners[0][1] + corners[2][1]) / 2), 950]);
});

test("#824 drawn polylines are densified for the surface, their own vertices kept", () => {
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }, { x: 30, y: 0, z: -5 }];
  const d = densify3(pts, 10);
  assert.deepEqual(d.map((p) => p.x), [0, 10, 20, 30, 30]);
  for (const p of pts) assert.ok(d.some((q) => q.x === p.x && q.z === p.z));
});

test("#824 the apparent dip of a drawn line follows its overall trend", async () => {
  const { apparentDip, medianApparentDip } = await import("../src/lib/sectionDigitize3d.js");
  const flat = Array.from({ length: 30 }, (_, i) => ({ x: i * 10, y: 0, z: 1000 + 30 * Math.sin(i / 3) })); // wiggly, flat overall
  assert.ok(apparentDip(flat) < 15, `${apparentDip(flat)}`);
  const steep = Array.from({ length: 30 }, (_, i) => ({ x: i * 2, y: 0, z: 1000 - i * 8 }));
  assert.ok(Math.abs(apparentDip(steep) - (Math.atan(4) * 180) / Math.PI) < 1e-6);
  assert.ok(medianApparentDip([flat, flat, steep]) < 15);
});

test("#824 a forced frame: elevation over the map for contacts on two nearby, nearly parallel sections", async () => {
  const { surfaceFrame } = await import("../src/lib/explicitSurface.js");
  // two 250 m sections 40 m apart, a contact wiggling 90 m up and down along each: the best-fit plane stands on edge
  const pts = [];
  for (const off of [0, 40]) for (let i = 0; i <= 25; i++) pts.push({ x: i * 10, y: off, z: 1000 + 45 * Math.sin(i / 2.5) });
  assert.equal(surfaceFrame(pts).steep, true, "automatic on its own picks a steep plane here");
  assert.equal(surfaceFrame(pts, { frame: "map" }).steep, false);
  assert.equal(surfaceFrame(pts, { frame: "plane" }).steep, true);
});

test("#825 snap targets: logged contacts of a hole near the section (moved onto it) and hole crossings", async () => {
  const { imagePlane, sectionSnapTargets, imageCoords } = await import("../src/lib/sectionDigitize3d.js");
  const P = imagePlane(corners);
  // a hole drilled down the section 5 m off its plane, 300 m along, collar 1150 m, straight down 400 m
  const [e, n] = along(300);
  const mk = (id, dx, dy, dz) => ({ hole_id: id, pts: [{ md: 0 }, { md: 400 }], wx: [e + 5 * P.n[0], e + 5 * P.n[0] + dx], wy: [n + 5 * P.n[1], n + 5 * P.n[1] + dy], wz: [1150, 1150 + dz] });
  const inPlane = mk("H1", 0, 0, -400);
  const litho = [{ hole_id: "H1", from: 0, to: 120, value: "AND" }, { hole_id: "H1", from: 120, to: 260, value: "SED" }, { hole_id: "H1", from: 260, to: 400, value: "SED" }];
  // a hole crossing the section: from 100 m on one side to 100 m on the other, through 500 m along at 1000 m
  const [e2, n2] = along(500);
  const cross = { hole_id: "H2", pts: [{ md: 0 }, { md: 200 }], wx: [e2 + 100 * P.n[0], e2 - 100 * P.n[0]], wy: [n2 + 100 * P.n[1], n2 - 100 * P.n[1]], wz: [1000, 1000] };
  const T = sectionSnapTargets(P, [inPlane, cross], litho, { maxOffM: 15 });
  const contacts = T.filter((t) => t.kind === "contact");
  assert.equal(contacts.length, 1, "AND|SED at 120 m only (SED|SED is no contact)");
  const c = imageCoords([contacts[0].p.x, contacts[0].p.y, contacts[0].p.z], P);
  assert.ok(Math.abs(c.s - 300 / 800) < 1e-9 && Math.abs(contacts[0].p.z - 1030) < 1e-9, "over the logged depth, at its place along the section");
  // #950 — the contact where it was logged: on the hole, 5 m off the plane (said), not moved onto it
  assert.ok(Math.abs(contacts[0].offM - 5) < 1e-9, `off ${contacts[0].offM}`);
  assert.ok(Math.abs(contacts[0].p.x - (e + 5 * P.n[0])) < 1e-9 && Math.abs(contacts[0].p.y - (n + 5 * P.n[1])) < 1e-9, "the hole's real position");
  assert.match(contacts[0].label, /H1 AND \| SED @ 120\.0 m/);
  const x = T.find((t) => t.kind === "crossing" && t.hole === "H2");
  assert.ok(x && Math.abs(imageCoords([x.p.x, x.p.y, x.p.z], P).s - 500 / 800) < 1e-9 && Math.abs(x.md - 100) < 1e-9);
  assert.equal(sectionSnapTargets(P, [mk("H3", 0, 0, -400)], litho.map((r) => ({ ...r, hole_id: "H3" })), { maxOffM: 2 }).filter((t) => t.kind === "contact").length, 0, "too far off the section");
});

test("#825 Shift: the segment turns to horizontal / vertical / 45° on the image", async () => {
  const { imagePlane, constrainOnImage, imageCoords } = await import("../src/lib/sectionDigitize3d.js");
  const P = imagePlane(corners);
  const pt = (s, t) => { const q = [P.o[0] + P.u[0] * s * P.w + P.v[0] * t * P.h, P.o[1] + P.u[1] * s * P.w + P.v[1] * t * P.h, P.o[2] + P.u[2] * s * P.w + P.v[2] * t * P.h]; return { x: q[0], y: q[1], z: q[2] }; };
  const prev = pt(0.5, 0.5);
  const h = constrainOnImage(prev, pt(0.6, 0.51), P); // nearly level -> level
  assert.ok(Math.abs(h.z - prev.z) < 1e-9);
  const v = constrainOnImage(prev, pt(0.505, 0.7), P); // nearly vertical -> vertical
  const cv = imageCoords([v.x, v.y, v.z], P);
  assert.ok(Math.abs(cv.s - 0.5) < 1e-9 && cv.t > 0.6);
});
