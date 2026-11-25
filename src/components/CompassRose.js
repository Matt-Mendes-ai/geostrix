import * as THREE from "three";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

const toRad = (d) => (d * Math.PI) / 180;

// Builds and manages a small always-on-top compass widget rendered via viewport/scissor into the
// same renderer/canvas as the main scene. Call `mount(renderer, mount)` once, `renderEachFrame()`
// inside the main animation loop, and route pointer events through `handlePointerDown/Move`.
// TASKS.csv #385 — the app's typeface (bundled @fontsource/exo-2, weight 700 imported in main.jsx). A canvas
// texture keeps whatever font was available when it was drawn, so the label is drawn now and drawn again
// once the font has loaded.
const LABEL_FONT = (px, weight = "bold") => `${weight} ${px}px 'Exo 2', system-ui, sans-serif`;
function drawWhenFontReady(px, draw, weight) {
  draw();
  if (typeof document !== "undefined" && document.fonts?.load && !document.fonts.check(LABEL_FONT(px, weight))) document.fonts.load(LABEL_FONT(px, weight)).then(draw, () => {});
}
// TASKS.csv #4072 — Matt's option B, "bezel ring": a white disc with a dark ring, 8 grey ticks at the cardinal and intercardinal points,
// a gold north marker outside the ring, N inside the ring and E / S / W smaller in grey; no grey square behind it (navScene has no
// background, and renderEachFrame draws over the 3D view as the axis gizmo does). The whole bezel turns with the camera, as before.
const BEZEL = { disc: 0xffffff, ring: 0x3a4454, tick: 0x9aa5b3, north: 0xe2a63c };
export function createCompassRose({ camStateRef, updateCamera, dragRef }) {
  const navScene = new THREE.Scene(); // #4072: no background (it was a #f4f5f7 square)
  const navCamera = new THREE.OrthographicCamera(-2.3, 2.3, 2.3, -2.3, 0.1, 20);
  navCamera.up.set(0, 0, -1);
  navCamera.position.set(0, 10, 0);
  navCamera.lookAt(0, 0, 0);

  // the letter is drawn at `px` in a 96 px canvas; the sprite (and so the click target) keeps `sizePx` whatever the letter's size
  const makeLabelSprite = (text, color, sizePx, px = 74, weight = "bold") => {
    const c = document.createElement("canvas"); c.width = 96; c.height = 96;
    const ctx = c.getContext("2d");
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; // #4072: the canvas holds sRGB colours (without this the letters came out washed pale)
    drawWhenFontReady(px, () => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = color; ctx.font = LABEL_FONT(px, weight); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, 48, 50);
      tex.needsUpdate = true;
    }, weight);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(sizePx, sizePx, 1);
    return sprite;
  };

  const ringGroup = new THREE.Group();
  // TASKS.csv #2038 (review #2013, Woodjam) — seen from below the scene is mirrored north-south (the Bottom view puts north at the bottom of
  // the screen, as the axis gizmo shows), so the ring is mirrored too: flipGroup's z is the screen's vertical (the nav camera's up is -z).
  // The letters are sprites, so they stay readable.
  const flipGroup = new THREE.Group();
  flipGroup.add(ringGroup);
  navScene.add(flipGroup);
  const ringR = 1.6;
  // #4072: the white disc (round, so it need not turn) under the ring; the ring itself about 1.5 px wide at this size
  const disc = new THREE.Mesh(new THREE.CircleGeometry(ringR + 0.03, 64), new THREE.MeshBasicMaterial({ color: BEZEL.disc }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = -0.02;
  navScene.add(disc);
  // #4072: a torus is built in the XY plane; laid flat (XZ) so the top-down nav camera sees a ring. Before, it stood on edge and showed
  // as a dark line through the compass (the line in Matt's screenshot)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.03, 8, 64), new THREE.MeshBasicMaterial({ color: BEZEL.ring }));
  ring.rotation.x = Math.PI / 2;
  ringGroup.add(ring);

  const compassPts = [
    // TASKS.csv #523 — N was red, the colour the axis gizmo beside it uses for EAST. Now a dark North blue (the gizmo's
    // North hue, darkened to 6.0:1 on the viewport) so the two widgets agree. #4072: N weight 500; E / S / W smaller, in muted grey.
    { dir: [0, 0, -1], label: "N", color: "#1f5f9e", px: 80 },
    { dir: [1, 0, 0], label: "E", color: "#65717e", px: 60 },
    { dir: [0, 0, 1], label: "S", color: "#65717e", px: 60 },
    { dir: [-1, 0, 0], label: tr("W"), color: "#65717e", px: 60 }, // #786: O in Spanish / Portuguese
  ];
  const labelR = ringR - 0.56; // #4072: inside the ring, clear of the ticks
  const clickable = []; // { mesh, dir } — hit-tested for click-to-snap
  compassPts.forEach((p) => {
    const sprite = makeLabelSprite(p.label, p.color, 0.82, p.px, 500); // the click target stays 0.82 (as before #4072) whatever the letter's size
    sprite.position.set(p.dir[0] * labelR, 0.02, p.dir[2] * labelR);
    sprite.userData.dir = new THREE.Vector3(p.dir[0], 0.55, p.dir[2]).normalize(); // slight upward tilt so click gives a nice 3/4 view
    ringGroup.add(sprite);
    clickable.push(sprite);
  });

  // #4072: 8 ticks inside the ring, at the cardinal and intercardinal points; each is clickable (a cardinal one snaps as its letter does,
  // an intercardinal one to the 45° diagonal). The drawn tick is thin; its click target is a hidden box larger than the old 0.1 x 0.22 tick.
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  [0, 45, 90, 135, 180, 225, 270, 315].forEach((deg) => {
    const r = toRad(deg), long = deg % 90 === 0;
    const dir = new THREE.Vector3(Math.sin(r), 0.55, -Math.cos(r)).normalize();
    const len = long ? 0.26 : 0.18;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, len), new THREE.MeshBasicMaterial({ color: BEZEL.tick }));
    tick.position.set(Math.sin(r) * (ringR - 0.06 - len / 2), 0.01, -Math.cos(r) * (ringR - 0.06 - len / 2));
    tick.rotation.y = -r;
    ringGroup.add(tick);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.42), hitMat);
    hit.position.set(Math.sin(r) * (ringR - 0.12), 0.01, -Math.cos(r) * (ringR - 0.12));
    hit.rotation.y = -r;
    hit.userData.dir = dir;
    ringGroup.add(hit);
    clickable.push(hit);
  });

  // #4072: the gold north marker, a triangle just outside the ring pointing in (it turns with the bezel; it replaced the old cream heading cone)
  const northMarker = (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-0.15, 0, -(ringR + 0.32), 0.15, 0, -(ringR + 0.32), 0, 0, -(ringR + 0.07)], 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: BEZEL.north, side: THREE.DoubleSide }));
    m.position.y = 0.03;
    m.userData.dir = new THREE.Vector3(0, 0.55, -1).normalize(); // a click on it snaps to north, as N does
    return m;
  })();
  ringGroup.add(northMarker);
  clickable.push(northMarker);

  const pitchMarker = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), new THREE.MeshBasicMaterial({ color: 0x4a9be0 }));
  navScene.add(pitchMarker);
  // #2038 — said in words when the view looks up from below
  const belowLabel = (() => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 64;
    const ctx = c.getContext("2d"), tex = new THREE.CanvasTexture(c);
    drawWhenFontReady(40, () => { ctx.clearRect(0, 0, c.width, c.height); ctx.fillStyle = "#9a6a12"; ctx.font = LABEL_FONT(40); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(tr("from below"), 128, 34); tex.needsUpdate = true; });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sp.scale.set(1.6, 0.4, 1); sp.position.set(0, 0.06, 0.05); sp.visible = false; // #4072: at the centre, clear of the letters inside the ring
    navScene.add(sp);
    return sp;
  })();

  const navSize = 116, navMarginX = 12, navTop = 54; // bumped up from 100 to give the larger labels room
  const getRect = (mount) => ({ x: mount.clientWidth - navMarginX - navSize, y: navTop, w: navSize, h: navSize });
  const inRect = (mount, mx, my) => { const r = getRect(mount); return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h; };

  const raycaster = new THREE.Raycaster();

  // Clicking a compass label should make the view LOOK that way (click N -> looking north), not
  // put the camera on that side of the model looking back. The camera orbits at `dir` from the
  // target and always looks *at* the target (see ViewerModule's updateCamera), so to look toward
  // `dir` the camera itself has to sit on the opposite side — hence the +π. Only the horizontal
  // (theta) component is flipped; the pitch (phi, from dir.y) stays as-is so the click still gives
  // the same pleasant 3/4-downward tilt in every direction.
  function snapTo(dir) {
    const cs = camStateRef.current;
    cs.theta = Math.atan2(dir.x, dir.z) + Math.PI;
    cs.phi = Math.acos(Math.max(-1, Math.min(1, dir.y)));
    updateCamera();
  }

  // returns true if the event was consumed by the compass (caller should not start an orbit-drag)
  function handlePointerDown(mount, mx, my, button) {
    if (button !== 0 || !inRect(mount, mx, my)) return false;
    const r = getRect(mount);
    const nx = ((mx - r.x) / r.w) * 2 - 1, ny = -((my - r.y) / r.h) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), navCamera);
    const hits = raycaster.intersectObjects(clickable, false);
    if (hits.length) { snapTo(hits[0].object.userData.dir); return true; } // click consumed, no drag
    return "drag"; // inside widget but missed a label — still let dragging the ring rotate the view
  }
  function isOver(mount, mx, my) { return inRect(mount, mx, my); }

  function renderEachFrame(renderer, mount) {
    const cs = camStateRef.current;
    ringGroup.rotation.y = -cs.theta;
    const lookingUpFromBelow = cs.phi > Math.PI / 2;
    const pitchT = lookingUpFromBelow ? (cs.phi - Math.PI / 2) / (Math.PI / 2) : 1 - cs.phi / (Math.PI / 2);
    const pitchDist = ringR * Math.max(0.06, Math.min(1, pitchT));
    pitchMarker.position.set(0, 0.05, -pitchDist);
    pitchMarker.material.color.set(lookingUpFromBelow ? 0xd4a24a : 0x4a9be0);
    flipGroup.scale.z = lookingUpFromBelow ? -1 : 1; // #2038
    belowLabel.visible = lookingUpFromBelow;

    const r = getRect(mount);
    const canvasH = mount.clientHeight;
    renderer.setViewport(r.x, canvasH - r.y - r.h, r.w, r.h);
    renderer.setScissor(r.x, canvasH - r.y - r.h, r.w, r.h);
    renderer.setScissorTest(true);
    // #4072: no colour clear (it painted the grey square): draw over what the main scene left here, depth cleared in this rectangle
    // only, autoClear restored after (as AxisGizmo.js does)
    renderer.clearDepth();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(navScene, navCamera);
    renderer.autoClear = prevAutoClear;
    renderer.setScissorTest(false);
  }

  return { handlePointerDown, isOver, renderEachFrame };
}
