// TASKS.csv #2625 / #2635 — a sheet swarm correlated between holes along an attitude, instead of numbered top-down per hole.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attitudeNormal, placeRuns, fitSheetAttitude, refineSheetAttitude, correlateSheets, sheetAssign, positionFromTraces } from "../src/lib/sheetCorrelation.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// three parallel sheets 34° toward 256° (WA lithium's fitted attitude, #2539), 15 m apart along the normal, 4 m thick; vertical holes on a
// 5 x 5 grid 40 m apart, collars at RL 0; one hole misses the middle sheet (it pinches out there)
function swarm() {
  const n = attitudeNormal(34, 256), runs = [], pos = new Map();
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const id = `H${i}${j}`, x = i * 40, y = j * 40;
    pos.set(id, { x, y });
    [0, 1, 2].forEach((k) => {
      if (k === 1 && id === "H22") return;
      // the plane n . p = -15 k (k = 0 at the top): depth where the vertical hole meets it
      const zHit = (-15 * k - n.x * x - n.y * y) / n.z, md = -zHit;
      runs.push({ hole_id: id, code: "P", from: md - 2, to: md + 2, rows: [{ hole_id: id, from: md - 2, to: md + 2, value: "P" }], k: k + 1 });
    });
  }
  const positionAt = (h, md) => { const p = pos.get(h); return p ? { x: p.x, y: p.y, z: -md } : null; };
  return { runs, positionAt, n };
}

test("#2625: runs of parallel sheets are matched between holes along the attitude and numbered from the top", () => {
  const { runs, positionAt, n } = swarm();
  const placed = placeRuns(runs, positionAt);
  assert.equal(placed.length, 74);
  const res = correlateSheets(placed, n, 4);
  assert.equal(res.sheets.length, 3);
  assert.equal(res.twice, 0);
  for (const s of res.sheets) assert.ok(s.runs.every((r) => r.k === s.n), `sheet ${s.n}: ${[...new Set(s.runs.map((r) => r.k))]}`);
  assert.deepEqual(res.sheets.map((s) => s.runs.length), [25, 24, 25]);
  // per-hole top-down numbering would call H22's lowest sheet 'P2'; here it is P3, as in its neighbours
  const assign = sheetAssign(res.sheets, "P", (r) => `${r.hole_id}|${r.from}`);
  const h22 = runs.filter((r) => r.hole_id === "H22").map((r) => assign[`H22|${r.from}`]);
  assert.deepEqual(h22, ["P1", "P3"]);
});

test("#2625: the attitude can be fitted to the runs' midpoints; a gap too large merges sheets and is reported", () => {
  const { runs, positionAt, n } = swarm();
  const placed = placeRuns(runs, positionAt);
  const fit0 = fitSheetAttitude(placed);
  assert.ok(fit0 && Math.abs(fit0.dip - 34) < 3, "one plane through all the sheets: tilted by the stacking"); // 35.3°
  const fit = refineSheetAttitude(placed, fit0, 4);
  assert.ok(Math.abs(fit.dip - 34) < 0.1 && Math.abs(fit.dipDirection - 256) < 0.1, JSON.stringify({ dip: fit.dip, dd: fit.dipDirection }));
  assert.equal(correlateSheets(placed, fit.normal, 4).sheets.length, 3);
  const merged = correlateSheets(placed, n, 20);
  assert.equal(merged.sheets.length, 1);
  assert.ok(merged.twice > 0, "holes cut the merged 'sheet' more than once");
  // runs on one line of holes do not define a plane
  assert.equal(fitSheetAttitude(placed.filter((q) => q.run.hole_id.startsWith("H2"))), null);
});

test("#2625: positions come from the 3D view's traces (scene y up, z = -north)", () => {
  const at = positionFromTraces([{ hole_id: "A", pts: [{ md: 0, x: 10, y: 5, z: -20 }, { md: 10, x: 10, y: -5, z: -20 }] }]);
  assert.deepEqual(at("A", 5), { x: 10, y: 20, z: 0 });
  assert.equal(at("B", 5), null);
});

test("#2625: the Modelling codes pane offers it next to Auto-number, from the 3D traces", () => {
  const pane = fs.readFileSync(path.join(root, "src", "components", "ModellingCodesPane.jsx"), "utf8");
  const panes = fs.readFileSync(path.join(root, "src", "modules", "viewer", "ModellingPanes.jsx"), "utf8");
  assert.ok(pane.includes('tr("Correlate {v} into sheets"'));
  assert.match(pane, /const gap = Number\(sheetAtt\.gap\) > 0 \? Number\(sheetAtt\.gap\) : med;/, "blank gap = the median run");
  assert.match(panes, /positionAt=\{sheetPositionAt\}/);
  assert.match(panes, /positionFromTraces\(tracesRef\?\.current \|\| \[\]\), \[tracesSeq\]/);
});
