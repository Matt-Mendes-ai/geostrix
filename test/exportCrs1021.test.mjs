// TASKS.csv #1021 — an export that places data on Earth asks for the project CRS when it was never chosen
import test from "node:test";
import assert from "node:assert/strict";

const asked = [];
let answer = null;
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent: (e) => { asked.push(e.detail.reason); e.detail.resolve(answer); return true; } };
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
const { ensureExportCrs } = await import("../src/lib/projectCrsRequest.js");

test("#1021 a chosen CRS is used as is; a never-chosen one is asked for, and putting it off cancels the export", async () => {
  asked.length = 0;
  assert.equal(await ensureExportCrs({ epsg: 26910, crsSet: true }), 26910);
  assert.equal(await ensureExportCrs({ epsg: 26909 }), 26909); // a project from before #615: counts as chosen
  assert.equal(asked.length, 0);
  answer = 26910;
  assert.equal(await ensureExportCrs({ epsg: 3156, crsSet: false }), 26910);
  answer = null;
  assert.equal(await ensureExportCrs({ epsg: 3156, crsSet: false }), null);
  assert.equal(asked.length, 2);
  assert.match(asked[0], /never chosen/);
});
