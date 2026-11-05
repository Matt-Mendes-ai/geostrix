// TASKS.csv #1485 (review #1352, Silvertip) — a section snapshot's text at a plot scale: said, and the snapshot taken again for it
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sectionTextPt, sectionTextFactor } from "../src/lib/layoutGeometry.js";
import { PLACED_W, printPt } from "../src/lib/theme.js";

test("#1485 the caption prints at 7 pt at the placed width, 2.9 pt at the review's 1:10,000 width, and 7 pt again after a re-snapshot", () => {
  assert.equal(PLACED_W, 700); assert.equal(printPt.caption, 7);
  assert.equal(sectionTextPt({ type: "image", w: 700, h: 420 }), 7);
  assert.equal(sectionTextPt({ type: "image", w: 460, h: 614 }), 4.6, "the 1,100 px figure placed 460 px wide (x 0.418): about 4.6 page px, 3.5 pt on paper");
  const f = sectionTextFactor({ w: 460 });
  assert.ok(Math.abs(f - 700 / 460) < 1e-3);
  assert.equal(sectionTextPt({ w: 460, textFactor: f }), 7, "taken again with that factor, the text prints at the caption size");
  assert.equal(sectionTextPt({ w: 0 }), null);
  assert.equal(sectionTextPt(null), null);
  assert.equal(sectionTextFactor({ w: 0 }), 1);
});

test("#1485 the section window answers a re-snapshot request, Layout replaces the picture and offers the button", () => {
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.ok(s.includes("onSectionResnap((m) => { if (m && tabId && m.tabId === tabId) resnapRef.current?.({ textFactor: m.textFactor, replaceElementId: m.elementId, round: m.round || 0 }); })"));
  assert.ok(s.includes("sectionTabId: tabId, textFactor: Number(textFactor) > 0 ? Number(textFactor) : 1, replaceElementId: replaceElementId || null"));
  const l = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.ok(l.includes("const replacing = pendingLayoutImages.filter((img) => img.replaceElementId && elements.some((el) => el.id === img.replaceElementId));"));
  assert.ok(l.includes('tr("Re-snapshot with the text at print size")') && l.includes("sendSectionResnap({ tabId: sel.sectionTabId, elementId: sel.id, textFactor: sectionTextFactor(sel) })"));
  const d = readFileSync(new URL("../src/lib/desktop.js", import.meta.url), "utf8");
  assert.ok(d.includes('const RESNAP_CHANNEL = "geox-section-resnap"'));
});

test("#1485 a re-snapshot keeps the element's plot scale and asks again (at most 3 rounds) while the text is off 7 pt", () => {
  const l = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.ok(l.includes("const w = denom && world ? Math.round(sectionWidthForScale({ worldWidthAtCaptureM: world }, denom)) : el.w;"));
  assert.ok(l.includes("Math.abs(pt - 7) > 0.7 && round < 3 && upd.sectionTabId"));
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.ok(s.includes("resnapRound: round") && s.includes("round: m.round || 0"));
});
