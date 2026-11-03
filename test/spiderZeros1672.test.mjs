// TASKS.csv #1672 (review #1645, Copley) — a zero on a log axis no longer hangs the renderer; a dead renderer is said and reloadable
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/GeochemPlot.jsx", import.meta.url), "utf8");
const body = src.slice(src.indexOf("function logTicks(min, max) {"), src.indexOf("// TASKS.csv #234"));
const logTicks = new Function(`${body}; return logTicks;`)();

test("logTicks: bounds of 0 or Infinity give no ticks instead of an endless loop", () => {
  assert.deepEqual(logTicks(0, 100), []);
  assert.deepEqual(logTicks(1e-300 * 0, 10), []);
  assert.deepEqual(logTicks(1, Infinity), []);
  assert.deepEqual(logTicks(0.1, 1000), [0.1, 1, 10, 100, 1000]);
});

test("the spider plot leaves zeros out of its range and lifts the pen at them", () => {
  assert.ok(src.includes(".filter((v) => v > 0 && Number.isFinite(v))); // #1672"));
  assert.ok(src.includes('if (p.value == null || !(p.value > 0)) { pen = false; return; }'));
});

test("Electron offers a reload when the window's renderer dies", () => {
  const main = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  assert.ok(main.includes('mainWindow.webContents.on("render-process-gone"'));
  assert.ok(main.includes("mainWindow.webContents.reload()"));
});
