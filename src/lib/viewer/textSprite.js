// TASKS.csv #1443 — the 3D view's fixed-size text labels (hole ids, outcrop dips, sample ids), moved out of ViewerModule.jsx (its
// size cap, #1084). makeTextSprite draws the text on a canvas sprite that fitScreenLabels keeps LABEL_PX tall on screen; the
// comments of both were written in ViewerModule and are kept as they were (TASKS.csv #379, #380).
import * as THREE from "three";
import { declutterHoleLabels } from "./holeLabels.js"; // #1466

export const LABEL_PX = 16;
const LABEL_FONT = "600 32px 'Exo 2', system-ui, sans-serif";
export function makeTextSprite(text, { color = "#1a2028", bg = "rgba(255,255,255,0.85)" } = {}) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontSize = 32, padX = 10, padY = 6;
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false });
  const draw = () => {
    ctx.font = LABEL_FONT;
    const w = Math.ceil(ctx.measureText(text).width) + padX * 2, h = fontSize + padY * 2;
    canvas.width = w; canvas.height = h;
    ctx.font = LABEL_FONT;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(text, padX, h / 2);
    material.userData.labelAspect = w / h;
    texture.needsUpdate = true;
  };
  draw();
  if (document.fonts && !document.fonts.check(LABEL_FONT)) document.fonts.load(LABEL_FONT).then(() => { if (material.map) draw(); }).catch(() => {});
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, -0.35); // #379 — sit just above the collar on screen at any zoom, not on top of it
  sprite.renderOrder = 999; // draw after (on top of) opaque geometry — depthTest:false already ignores occlusion, this just keeps draw order consistent across sprites
  return sprite;
}

export function fitScreenLabels(group, camera, viewportH) {
  if (!group || !viewportH) return;
  const s = camera.isPerspectiveCamera
    ? (2 * LABEL_PX) / (viewportH * camera.projectionMatrix.elements[5])
    : (LABEL_PX * (camera.top - camera.bottom)) / (camera.zoom * viewportH);
  for (const sp of group.children) {
    const a = sp.material?.userData?.labelAspect;
    if (a) sp.scale.set(s * a, s, 1);
  }
}

// TASKS.csv #1466 / #1622 — each visible contour layer's labels (the boundary group's child flagged userData.contourLabels): kept
// LABEL_PX tall and, when `declutter`, thinned where they overlap, as the hole labels are
export function fitContourLabels(boundaryGroup, camera, width, height, declutter = true) {
  for (const g of boundaryGroup?.children || []) {
    if (!g.visible) continue;
    for (const c of g.children) {
      if (!c.userData?.contourLabels || !c.children.length) continue;
      fitScreenLabels(c, camera, height);
      if (declutter) declutterHoleLabels(c, camera, width, height);
    }
  }
}
