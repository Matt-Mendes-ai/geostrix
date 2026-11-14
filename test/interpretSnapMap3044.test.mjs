// TASKS.csv #3044 (#2972) — Interpret snapped only to collars, logged contacts and traces. On the Surface Geology tab a line is drawn along mapped
// contacts and through outcrop stations: a click now also snaps to a shown map layer's vertex or an outcrop station. SYNTHETIC points.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { snapInterpretClick, setInterpretSnapExtras } from "../src/lib/viewer/interpretSnap.js";

const origin = { x: 400000, y: 6200000, z: 0 };
const camera = { isOrthographicCamera: true, top: 500, bottom: -500, zoom: 1 }; // 1,000 m over 1,000 px: 12 px = 12 m
const down = (E, N) => ({ origin: { x: E - origin.x, y: 2000, z: origin.y - N }, direction: { x: 0, y: -1, z: 0 } }); // a plan look at (E, N)
const traces = [{ hole_id: "H1", pts: [{ md: 0, x: 500, y: 900, z: -500 }, { md: 100, x: 500, y: 800, z: -500 }] }]; // collar at E 400500, N 6200500

test("a click near a map vertex or a station snaps to it in a plan look; with nothing near, the click is kept", () => {
  setInterpretSnapExtras({ points: [{ x: 400100, y: 6200100, z: 905, label: "syn_units", kind: "vertex" }, { x: 400300, y: 6200300, z: 910, label: "ST-7", kind: "station" }] });
  try {
    const w = { x: 400104, y: 6200097, z: 0 };
    const a = snapInterpretClick(w, down(400104, 6200097), { on: true, traces, layers: {}, visible: {}, origin, camera, heightPx: 1000 });
    assert.deepEqual([a.x, a.y, a.z, a.snap.kind, a.snap.label, a.snap.hole_id], [400100, 6200100, 905, "vertex", "syn_units", undefined]);
    const b = snapInterpretClick(w, down(400295, 6200306), { on: true, traces, layers: {}, visible: {}, origin, camera, heightPx: 1000 });
    assert.equal(b.snap.kind, "station"); assert.equal(b.snap.label, "ST-7");
    const far = { x: 400700, y: 6200700, z: 0 };
    assert.equal(snapInterpretClick(far, down(400700, 6200700), { on: true, traces, layers: {}, visible: {}, origin, camera, heightPx: 1000 }), far);
    // a collar nearer the click than any vertex is still the tie
    const c = snapInterpretClick(w, down(400503, 6200502), { on: true, traces, layers: {}, visible: {}, origin, camera, heightPx: 1000 });
    assert.equal(c.snap.hole_id, "H1"); assert.equal(c.snap.kind, "collar");
    // with no holes at all, the map still snaps
    assert.equal(snapInterpretClick(w, down(400104, 6200097), { on: true, traces: [], layers: {}, visible: {}, origin, camera, heightPx: 1000 }).snap.kind, "vertex");
    assert.equal(snapInterpretClick(w, down(400104, 6200097), { on: false, traces, layers: {}, visible: {}, origin, camera, heightPx: 1000 }), w, "snap off");
  } finally { setInterpretSnapExtras(null); }
});

test("the Interpretation pane registers the shown map layers' vertices and the stations on their ground", () => {
  const s = fs.readFileSync(new URL("../src/components/InterpretPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /useEffect\(\(\) => \{ setInterpretSnapExtras\(snapExtras\); return \(\) => setInterpretSnapExtras\(null\); \}, \[snapExtras\]\);/);
  assert.match(s, /if \(l\.visible === false \|\| points\.length >= MAX\) continue;/);
  assert.match(s, /kind: "station" \}\);/);
});
