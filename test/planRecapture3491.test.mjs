// TASKS.csv #3491 — Layout asks the Maps plan for a fresh picture of a placed Maps snapshot at the frame's own size and dpi. SYNTHETIC numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { recaptureSpec, recaptureFields, pictureDpi, requestPlanRecapture, RECAPTURE_DPI } from "../src/lib/planRecapture.js";
import { mapSnapshotPayload } from "../src/lib/mapSnapshot.js";

// a snapshot of a 1,000 x 600 (CSS px) plan at 5 m per pixel, drawn at 4x (4,000 x 2,400 px), placed 700 page px wide (about 7.3 in)
const el = (o = {}) => ({ id: "img1", type: "image", mapsView: true, w: 700, h: 420, naturalW: 4000, naturalH: 2400, targetWorld: { x: 500000, y: 6000000 }, mapsCapture: { mPerPx: 5, cssW: 1000, cssH: 600 }, ...o });

test("the payload keeps the plan's own scale and CSS size, for a later fresh capture", () => {
  const p = mapSnapshotPayload({ src: "data:", pxW: 4000, pxH: 2400, view: { cx: 1, cy: 2, mPerPx: 5 }, size: { w: 1000, h: 600 } });
  assert.deepEqual(p.mapsCapture, { mPerPx: 5, cssW: 1000, cssH: 600 });
  assert.equal(p.worldWidthAtCaptureM, 5000);
});

test("the dpi a placed picture prints at: its pixels over its frame's printed width", () => {
  assert.ok(Math.abs(pictureDpi(el()) - (4000 * 96) / 700) < 1e-9); // 548.6 dpi
  assert.equal(pictureDpi({}), null);
});

test("already sharp: a picture that prints at 300 dpi or more is left alone", () => {
  assert.deepEqual(recaptureSpec(el()).reason, "sharp"); // 549 dpi
  assert.equal(recaptureSpec(el({ w: 1280, h: 768 })).reason, "sharp"); // 300 dpi exactly
});

test("a frame dragged larger: drawn again over the same ground at 300 dpi of the frame", () => {
  const s = recaptureSpec(el({ w: 2400, h: 1440 })); // 25 in wide: the 4,000 px picture prints at 160 dpi
  assert.equal(s.ok, true);
  assert.equal(s.elementId, "img1");
  assert.deepEqual(s.view, { cx: 500000, cy: 6000000, mPerPx: 5 }, "same centre and metres per pixel: the frame's scale does not move");
  assert.equal(s.w, 1000); assert.equal(s.h, 600);
  assert.equal(s.pxW, 7500, "25 in at 300 dpi");
  assert.ok(Math.abs(s.ratio - 7.5) < 1e-9);
  assert.equal(s.dpi, 300); assert.equal(s.capped, false);
});

test("the frame's own aspect is drawn: the height follows the frame, the width and the ground across it stay", () => {
  const s = recaptureSpec(el({ w: 1800, h: 1350 })); // 18.75 in wide, 4:3: the plan was 5:3
  assert.equal(s.w, 1000); assert.equal(s.h, 750);
  assert.equal(s.pxW, 5625); assert.equal(s.pxH, 4219); assert.equal(s.capped, false);
});

test("a frame too large for the pixel ceiling is drawn at the most it allows, and says so", () => {
  const s = recaptureSpec(el({ w: 9600, h: 5760 })); // 100 in wide: 30,000 px at 300 dpi
  assert.equal(s.ok, true); assert.equal(s.capped, true);
  assert.ok(s.pxW * s.pxH <= 36e6 * 1.001 && Math.max(s.pxW, s.pxH) <= 16000);
  assert.ok(s.dpi < 300 && s.dpi > pictureDpi(el({ w: 9600, h: 5760 })), `${s.dpi} dpi: below 300 but sharper than the picture's ${Math.round(pictureDpi(el({ w: 9600, h: 5760 })))}`);
});

test("a snapshot sent before the scale was kept (no mapsCapture), or not a Maps view, is asked to be sent again", () => {
  assert.equal(recaptureSpec(el({ mapsCapture: undefined, w: 2400, h: 1440 })).reason, "old");
  assert.equal(recaptureSpec(el({ mapsView: false, w: 2400, h: 1440 })).reason, "old");
  assert.equal(recaptureSpec(el({ targetWorld: null, w: 2400, h: 1440 })).reason, "old");
});

test("the fields a fresh payload replaces leave the frame, label and settings alone", () => {
  const p = mapSnapshotPayload({ src: "data:new", pxW: 7500, pxH: 4500, view: { cx: 7, cy: 8, mPerPx: 5 }, size: { w: 1000, h: 600 } });
  const f = recaptureFields(p);
  assert.deepEqual(Object.keys(f).sort(), ["aspect", "legendItems", "mapsCapture", "naturalH", "naturalW", "src", "targetWorld", "worldHeightAtTarget", "worldWidthAtCaptureM"]);
  assert.equal(f.src, "data:new"); assert.equal(f.naturalW, 7500); assert.equal(f.aspect, 7500 / 4500);
  assert.ok(!("x" in f) && !("w" in f) && !("label" in f));
});

test("the request is kept for the plan that mounts next", async () => {
  const seen = [];
  globalThis.window = new EventTarget();
  window.addEventListener("geostrix-plan-recapture", (e) => seen.push(e.detail.spec.elementId));
  requestPlanRecapture({ elementId: "a" });
  assert.deepEqual(seen, ["a"]);
  delete globalThis.window;
  assert.equal(RECAPTURE_DPI, 300);
});

test("wired: Layout's button, the Maps tab showing its plan, the plan drawing at the asked size and replacing the element", () => {
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const plan = read("../src/components/MapsPlanView.jsx"), ctl = read("../src/components/MapRedrawControl.jsx"), lay = read("../src/modules/LayoutModule.jsx"), maps = read("../src/modules/MapsModule.jsx");
  assert.match(ctl, /requestModuleAction\("maps-plan"\); requestPlanRecapture\(spec\); goToModule\("maps"\)/);
  assert.match(maps, /useModuleAction\(\["maps-plan"\], \(\) => setPane\(\(p\) => \(CRS_PANES\.has\(p\) \? "raster" : p\)\)\)/);
  assert.match(lay, /\{sel\.mapsView && <MapRedrawControl sel=\{sel\} \/>/);
  assert.match(lay, /\.\.\.\(img\.mapsCapture \? \{ mapsCapture: img\.mapsCapture \} : \{\}\)/, "the element keeps the plan's scale");
  assert.match(plan, /const size = useMemo\(\(\) => \(recapture \? \{ w: recapture\.w, h: recapture\.h \} : liveSize\), \[recapture, liveSize\]\)/);
  assert.match(plan, /const v = recapture\?\.view \|\| view \|\|/);
  assert.match(plan, /setRecapture\(\{ w: spec\.w, h: spec\.h, view: spec\.view \}\);\n\s+setCaptureDpr\(spec\.ratio\);/);
  assert.match(plan, /mapLayoutPagesElements\(\(els\) => els\.map\(\(e\) => \(e\.id === spec\.elementId \? \{ \.\.\.e, \.\.\.fields \} : e\)\)\)/);
  assert.match(plan, /setRecapture\(null\); setCaptureDpr\(null\);/, "the screen's size and view come back");
  assert.match(plan, /snapshotPayloadOf\(mapSnapshotPayload, src, cv\.width, cv\.height, v, size, collarTitle\), utmGrid: hadGrid/, "Snapshot to Layout draws through the same payload");
});
