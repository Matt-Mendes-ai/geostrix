// TASKS.csv #701 — a class added above the seeded ones is darker, on the element's own hue
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedBreaks, nextDarkerClassColor, labLightness, labHueDeg } from "../src/lib/colorRamp.js";

test("Add class continues the ramp: darker than the last class, same hue", () => {
  for (const base of ["#d4a017", "#c0392b", "#2e86c1", "#7d3c98", "#808080"]) {
    const seeded = seedBreaks({ min: 0, max: 10 }, base);
    const last = seeded[seeded.length - 1].color;
    const next = nextDarkerClassColor(base, last);
    const want = Math.max(24, labLightness(last) - 10); // 10 L* darker, or the ramp's floor
    assert.ok(labLightness(next) < labLightness(last) && Math.abs(labLightness(next) - want) < 1.5, `${base}: ${next} L ${labLightness(next).toFixed(1)} vs last ${labLightness(last).toFixed(1)}`);
    if (base !== "#808080") {
      const dh = Math.abs(((labHueDeg(next) - labHueDeg(base) + 540) % 360) - 180);
      assert.ok(dh < 15, `${base}: hue moved ${dh.toFixed(1)} deg`);
    }
    const again = nextDarkerClassColor(base, next);
    assert.ok(labLightness(again) <= labLightness(next) + 1e-6 && labLightness(again) >= 23, "keeps going down, floor at L* 24");
  }
});
