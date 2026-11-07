// TASKS.csv #1786 / #1842 (review #1646, Kodiak) — a CSV block model's property from its names; categorical unit models get no
// Grade-tonnage; every values model has 'Values are'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessVoxelProperty } from "../src/lib/voxelProperty.js";

test("#1786 whole name tokens: chg, res, con, sus, den; nothing else", () => {
  assert.equal(guessVoxelProperty("MPD-2023_ipinv3d_r3i04_chg", "value"), "Chargeability (mV/V)");
  assert.equal(guessVoxelProperty("MPD-2023_dcinv3d_r2i10_res", "value"), "Resistivity (ohm·m)");
  assert.equal(guessVoxelProperty("MPD-2023_dcinv3d_r2i10_con", "value"), "Conductivity (S/m)");
  assert.equal(guessVoxelProperty("mag_inv", "sus"), "Susceptibility (SI)");
  assert.equal(guessVoxelProperty("grav", "density"), "Density (g/cc)");
  assert.equal(guessVoxelProperty("control_blocks", "cu_pct"), null, "'control' is not 'con'");
  assert.equal(guessVoxelProperty("mag_tmi", "value"), null, "'mag' alone says nothing");
  assert.equal(guessVoxelProperty("resource_model", "au"), null);
});

test("#1842 / #1786 the card: unit models labelled and without Grade-tonnage; 'Values are' for every values model", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.ok(g.includes('categorical && (model.source === "surfaces" || model.source === "gempy") ? tr("Modelled units")'));
  assert.ok(g.includes('|| model.source === "simpeg" || categorical || /^support-index-|^kriging-variance$/.test(String(model.source || "")) /* #1577 */) && <Scale')) // #1577 — not on an index or a variance either;
  assert.ok(g.includes("{!categorical && ( // #1786"));
  assert.ok(g.includes("...(guessed ? { property: guessed } : {})"));
});

test("#1786 / #1785 a known property decides log handling: resistivity / conductivity yes, chargeability / density / susceptibility no", async () => {
  const { isLogProperty } = await import("../src/lib/voxelProperty.js");
  const { wantsLogMean } = await import("../src/lib/voxel.js");
  const chg = [0.0006, 0.5, 3.7, 9.8, 23.1]; // 4.6 decades from a near-zero value
  assert.equal(isLogProperty("Chargeability (mV/V)", 0.0006, 23.1), false);
  assert.equal(isLogProperty("Resistivity (ohm·m)", 15, 90), true, "even under two decades");
  assert.equal(isLogProperty(null, 0.0006, 23.1), true, "unknown: the range rule");
  assert.equal(wantsLogMean(chg, "Chargeability (mV/V)"), false);
  assert.equal(wantsLogMean(chg), true);
  assert.equal(wantsLogMean([15, 90], "Resistivity (ohm·m)"), true);
});
