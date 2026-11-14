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
const PAD_X = 10, LABEL_H = 32 + 6 * 2; // font 32, padding 10 / 6
let probeCtx = null;
const labelWidths = (texts) => { probeCtx ||= document.createElement("canvas").getContext("2d"); probeCtx.font = LABEL_FONT; return texts.map((t) => Math.ceil(probeCtx.measureText(t).width) + PAD_X * 2); };
const labelSprite = () => {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true, sizeAttenuation: false }));
  sprite.center.set(0.5, -0.35); // #379
  sprite.renderOrder = 999;
  return sprite;
};
// into: sprites already made (fillTextSprites) to draw these texts on, instead of new ones
export function makeTextSprites(texts, { color = "#1a2028", bg = "rgba(255,255,255,0.85)" } = {}, into = null) {
  if (!texts.length) return [];
  const padX = PAD_X, h = LABEL_H;
  const sprites = into || texts.map(labelSprite);
  const draw = (first) => {
    const widths = labelWidths(texts);
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
      m.visible = true; // #3098 — a lazy sprite is drawn from here on
    });
  };
  draw(true);
  // the font may still be loading: draw the pages again with it (as makeTextSprite does), for the sprites still in use
  if (document.fonts && !document.fonts.check(LABEL_FONT)) document.fonts.load(LABEL_FONT).then(() => { if (sprites.some((s) => s.parent)) draw(false); }).catch(() => {});
  return sprites;
}
makeTextSprite.many = makeTextSprites; // #2795 — the syncs that pass makeTextSprite take the batch form when it is there

// TASKS.csv #3098 (#2937, WA iron) — 'Hole labels' on 6,390 holes took 1.7 s, most of it drawing and uploading ~17 atlas pages
// for labels the declutter then hid (at Fit it shows a few hundred). The hole labels are made lazily: each sprite is measured
// (its labelAspect, for the declutter and fitScreenLabels) but has no texture and its material is not drawn; fillTextSprites
// draws the ones the declutter shows (or a Layout capture needs) into atlas pages of their own, as makeTextSprites does.
export function makeLazyTextSprites(texts) {
  const widths = labelWidths(texts);
  return texts.map((text, i) => {
    const sp = labelSprite();
    sp.material.visible = false;
    sp.material.userData.labelAspect = widths[i] / LABEL_H;
    sp.material.userData.labelText = text; // on the material: the syncs replace a sprite's userData with its tip
    return sp;
  });
}
// sprites: lazy ones; those already drawn are skipped. -> how many were drawn
export function fillTextSprites(sprites) {
  const todo = sprites.filter((sp) => sp.material?.userData?.labelText != null && !sp.material.map);
  if (!todo.length) return 0;
  makeTextSprites(todo.map((sp) => sp.material.userData.labelText), {}, todo);
  return todo.length;
}
makeTextSprite.lazy = makeLazyTextSprites;

// TASKS.csv #3399 (Matt: 'also draw callouts in the 3d view where more than 1 drill hole is located'; Orion_2026's 'OR-26-01 +2') — a pad's
// callout: a box listing each hole (a swatch of its colour when the holes are coloured by a collar field), up and to the right of the collar
// with a short leader down to it. One canvas per callout (pads are few). The sprite's bottom-left corner is the collar; labelLines: its height
// in label lines, for fitScreenLabels and the declutter's boxes. lines: [{ text, colour? }]
export const CALLOUT_MAX_LINES = 12;
export function makeCalloutSprite(lines, { color = "#1a2028", bg = "rgba(255,255,255,0.92)", border = "rgba(26,32,40,0.35)" } = {}) {
  const all = lines || [], shown = all.length > CALLOUT_MAX_LINES ? [...all.slice(0, CALLOUT_MAX_LINES - 1), { text: `+${all.length - CALLOUT_MAX_LINES + 1}` }] : all;
  const lineH = 40, padX = 10, padY = 6, sw = shown.some((l) => l.colour) ? 28 : 0, leadW = 34, leadH = 30;
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false });
  const draw = () => {
    ctx.font = LABEL_FONT;
    let tw = 10; for (const l of shown) tw = Math.max(tw, ctx.measureText(l.text).width);
    const boxW = Math.ceil(tw) + padX * 2 + sw, boxH = shown.length * lineH + padY * 2;
    canvas.width = leadW + boxW; canvas.height = boxH + leadH;
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(1.5, canvas.height - 1.5); ctx.lineTo(leadW + 2, boxH - 2); ctx.stroke(); // the leader: collar (bottom-left) to the box's corner
    ctx.fillStyle = bg; ctx.fillRect(leadW, 0, boxW, boxH);
    ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.strokeRect(leadW + 1, 1, boxW - 2, boxH - 2);
    ctx.font = LABEL_FONT; ctx.textBaseline = "middle";
    shown.forEach((l, i) => {
      const y = padY + i * lineH + lineH / 2;
      if (l.colour) { ctx.fillStyle = l.colour; ctx.fillRect(leadW + padX, y - 10, 20, 20); ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.strokeRect(leadW + padX + 0.5, y - 9.5, 19, 19); }
      ctx.fillStyle = color; ctx.fillText(l.text, leadW + padX + sw, y);
    });
    material.userData.labelAspect = canvas.width / canvas.height;
    material.userData.labelLines = canvas.height / LABEL_H;
    texture.needsUpdate = true;
  };
  draw();
  if (document.fonts && !document.fonts.check(LABEL_FONT)) document.fonts.load(LABEL_FONT).then(() => { if (material.map) draw(); }).catch(() => {});
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0, 0);
  sprite.renderOrder = 999;
  return sprite;
}
makeTextSprite.callout = makeCalloutSprite;
makeTextSprite.fill = fillTextSprites;

export function fitScreenLabels(group, camera, viewportH) {
  if (!group || !viewportH) return;
  const s = camera.isPerspectiveCamera
    ? (2 * LABEL_PX) / (viewportH * camera.projectionMatrix.elements[5])
    : (LABEL_PX * (camera.top - camera.bottom)) / (camera.zoom * viewportH);
  for (const sp of group.children) {
    const a = sp.material?.userData?.labelAspect, L = sp.material?.userData?.labelLines || 1; // L: a callout's lines (#3399)
    if (a) sp.scale.set(s * a * L, s * L, 1);
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
