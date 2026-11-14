// TASKS.csv #3438 — the Level's depth-below-collar band; #3435 — the end-in-ore element kept; #3432 — spacing from the holes Area
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { inBand, levelSet, hasDepthBand } from "../src/lib/evidenceSources.js";

test("a depth band is metres vertically below the hole's collar", () => {
  const t = [{ z: 1000 }, { z: 900 }];
  const lv = { zMin: null, zMax: null, dMin: 20, dMax: 50 };
  assert.ok(levelSet(lv) && hasDepthBand(lv));
  assert.equal(inBand({ z: 990 }, lv, t), false); // 10 m down
  assert.equal(inBand({ z: 970 }, lv, t), true);  // 30 m down
  assert.equal(inBand({ z: 940 }, lv, t), false); // 60 m down
  // two holes with collars 500 m apart read the same depth
  assert.equal(inBand({ z: 1470 }, lv, [{ z: 1500 }]), true);
});
test("no depth band: the elevation band alone decides; an RL band still applies", () => {
  assert.equal(inBand({ z: 5 }, { zMin: 0, zMax: 10 }, [{ z: 100 }]), true);
  assert.equal(inBand({ z: 5 }, { zMin: 0, zMax: 10, dMin: 0, dMax: 50 }, [{ z: 100 }]), false);
  assert.equal(levelSet({}), false);
});
test("source pins: kept end-in-ore state, holes Area spacing, Drilled holes pick", () => {
  const src = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src("../src/components/EndInOreList.jsx"), /let kept = \{ symbol: "", cut: "" \}/);
  const p = src("../src/components/EvidenceOverlayPane.jsx");
  assert.match(p, /drilledSiteSpacing\(spacingCollars\)/);
  assert.match(p, /hpick/);
  assert.match(p, /Depth below collar \(m\)/);
});
