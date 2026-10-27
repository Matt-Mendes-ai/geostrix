// TASKS.csv #920 / #924 — Layout scale bars follow their view without a fixed floor, and copies keep their links.
import test from "node:test";
import assert from "node:assert/strict";
import { withLiveScaleBars, relinkCopies } from "../src/lib/layoutLinks.js";

const PX_PER_MM = 96 / 25.4;
// a viewport frame 400 px tall showing worldHeightAtTarget metres: 1:N on paper means N * (400 px / PX_PER_MM) mm of ground
const viewAt = (scaleN, h = 400) => ({ id: "vp1", type: "viewport", h, capH: h, worldHeightAtTarget: (h / PX_PER_MM / 1000) * scaleN });

test("#920: a bound bar's drawn length always matches its label (no 20 px floor)", () => {
  for (const n of [1000, 5000, 10000, 50000, 100000, 250000]) {
    const [, bar] = withLiveScaleBars([viewAt(n), { id: "s1", type: "scale", boundTo: "vp1", meters: 200, pxPerMeter: 1 }]);
    const px = bar.meters * bar.pxPerMeter;
    const groundM = (px / PX_PER_MM / 1000) * n; // what the drawn bar measures on the ground at 1:n
    assert.ok(Math.abs(groundM - bar.meters) / bar.meters < 1e-9, `1:${n}: bar ${bar.meters} m measures ${groundM} m`);
    assert.ok(px >= 40 && px <= 600, `1:${n}: ${px} px`);
  }
});

test("#920: the user's length is kept while it fits, a round length replaces it when it does not", () => {
  const keep = withLiveScaleBars([viewAt(5000), { id: "s1", type: "scale", boundTo: "vp1", meters: 200 }])[1];
  assert.equal(keep.meters, 200); // 200 m at 1:5,000 = 151 px
  const swap = withLiveScaleBars([viewAt(50000), { id: "s1", type: "scale", boundTo: "vp1", meters: 200 }])[1];
  assert.notEqual(swap.meters, 200); // 200 m at 1:50,000 = 15 px: too short to read
  assert.ok([1, 2, 5].includes(Number(String(swap.meters)[0])) && /^\d0*$/.test(String(swap.meters)), `round: ${swap.meters}`);
});

test("#920: an unbound bar or one whose view is not captured keeps its own ratio", () => {
  const free = { id: "s0", type: "scale", meters: 100, pxPerMeter: 1.8 };
  assert.deepEqual(withLiveScaleBars([free])[0], free);
  const orphan = { id: "s1", type: "scale", boundTo: "gone", meters: 100, pxPerMeter: 1.8 };
  assert.deepEqual(withLiveScaleBars([orphan])[0], orphan);
});

test("#924: duplicating a viewport with its bar and overview links the copies to the copy", () => {
  const els = [viewAt(5000), { id: "s1", type: "scale", boundTo: "vp1", meters: 200 }, { id: "ov1", type: "viewport", overviewOf: "vp1" }];
  const idMap = new Map([["vp1", "vp1b"], ["s1", "s1b"], ["ov1", "ov1b"]]);
  const copies = relinkCopies(els.map((e) => ({ ...e, id: idMap.get(e.id) })), idMap, false);
  assert.equal(copies[1].boundTo, "vp1b");
  assert.equal(copies[2].overviewOf, "vp1b");
  // the copied bar now reads the copied view, at the same scale as the original
  const live = withLiveScaleBars([...els, ...copies]);
  assert.equal(live[4].pxPerMeter, live[1].pxPerMeter);
});

test("#924: a bar duplicated alone stays on its view; a template drops links to elements it does not carry", () => {
  const bar = { id: "s1", type: "scale", boundTo: "vp1", meters: 200 };
  assert.equal(relinkCopies([{ ...bar, id: "s1b" }], new Map([["s1", "s1b"]]), false)[0].boundTo, "vp1");
  assert.equal(relinkCopies([{ ...bar, id: "s1b" }], new Map([["s1", "s1b"]]), true)[0].boundTo, null);
  const plain = { id: "t1", type: "text", text: "x" };
  assert.deepEqual(relinkCopies([plain], new Map(), true)[0], plain); // no link fields added
});
