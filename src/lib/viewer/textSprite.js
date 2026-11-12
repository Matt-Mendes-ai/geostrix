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

// TASKS.csv #2795 (#2496, WA lithium) — 'Hole labels: Hole ID' on 2,248 holes froze the window ~1.5 s: a canvas, a 2D context and a
// GPU texture per label (makeTextSprite above, 0.65 s to draw, then one upload each on the first frame). The many-label syncs
// (hole labels, sample and outcrop labels) draw every label into a few shared atlas canvases instead: each sprite keeps its own
// SpriteMaterial and its own Texture (a clone whose offset / repeat pick its cell), but the clones share the page's image, which
// three.js uploads once per page. Each sprite looks as makeTextSprite's would: same font, padding, colours, centre, render order
// and material.userData.labelAspect (fitScreenLabels, labelBoxes). Disposing a sprite's map frees the page with its last user.
export const ATLAS_W = 2048;
const ATLAS_MAX_H = 2048, ATLAS_GAP = 2;
// texts + widths -> cells { page, x, y, w } in rows of `h`, pages ATLAS_W wide and at most ATLAS_MAX_H tall; and each page's height
export function atlasLayout(widths, h, { width = ATLAS_W, maxH = ATLAS_MAX_H, gap = ATLAS_GAP } = {}) {
  const cells = [], pages = [];
  let page = 0, x = 0, y = 0;
  for (const w0 of widths) {
    const w = Math.min(w0, width);
    if (x > 0 && x + w > width) { x = 0; y += h + gap; }
    if (y + h > maxH) { pages.push(y); page++; x = 0; y = 0; }
    cells.push({ page, x, y, w });
    x += w + gap;
  }
  if (widths.length) pages.push(y + h);
  return { cells, pageHeights: pages };
}
export function makeTextSprites(texts, { color = "#1a2028", bg = "rgba(255,255,255,0.85)" } = {}) {
  if (!texts.length) return [];
  const fontSize = 32, padX = 10, padY = 6, h = fontSize + padY * 2;
  const probe = document.createElement("canvas").getContext("2d");
  const sprites = texts.map(() => {
    const material = new THREE.SpriteMaterial({ depthTest: false, transparent: true, sizeAttenuation: false });
    const sprite = new THREE.Sprite(material);
    sprite.center.set(0.5, -0.35); // #379
    sprite.renderOrder = 999;
    return sprite;
  });
  const draw = (first) => {
    probe.font = LABEL_FONT;
    const widths = texts.map((t) => Math.ceil(probe.measureText(t).width) + padX * 2);
    const { cells, pageHeights } = atlasLayout(widths, h);
    const newPages = pageHeights.map((ph) => { const c = document.createElement("canvas"); c.width = ATLAS_W; c.height = ph; const ctx = c.getContext("2d"); ctx.font = LABEL_FONT; ctx.textBaseline = "middle"; return { canvas: c, ctx, texture: null }; });
    cells.forEach((cell, i) => {
      const { ctx } = newPages[cell.page];
      ctx.fillStyle = bg; ctx.fillRect(cell.x, cell.y, cell.w, h);
      ctx.fillStyle = color; ctx.fillText(texts[i], cell.x + padX, cell.y + h / 2); // the cell is the text's own width
    });
    for (const p of newPages) { p.texture = new THREE.CanvasTexture(p.canvas); p.texture.minFilter = THREE.LinearFilter; p.texture.generateMipmaps = false; }
    cells.forEach((cell, i) => {
      const page = newPages[cell.page], H = page.canvas.height, m = sprites[i].material;
      if (!first && !sprites[i].parent) return; // cleared before the font arrived
      const t = page.texture.clone(); // shares the page's image (one upload); its own offset / repeat
      t.repeat.set(cell.w / ATLAS_W, h / H);
      t.offset.set(cell.x / ATLAS_W, 1 - (cell.y + h) / H); // flipY: v runs up from the canvas bottom
      t.needsUpdate = true;
      const old = m.map; m.map = t; m.needsUpdate = true; old?.dispose?.();
      m.userData.labelAspect = cell.w / h;
    });
  };
  draw(true);
  // the font may still be loading: draw the pages again with it (as makeTextSprite does), for the sprites still in use
  if (document.fonts && !document.fonts.check(LABEL_FONT)) document.fonts.load(LABEL_FONT).then(() => { if (sprites.some((s) => s.parent)) draw(false); }).catch(() => {});
  return sprites;
}
makeTextSprite.many = makeTextSprites; // #2795 — the syncs that pass makeTextSprite take the batch form when it is there

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
