// TASKS.csv #548 — alpha/beta picks re-derived when the hole's survey / collar changes.
import test from "node:test";
import assert from "node:assert/strict";
import { reorientAlphaBetaPicks, orientFromAlphaBeta, alphaBetaRef } from "../src/lib/coreOrientation.js";
import { surveyAzimuthDipAt } from "../src/lib/desurvey.js";

const collar = { hole_id: "H1", x: 0, y: 0, z: 0, azimuth: 0, dip: 60, depth: 300 };
const pick = (extra) => ({ hole_id: "H1", depth: 100, alpha: 40, beta: 120, ...extra });
const oldO = orientFromAlphaBeta({ alphaDeg: 40, betaDeg: 120, holeAzDeg: 0, holeDipDeg: 60 });

test("#548 a derived pick follows a new survey; logged and calculator picks do not", () => {
  const st = [
    pick({ dip: oldO.dipDeg, azimuth: oldO.dipDirDeg, orientedFrom: "alpha/beta, bottom-of-hole line" }), // pre-#548 project: string only
    pick({ dip: 10, azimuth: 20 }), // logged
    pick({ dip: 30, azimuth: 40, orientedFrom: "alpha/beta calibrated on REF 100°/50°" }), // calculator
  ];
  const survey = new Map([["H1", [{ hole_id: "H1", depth: 0, azimuth: 90, dip: 60 }, { hole_id: "H1", depth: 300, azimuth: 90, dip: 60 }]]]);
  const r = reorientAlphaBetaPicks(st, () => collar, survey, null, surveyAzimuthDipAt);
  const want = orientFromAlphaBeta({ alphaDeg: 40, betaDeg: 120, holeAzDeg: 90, holeDipDeg: 60 });
  assert.equal(r.derived, 1); assert.equal(r.changed, 1);
  assert.ok(Math.abs(r.rows[0].dip - want.dipDeg) < 1e-9 && Math.abs(r.rows[0].azimuth - want.dipDirDeg) < 1e-9);
  assert.equal(r.rows[0].abRef, "bottom");
  assert.ok(r.maxChangeDeg > 30);
  assert.equal(r.rows[1], st[1]); assert.equal(r.rows[2], st[2]);
});

test("#548 unchanged survey -> same array; other holes untouched; failures reported, orientation kept", () => {
  const st = [pick({ dip: oldO.dipDeg, azimuth: oldO.dipDirDeg, abRef: "bottom" })];
  const same = new Map([["H1", [{ hole_id: "H1", depth: 0, azimuth: 0, dip: 60 }]]]);
  assert.equal(reorientAlphaBetaPicks(st, () => collar, same, null, surveyAzimuthDipAt).rows, st);
  assert.equal(reorientAlphaBetaPicks(st, () => collar, new Map(), new Set(["OTHER"]), surveyAzimuthDipAt).derived, 0);
  const vertical = new Map([["H1", [{ hole_id: "H1", depth: 0, azimuth: 0, dip: 90 }]]]);
  const f = reorientAlphaBetaPicks(st, () => ({ ...collar, dip: 90 }), vertical, null, surveyAzimuthDipAt);
  assert.equal(f.changed, 0); assert.equal(f.failed.length, 1); assert.equal(f.rows, st);
  assert.equal(alphaBetaRef({ orientedFrom: "alpha/beta, top-of-hole line" }), "top");
});

test("#548 a pick imported before its survey is oriented when the survey arrives", () => {
  const st = [pick({ abRef: "top" })]; // failed at import: no dip yet
  const survey = new Map([["H1", [{ hole_id: "H1", depth: 0, azimuth: 45, dip: 70 }]]]);
  const r = reorientAlphaBetaPicks(st, () => collar, survey, new Set(["H1"]), surveyAzimuthDipAt);
  const want = orientFromAlphaBeta({ alphaDeg: 40, betaDeg: 120, holeAzDeg: 45, holeDipDeg: 70, useTop: true });
  assert.deepEqual([r.changed, r.newlyOriented], [1, 1]);
  assert.ok(Math.abs(r.rows[0].dip - want.dipDeg) < 1e-9);
  assert.equal(r.rows[0].orientedFrom, "alpha/beta, top-of-hole line");
});
