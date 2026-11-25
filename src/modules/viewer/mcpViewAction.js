// TASKS.csv #3932 (Matt's decision, 2026-11-21) — an AI app's view tools (colour_holes, show_layers, set_view; lib/mcpActions.js, only while 'Allow AI apps to make changes'
// is on) carried out in StrixViewer with its own setters and camera functions, as its controls do. ViewerModule passes a getter (`ctx()`, read when a request arrives, so
// the call can sit anywhere in the component). Each answer carries `revert`, which puts back exactly what it changed (the view is not in GeoStrix's undo history: the
// toast's Undo is what takes it back). Pure apart from the setters it is given; viewAction is exported for the tests.

const lower = (v) => String(v ?? "").trim().toLowerCase();
const fail = (error) => ({ ok: false, error });

// ctx: { collars, layers, assayElements, terrain, updateTerrain, sections, holeColourBy, setHoleColourBy, layerVisible, setLayerVisible, assayVisible, setAssayVisible,
//        assayDisplayElements, setAssayDisplayElements, toggleAssayElement, camState, cameraRef, fitButton, zoomToHole, reopenSection }
export function viewAction(c, p) {
  if (!p || typeof p !== "object") return fail("Nothing asked.");
  const fields = () => { const seen = new Map(); for (const h of c.collars || []) for (const k of Object.keys(h?.attrs || {})) if (!seen.has(lower(k))) seen.set(lower(k), k); return seen; };
  const layerKeys = () => Object.keys(c.layers || {}).filter((k) => (c.layers[k] || []).length);
  if (p.op === "colour") {
    if (p.by === "none") { const was = c.holeColourBy; c.setHoleColourBy(""); return { ok: true, changed: "hole colours", name: "one colour", revert: () => c.setHoleColourBy(was) }; }
    if (!p.name) return fail(`'name' is needed with by: '${p.by}'.`);
    if (p.by === "field") {
      const f = fields().get(lower(p.name));
      if (!f) return fail(`No collar field '${String(p.name).slice(0, 64)}'. The fields: ${[...fields().values()].slice(0, 20).join(", ") || "none"}.`);
      const was = c.holeColourBy; c.setHoleColourBy(f);
      return { ok: true, changed: "hole colours", name: f, revert: () => c.setHoleColourBy(was) };
    }
    if (p.by === "element") { // StrixViewer shows grades as the assay display along the holes: this element alone, switched on
      const e = (c.assayElements || []).find((x) => lower(x.symbol) === lower(p.name));
      if (!e) return fail(`No element '${String(p.name).slice(0, 32)}' in this project's assays. Available: ${(c.assayElements || []).map((x) => x.symbol).slice(0, 40).join(", ") || "none"}.`);
      const wasOn = c.assayVisible, wasList = c.assayDisplayElements || [];
      c.setAssayVisible(true);
      c.setAssayDisplayElements((L) => (L || []).filter((s) => s === e.symbol));
      if (!wasList.includes(e.symbol)) c.toggleAssayElement(e.symbol); // as the element's own tick: it seeds the grade colours the first time
      return { ok: true, changed: "assay display", name: e.symbol, revert: () => { c.setAssayDisplayElements(wasList); c.setAssayVisible(wasOn); } };
    }
    if (p.by === "layer") { // a logged layer colours its own intervals by code: switched on
      const k = layerKeys().find((x) => lower(x) === lower(p.name));
      if (!k) return fail(`No logged layer '${String(p.name).slice(0, 64)}' with intervals. list_layers gives the keys: ${layerKeys().join(", ") || "none"}.`);
      const was = !!c.layerVisible?.[k];
      c.setLayerVisible((v) => ({ ...v, [k]: true }));
      return { ok: true, changed: "layers shown", name: k, revert: () => c.setLayerVisible((v) => ({ ...v, [k]: was })) };
    }
    return fail("'by' must be element, layer, field or none.");
  }
  if (p.op === "layers") {
    const want = [...new Set((p.layers || []).map(lower))], on = !!p.visible, keys = layerKeys(), done = [], unknown = [];
    const prevLayers = { ...(c.layerVisible || {}) }, prevAssays = c.assayVisible, prevTerrain = c.terrain ? c.terrain.visible !== false : null;
    const patch = {};
    for (const w of want) {
      const k = keys.find((x) => lower(x) === w);
      if (k) { patch[k] = on; done.push(k); }
      else if (w === "assays") { c.setAssayVisible(on); done.push("assays"); }
      else if (w === "terrain" && c.terrain) { c.updateTerrain({ visible: on }); done.push("terrain"); }
      else unknown.push(w);
    }
    if (!done.length) return fail(`None of these is a layer here: ${unknown.join(", ")}. The keys are those list_layers gives (${keys.join(", ") || "none"}), and 'assays'${c.terrain ? " and 'terrain'" : ""}.`);
    if (Object.keys(patch).length) c.setLayerVisible((v) => ({ ...v, ...patch }));
    return { ok: true, changed: "layers shown", name: done.join(", "), layers: done, visible: on, ...(unknown.length ? { not_found: unknown } : {}),
      revert: () => { c.setLayerVisible((v) => { const n = { ...v }; for (const k of Object.keys(patch)) n[k] = prevLayers[k]; return n; }); if (done.includes("assays")) c.setAssayVisible(prevAssays); if (done.includes("terrain") && prevTerrain != null) c.updateTerrain({ visible: prevTerrain }); } };
  }
  if (p.op === "view") {
    const cs = c.camState?.current;
    const saved = cs ? { theta: cs.theta, phi: cs.phi, radius: cs.radius, target: cs.target?.clone?.() || null } : null;
    const back = () => { const k = c.camState?.current; if (!k || !saved) return; k.theta = saved.theta; k.phi = saved.phi; k.radius = saved.radius; if (saved.target && k.target?.copy) k.target.copy(saved.target); c.cameraRef?.current?.__update?.(); };
    const update = () => c.cameraRef?.current?.__update?.();
    if (p.view === "fit") { c.fitButton(); return { ok: true, changed: "view", name: "fit", revert: back }; }
    if (p.view === "top") { if (cs) { cs.theta = 0; cs.phi = 0.02; } update(); return { ok: true, changed: "view", name: "top", revert: back }; } // the Top button's own camera
    if (p.view === "bottom") { if (cs) cs.phi = Math.PI - 0.02; update(); return { ok: true, changed: "view", name: "bottom", revert: back }; } // the Bottom button's
    if (p.view === "hole") {
      const h = (c.collars || []).find((x) => lower(x.hole_id) === lower(p.target));
      if (!h) return fail(`No hole '${String(p.target ?? "").slice(0, 64)}' in this project. list_holes shows the ids.`);
      c.zoomToHole(h.hole_id);
      return { ok: true, changed: "view", name: h.hole_id, revert: back };
    }
    if (p.view === "section") { // a section is looked at in its own window, as its row in the list opens it
      const s = (c.sections || []).find((x) => lower(x.name) === lower(p.target) || lower(x.id) === lower(p.target));
      if (!s) return fail(`No section '${String(p.target ?? "").slice(0, 128)}'. list_sections shows them.`);
      c.reopenSection(s);
      return { ok: true, changed: "section window", name: s.name };
    }
    return fail("'view' must be fit, top, bottom, section or hole.");
  }
  return fail("Unknown view request.");
}
