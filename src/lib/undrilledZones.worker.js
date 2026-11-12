// TASKS.csv #2258 (review #2174, WA lode gold) — Undrilled zones off the UI thread: a 727 ms freeze on a 1.07 Mm³ shell at 2.5 m blocks,
// and several seconds on a large shell at the 2 M block budget. The ground goes as data (the terrain grid, or the collars collarGround
// interpolates between), never as a function.
import { undrilledZones } from "./undrilledZones.js";
import { collarGround } from "./pitShell.js";
import { terrainGroundAt } from "./viewer/geomath.js";

self.onmessage = (e) => {
  try {
    const { args, ground } = e.data;
    const groundAt = ground?.terrain ? (x, y) => terrainGroundAt(ground.terrain, x, y) : ground?.collars ? collarGround(ground.collars) : null;
    const r = undrilledZones({ ...args, groundAt });
    self.postMessage({ result: r }, r?.block?.ids?.buffer ? [r.block.ids.buffer] : []);
  } catch (err) {
    self.postMessage({ failed: String(err?.message || err) });
  }
};
