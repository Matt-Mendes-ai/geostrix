import * as THREE from "three";

// TASKS.csv #189 — user request: "for our 3d view, instead of colour coded text let's have those 3
// arrows but label them N E and Z" (referencing a reference screenshot's small axis-triad icon —
// three arrows radiating from a shared origin, one per axis). Replaces the old flat "■ East ■
// Elevation ■ North" text legend (bottom-left of the 3D view) with a real, camera-synced 3D widget:
// three arrows pointing along the scene's actual X/Y/Z axes, labeled N/E/Z, that visibly rotate as
// the user orbits the main view — unlike the static text it replaces, this always shows the TRUE
// current orientation of the axes on screen, the way a CAD/geo-modelling app's axis gizmo normally
// works. Colors deliberately match the real in-scene axis lines ViewerModule already draws at the
// origin (mkAxis: X=red=East, Y=green=up/Elevation, Z direction (0,0,-1)=blue=North) rather than an
// arbitrary new palette, so the gizmo and the actual 3D scene never disagree about which color means
// which axis. Mirrors src/components/CompassRose.js's established pattern for a small always-on-top
// widget rendered via viewport/scissor into the SAME renderer/canvas as the main scene (own tiny
// navScene + navCamera, mount(renderer, mount) once, renderEachFrame() every frame) — reusing that
// approach rather than inventing a new rendering path.
export function createAxisGizmo({ camStateRef }) {
  const navScene = new THREE.Scene();
  // TASKS.csv — user request: "can you remove this background from the orientation arrow ... the
  // square is cutting off part of it". Two separate things were going on: (1) navScene.background was
  // a flat light card color (#f4f5f7, matching CompassRose's own card look), which read as a solid
  // square behind the arrows rather than the arrows floating directly over the 3D view — removed here;
  // renderEachFrame below disables autoClear for this one render call instead, so the gizmo draws on
  // top of whatever the main scene already rendered in that corner (no flat color, and no reintroduced
  // black-square problem — see the comment there). (2) the camera's 35° FOV was too tight for this
  // widget's own geometry — the label sprites (placed at ARROW_LEN + 0.42 = 1.82 world units from the
  // origin, plus their own half-width) fell just outside what a 35° FOV shows at this camera's fixed
  // radius, so the scissor rectangle's edge clipped the arrowheads and cut letters off mid-glyph.
  // Widened to 65° so the full triad + labels comfortably fit inside the small viewport with margin.
  const navCamera = new THREE.PerspectiveCamera(65, 1, 0.1, 20);

  const AXES = [
    { dir: [1, 0, 0], color: 0xe05a4a, label: "E" }, // matches mkAxis's X line (red = East)
    { dir: [0, 1, 0], color: 0x4ac96a, label: "Z" }, // matches mkAxis's Y line (green = up/Elevation)
    { dir: [0, 0, -1], color: 0x4a9be0, label: "N" }, // matches mkAxis's Z-direction line (blue = North)
  ];

  const ARROW_LEN = 1.4;
  const makeLabelSprite = (text, colorHex) => {
    const c = document.createElement("canvas"); c.width = 64; c.height = 64;
    const ctx = c.getContext("2d");
    ctx.fillStyle = `#${colorHex.toString(16).padStart(6, "0")}`;
    ctx.font = "bold 46px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.62, 0.62, 1);
    return sprite;
  };

  AXES.forEach((a) => {
    const dir = new THREE.Vector3(...a.dir);
    const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), ARROW_LEN, a.color, 0.4, 0.22);
    navScene.add(arrow);
    const label = makeLabelSprite(a.label, a.color);
    label.position.copy(dir.clone().multiplyScalar(ARROW_LEN + 0.42));
    navScene.add(label);
  });

  const GIZMO_SIZE = 76, MARGIN_X = 12, MARGIN_BOTTOM = 12;
  const getRect = (mount) => ({ x: MARGIN_X, y: mount.clientHeight - MARGIN_BOTTOM - GIZMO_SIZE, w: GIZMO_SIZE, h: GIZMO_SIZE });

  function renderEachFrame(renderer, mount) {
    const cs = camStateRef.current;
    // Same spherical-to-cartesian formula ViewerModule's own updateCamera uses for the main camera
    // (target fixed at the origin here, small fixed radius) — keeps this gizmo's apparent rotation
    // exactly in sync with however the user has actually orbited the real 3D view, not an
    // approximation of it.
    const radius = 4;
    navCamera.position.set(
      radius * Math.sin(cs.phi) * Math.sin(cs.theta),
      radius * Math.cos(cs.phi),
      radius * Math.sin(cs.phi) * Math.cos(cs.theta)
    );
    navCamera.lookAt(0, 0, 0);

    const r = getRect(mount);
    const canvasH = mount.clientHeight;
    renderer.setViewport(r.x, canvasH - r.y - r.h, r.w, r.h);
    renderer.setScissor(r.x, canvasH - r.y - r.h, r.w, r.h);
    renderer.setScissorTest(true);
    // Skip the color clear for this one render call — WebGLRenderer.render() clears the current
    // viewport/scissor rect to the clear color first when autoClear is true (the default), which is
    // exactly what painted the flat card background before (or plain black, if navScene.background
    // weren't set at all — the very bug #189's original version had). Turning autoClear off here means
    // this render call draws straight on top of whatever pixels the main scene already left in that
    // corner (this function runs after the main scene's own renderer.render() call in ViewerModule's
    // animate() loop, and before the canvas is presented — see the call site), so the triad genuinely
    // floats over the 3D view with no background square at all. Depth still needs a fresh start within
    // just this rectangle (clearDepth() honors the active scissor rect) so the gizmo's own arrows/
    // labels don't get incorrectly z-tested against whatever depth values the main scene left behind
    // at those same pixels; autoClear is restored right after so every OTHER render call (the main
    // scene next frame, the compass) keeps its normal clear behavior.
    renderer.clearDepth();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(navScene, navCamera);
    renderer.autoClear = prevAutoClear;
    renderer.setScissorTest(false);
  }

  return { renderEachFrame };
}
