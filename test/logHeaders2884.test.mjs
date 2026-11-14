// TASKS.csv #2884 (review #2876, WA bedded iron) — the 121 MB downhole log (Hole_id, Depth From, Depth To, ..., Density_Best, Gamma_Best,
// Suscep_Best) was guessed as a Specific gravity interval layer: "Depth From" (with a space) matched no From / To header, so the log
// detector returned false and 2.48 M zero-length intervals went in. Spaced headers are read now, and From = To on every row is point data.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { looksLikeLogTable, logChannelsFor, logChannelColumns, zeroLengthRows } from "../src/lib/downholeLogChannels.js";
import { guessTargetFor, guessMapping } from "../src/lib/layers.js";

const H = ["Hole_id", "Depth From", "Depth To", "Projectcode", "DEPTHSTEP", "RUN", "Density_Best", "Gamma_Best", "Suscep_Best"];
const rows = Array.from({ length: 60 }, (_, i) => ({ Hole_id: i < 30 ? "RC1" : "RC2", "Depth From": (0.1 * (i % 30)).toFixed(2), "Depth To": (0.1 * (i % 30)).toFixed(2), Projectcode: "P1", DEPTHSTEP: "0.1", RUN: "1", Density_Best: "2.31", Gamma_Best: String(40 + i), Suscep_Best: "0.0012" }));

test("the WAMEX log with 'Depth From' / 'Depth To' is a downhole log, not Specific gravity", () => {
  assert.equal(looksLikeLogTable(H), true, "headers alone: Gamma_Best is a channel only a log has");
  assert.equal(guessTargetFor(H, "downhole_logs.csv"), "custom"); // was sg
  assert.equal(guessTargetFor(H, "downhole_logs.csv", rows), "custom");
  const m = guessMapping("custom", H);
  assert.equal(m.from, "Depth From"); assert.equal(m.to, "Depth To");
  assert.deepEqual(logChannelsFor("custom", H, rows, m, null), ["Density_Best", "Gamma_Best", "Suscep_Best"]);
  assert.ok(!logChannelColumns(H, rows, m).some((c) => c.col === "DEPTHSTEP"), "the depth step is not a channel");
});

test("From = To on every row: point readings, even with density alone and an SG file name", () => {
  const h = ["HOLEID", "Depth From", "Depth To", "Density"];
  const pts = Array.from({ length: 40 }, (_, i) => ({ HOLEID: "A", "Depth From": i * 0.1, "Depth To": i * 0.1, Density: 2.5 }));
  assert.equal(zeroLengthRows(h, pts), true);
  assert.equal(looksLikeLogTable(h), false, "headers alone: an SG interval table");
  assert.equal(looksLikeLogTable(h, pts), true);
  assert.equal(guessTargetFor(h, "density.csv", pts), "custom");
  assert.deepEqual(logChannelsFor("custom", h, pts, { hole_id: "HOLEID", from: "Depth From", to: "Depth To" }, null), ["Density"]);
  // real SG intervals keep their layer
  const iv = pts.map((r, i) => ({ ...r, "Depth To": i * 0.1 + 1 }));
  assert.equal(zeroLengthRows(h, iv), false);
  assert.equal(guessTargetFor(h, "density.csv", iv), "sg");
  assert.equal(zeroLengthRows(h, pts.slice(0, 5)), null, "too few rows to say");
});

test("the import paths pass their rows to the guess", () => {
  const src = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(src, /guessTargetFor\(headers, file\.name, data\); \/\/ #605: the file name as a hint; data: #2884/);
  assert.match(src, /guessTargetFor\(headers, sourceName, rows\); \/\/ #605; rows: #2884/);
  assert.match(src, /guessTargetFor\(headers, file\.name, data\); \/\/ #605; data: #2884/);
  const box = readFileSync(new URL("../src/components/LogChannelsBox.jsx", import.meta.url), "utf8");
  assert.match(box, /looksLikeLogTable\(modal\.headers, rows\)/);
});
