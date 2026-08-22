import * as THREE from "three";

const toRad = (d) => (d * Math.PI) / 180;

// Builds and manages a small always-on-top compass widget rendered via viewport/scissor into the
// same renderer/canvas as the main scene. Call `mount(renderer, mount)` once, `renderEachFrame()`
// inside the main animation loop, and route pointer events through `handlePointerDown/Move`.
export function createCompassRose({ camStateRef, updateCamera, dragRef }) {
  const navScene = new THREE.Scene();
  navScene.background = new THREE.Color("#f4f5f7");
  const navCamera = new THREE.OrthographicCamera(-2.3, 2.3, 2.3, -2.3, 0.1, 20);
  navCamera.up.set(0, 0, -1);
  navCamera.position.set(0, 10, 0);
  navCamera.lookAt(0, 0, 0);

  const makeLabelSprite = (text, color, sizePx) => {
    const c = document.createElement("canvas"); c.width = 96; c.height = 96;
    const ctx = c.getContext("2d");
    ctx.fillStyle = color; ctx.font = "bold 74px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 48, 50);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(sizePx, sizePx, 1);
    return sprite;
  };

  const ringGroup = new THREE.Group();
  navScene.add(ringGroup);
  const ringR = 1.6;
  ringGroup.add(new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.03, 8, 48), new THREE.MeshBasicMaterial({ color: 0x3a4454 })));

  const compassPts = [
    { dir: [0, 0, -1], label: "N", color: "#e05a4a" },
    { dir: [1, 0, 0], label: "E", color: "#1a2028" },
    { dir: [0, 0, 1], label: "S", color: "#1a2028" },
    { dir: [-1, 0, 0], label: "W", color: "#1a2028" },
  ];
  const clickable = []; // { mesh, dir } — hit-tested for click-to-snap
  compassPts.forEach((p) => {
    const sprite = makeLabelSprite(p.label, p.color, 0.82); // bigger, readable (was 0.62)
    sprite.position.set(p.dir[0] * ringR, 0.02, p.dir[2] * ringR);
    sprite.userData.dir = new THREE.Vector3(p.dir[0], 0.55, p.dir[2]).normalize(); // slight upward tilt so click gives a nice 3/4 view
    ringGroup.add(sprite);
    clickable.push(sprite);
  });

  // intercardinal ticks — also clickable, snap to 45°-diagonal views
  [45, 135, 225, 315].forEach((deg) => {
    const r = toRad(deg);
    const dir = new THREE.Vector3(Math.sin(r), 0.55, -Math.cos(r)).normalize();
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.22), new THREE.MeshBasicMaterial({ color: 0x6a7484 }));
    tick.position.set(Math.sin(r) * ringR, 0.01, -Math.cos(r) * ringR);
    tick.rotation.y = r;
    tick.userData.dir = dir;
    ringGroup.add(tick);
    clickable.push(tick);
  });

  const lubber = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 3), new THREE.MeshBasicMaterial({ color: 0xf2e9d8 }));
  lubber.position.set(0, 0.03, -ringR - 0.2);
  lubber.rotation.x = Math.PI;
  navScene.add(lubber);

  const pitchMarker = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), new THREE.MeshBasicMaterial({ color: 0x4a9be0 }));
  navScene.add(pitchMarker);

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

    const r = getRect(mount);
    const canvasH = mount.clientHeight;
    renderer.setViewport(r.x, canvasH - r.y - r.h, r.w, r.h);
    renderer.setScissor(r.x, canvasH - r.y - r.h, r.w, r.h);
    renderer.setScissorTest(true);
    renderer.render(navScene, navCamera);
    renderer.setScissorTest(false);
  }

  return { handlePointerDown, isOver, renderEachFrame };
}
