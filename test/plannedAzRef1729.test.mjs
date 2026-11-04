// TASKS.csv #1729 (review #1645, Copley) — a planned hole's azimuth can be typed from true or magnetic north; it is stored as grid
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { azimuthToGridOffset, wrap360 } from "../src/lib/azimuthRef.js";

test("#1729 Copley's collar: 127.75 true is 129.2 grid (convergence about +1.45 deg in UTM 10N there)", () => {
  const o = azimuthToGridOffset("true", 381835.88, 5956308.15, 26910, "2026-11-04");
  assert.ok(o && Math.abs(o.offset - 1.45) < 0.05, JSON.stringify(o));
  assert.ok(Math.abs(wrap360(127.75 + o.offset) - 129.2) < 0.05);
});

test("#1729 the form converts at the collar and keeps what was typed; the row edits grid", () => {
  const p = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('azimuth: azRef === "grid" ? Number(draft.azimuth) : gridAz'));
  assert.ok(p.includes('azimuthEntered: { value: Number(draft.azimuth), ref: azRef, date: today }'));
  assert.ok(p.includes("wrap360(azimuth - azOffset.offset)"), "a solved bearing is shown in the chosen north");
  assert.ok(p.includes('tr("Az° grid")'));
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("collars={collars} epsg={project?.epsg} />"));
});
