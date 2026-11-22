// TASKS.csv #3970 (Matt's first-time test, 2026-11-21, Macpass: "the level plan window keeps resizing when I adjust the level plan") — the Level plan dialog's size followed
// its content (the plot's size from the window, the status line's length, the legend, the controls' wrapping), so the controls jumped under the pointer while the RL slider
// moved. Now the dialog has a size of its own (a share of the window, remembered, resized by its edge), the plot fills a measured plot box at an equal E / N scale, and every
// row around the plot is a fixed height: nothing about the dialog's size depends on the RL.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fallbackOpenRl, busiestRl, clampLevelPlanSize } from "../src/lib/levelPlan.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3970 the remembered size: a share of the window by default, the saved one clamped to the window and a minimum", () => {
  assert.deepEqual(clampLevelPlanSize(null, 1920, 983), { w: 1728, h: 865 }); // 90 % x 88 %
  assert.deepEqual(clampLevelPlanSize({ w: 1200, h: 700 }, 1920, 983), { w: 1200, h: 700 });
  assert.deepEqual(clampLevelPlanSize({ w: 5000, h: 5000 }, 1280, 800), { w: 1254, h: 768 }, "never bigger than the window");
  assert.deepEqual(clampLevelPlanSize({ w: 100, h: 100 }, 1280, 800), { w: 560, h: 440 }, "never smaller than the minimum");
  assert.deepEqual(clampLevelPlanSize({ w: "x", h: NaN }, 1000, 700), { w: 900, h: 616 }, "a bad saved value is the default");
});

test("#3970 nothing in the dialog's size depends on the RL: fixed dialog, measured plot box, fixed-height rows", () => {
  const s = read("../src/components/LevelPlanWindow.jsx");
  // the dialog: its own size, resized by its edge, never grown by its content
  assert.match(s, /width: dlgSize\.w, height: dlgSize\.h, minWidth: 560, minHeight: 440, maxWidth: "98vw", maxHeight: "96vh", resize: "both", overflow: "hidden", display: "flex", flexDirection: "column"/);
  assert.match(s, /localStorage\.setItem\(LP_SIZE_KEY/, "remembered");
  // the plot fills a measured box (a ResizeObserver), at an equal scale; the old window-share width on the svg is gone
  assert.match(s, /const W = box\.w, H = box\.h;/);
  assert.match(s, /const ro = new ResizeObserver\(\(\) => \{ const w = Math\.floor\(el\.clientWidth\), h = Math\.floor\(el\.clientHeight\)/);
  assert.match(s, /flex: "1 1 0", minHeight: 0, minWidth: 0, position: "relative", overflow: "hidden"/);
  assert.doesNotMatch(s, /calc\(96vw - 30px\)/);
  assert.match(s, /const s = Math\.min\(\(W - 2 \* PAD\) \/ \(x1 - x0\), \(H - 2 \* PAD\) \/ \(y1 - y0\)\);/, "equal E / N scale");
  assert.match(s, /view, W, H\]\);/, "the frame follows the plot box");
  // the rows around the plot
  assert.match(s, /<div title=\{statusText\} style=\{\{[^}]*height: "2\.9em", overflow: "hidden"/, "the status line: a fixed-height row, its full text a tooltip");
  assert.match(s, /flexWrap: "wrap", flex: "0 0 auto", minHeight: 34/, "the controls row");
  assert.match(s, /height: 40, overflowY: "auto"/, "the legend row scrolls");
  assert.match(s, /height: "1\.6em", marginTop: 4, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis"/, "the note row");
  assert.match(s, /visibility: building \? "visible" : "hidden"/, "the 'Building' label keeps its place");
});

test("#3970 where it opens: the busiest RL, else about 100 m under the middle collar (never the top of the range)", () => {
  // the middle collar 1,500 m: 1,400 m, inside a slider range of 600 to 1,893
  assert.equal(fallbackOpenRl([1400, 1500, 1600, 1500, 1450], [600, 1893]), 1400);
  assert.equal(fallbackOpenRl([], [600, 1893]), 1247, "no collars: the middle of the range");
  assert.equal(fallbackOpenRl([650], [600, 1893]), 600, "kept inside the range");
  assert.equal(fallbackOpenRl([9000], [600, 1893]), 1893);
  // the busiest RL is what the window uses first
  const holes = [{ trace: [{ z: 1500 }, { z: 1100 }] }, { trace: [{ z: 1450 }, { z: 1000 }] }, { trace: [{ z: 1900 }, { z: 1880 }] }];
  const b = busiestRl(holes);
  assert.ok(b >= 1100 && b <= 1450, `busiest ${b}`);
  const s = read("../src/components/LevelPlanWindow.jsx");
  assert.match(s, /busiestRl\(pl\.holes\)\) \?\? fallbackOpenRl\(/);
});
