// TASKS.csv #865 — the explicit surface worker gives the same result as the direct fit (terrain cut included) and
// throws in the interface language it was sent. Its message handler is driven here with a stand-in for `self`.
import test from "node:test";
import assert from "node:assert/strict";
import { fitExplicitSurface } from "../src/lib/explicitSurface.js";
import { sampleTerrainElevation } from "../src/lib/viewer/geomath.js";
import { useDictionary as setDictionary } from "../src/lib/i18n.js";

const posted = [];
globalThis.self = { postMessage: (m) => posted.push(m) };
await import("../src/lib/explicitSurface.worker.js");
// #957: a fit is answered on the next tick (the worker skips fits a newer one superseded)
const send = async (m) => { posted.length = 0; globalThis.self.onmessage({ data: m }); await new Promise((r) => setTimeout(r, 20)); return posted[0]; };

const picks = [];
for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) picks.push({ x: i * 50, y: j * 50, z: 1000 - 0.2 * i * 50 + 8 * Math.sin(j), src: "pick" });
// a terrain over the picks, rising to the east so the cut removes part of the surface
const gridW = 31, gridH = 31, bbox = [-100, -100, 400, 400];
const elevations = new Float32Array(gridW * gridH);
for (let r = 0; r < gridH; r++) for (let c = 0; c < gridW; c++) elevations[r * gridW + c] = 990 + 0.1 * (bbox[0] + (c / (gridW - 1)) * 500);
const terrain = { bbox, gridW, gridH, elevations };

test("#865 the worker's fit equals the direct fit, with the terrain cut", async () => {
  await send({ type: "terrain", terrain });
  const m = await send({ id: 1, points: picks, opts: { resolution: 40, frame: "auto" }, cut: true });
  assert.equal(m.id, 1);
  assert.ok(!m.failed, m.failed);
  const groundAt = (x, y) => (x < bbox[0] || x > bbox[2] || y < bbox[1] || y > bbox[3] ? NaN : sampleTerrainElevation(terrain, x, y));
  const direct = fitExplicitSurface(picks, { resolution: 40, frame: "auto", groundAt });
  assert.ok(direct.groundCut > 0, "the terrain cut something");
  assert.deepEqual(Array.from(m.res.indices), Array.from(direct.indices));
  assert.deepEqual(Array.from(m.res.positions), Array.from(direct.positions));
  assert.equal(m.res.quality.looRmsM, direct.quality.looRmsM);
});

test("#865 an error comes back in the language the worker was sent", async () => {
  await send({ type: "lang", code: "es", dict: { "An explicit surface needs at least 3 points: pick contacts in 3D, or draw lines tagged with its name on sections.": "Una superficie explícita necesita al menos 3 puntos." } });
  const m = await send({ id: 2, points: picks.slice(0, 2), opts: {}, cut: false });
  assert.equal(m.failed, "Una superficie explícita necesita al menos 3 puntos.");
  setDictionary("en", null);
});
