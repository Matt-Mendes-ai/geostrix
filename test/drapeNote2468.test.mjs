// TASKS.csv #2468 — a picture placed above the highest collar says both what that does from the side (no hole top hidden) and from above
// (it covers the collars, boundaries and lines below it), and how to see them
import test from "node:test";
import assert from "node:assert/strict";
import { drapeElevationNote } from "../src/lib/drapeElevation.js";

test("#2468 the note says what the picture covers from above", () => {
  const t = drapeElevationNote({ source: "collars", above: 5, z: 352 });
  assert.match(t, /^Placed flat at 352 m, 5 m above the highest collar under it: from the side no hole top is hidden, but seen from above it covers the collars, boundaries and lines below it; lower Elev\. or its opacity on its card to see them\.$/);
});
