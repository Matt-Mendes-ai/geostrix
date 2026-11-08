// TASKS.csv #2038 (review #2013, Woodjam) — looking up from below, the compass ring is mirrored north-south (as the scene and the axis
// gizmo are) and says 'from below'.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const s = readFileSync(new URL("../src/components/CompassRose.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("the ring sits in a flip group mirrored on the screen's vertical below the horizon", () => {
  assert.match(s, /const flipGroup = new THREE\.Group\(\);\n  flipGroup\.add\(ringGroup\);\n  navScene\.add\(flipGroup\);/);
  assert.match(s, /flipGroup\.scale\.z = lookingUpFromBelow \? -1 : 1;/);
  assert.match(s, /belowLabel\.visible = lookingUpFromBelow;/);
  assert.match(s, /navCamera\.up\.set\(0, 0, -1\);/, "z is the screen's vertical for the nav camera");
});
