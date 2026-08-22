import React, { useState, useRef, useEffect } from "react";
import { Plus, Image as ImageIcon, Type, Compass, Ruler, FileDown, MonitorPlay, RefreshCw, Grid3x3, Trash2, Square, ArrowUpRight, Pencil, MessageSquare, Save, FolderOpen, LogIn } from "lucide-react";
import { savePDF } from "../lib/desktop.js";
import { useStore } from "../lib/store.jsx";
import PromptModal from "../components/PromptModal.jsx";
import { colorForLithology, UNIT_NAMES, distinctValues, minMax } from "../lib/layers.js";
import SidebarResizeHandle from "../components/SidebarResizeHandle.jsx";
import { useSidebarWidth } from "../lib/useSidebarWidth.js";

// A simple drag-and-drop page-layout canvas. Elements are absolutely positioned on an A4-landscape
// page; "Export PDF" prints the page via the Electron main process (or the browser print dialog).

const A4 = { w: 1123, h: 794 }; // px at ~96dpi landscape
const SCALE_BAR_PX = 180; // default/initial bar length (px) for a freshly-added, never-synced scale bar
const PX_PER_MM = 96 / 25.4; // matches the ~96dpi assumption used throughout Layout (scale bar, viewport scale estimate)
const DEFAULT_PX_PER_METER = SCALE_BAR_PX / 100; // a plain "Add scale bar" starts at 100 m / 180 px, same as before this element gained a real px-per-metre ratio

// "Customize the scale bar by changing the number, but without changing the scale — if I change 200
// to 300 the SIZE of the bar has to change." A scale element now carries pxPerMeter: how many on-page
// pixels one real-world metre occupies, fixed at whatever the last sync established (or the default
// above for a freeform bar that's never been synced to a view). The bar's rendered length is always
// `meters * pxPerMeter` (see the "scale" branch of LayoutElement below) — so typing a new distance
// into the "Scale length (m)" field grows/shrinks the bar to match, instead of silently relabeling a
// fixed-width bar with a number that no longer matches its own printed length.
function niceScaleNumber(x) {
  if (!isFinite(x) || x <= 0) return 100;
  const exp = Math.floor(Math.log10(x));
  const base = x / Math.pow(10, exp);
  let nice;
  if (base < 1.5) nice = 1;
  else if (base < 3.5) nice = 2;
  else if (base < 7.5) nice = 5;
  else nice = 10;
  return Math.round(nice * Math.pow(10, exp));
}

export default function LayoutModule() {
  const {
    pendingLayoutImages, consumeLayoutImage,
    themes, requestViewportRender, goToModule,
    layoutSelectRequest, setLayoutSelectRequest,
    // TASKS.csv #68 — page contents now live in the store (layoutElements/setLayoutElements),
    // renamed locally to `elements`/`setElements` so the rest of this file — written against a plain
    // local useState — didn't need to change. Previously this was `useState([...4 starter
    // elements])` right here, which reset to that same starter set every time LayoutModule
    // unmounted (i.e. every trip to another tab, including the Viewer round-trip that "Add
    // viewport"/"Refresh" themselves force) — a real layout could be wiped out just by using its own
    // core feature. Now it survives tab switches and round-trips through project save/load.
    layoutElements: elements, setLayoutElements: setElements,
    layoutTemplates, addLayoutTemplate, renameLayoutTemplate, deleteLayoutTemplate,
    // TASKS.csv #69 — multiple layout pages per project (see store.jsx's own comment on
    // layoutPages/layoutElements for how these two coexist: `elements`/`setElements` above already
    // transparently follow whichever page is active).
    layoutPages, activeLayoutPageId, switchLayoutPage, addLayoutPage, renameLayoutPage, deleteLayoutPage,
    // Legend "load lithologies from the bound view" (below) needs the actual litho rows — a theme
    // only records which units were filtered/hidden at capture time, not the vocabulary itself.
    layers,
    // TASKS.csv #101 — same "must survive the Viewer round-trip unmount" reasoning as elements/
    // layoutSelectRequest above: local state here would silently drop the grid's viewport binding
    // every time Enter/Refresh switches away to the 3D View tab and back.
    gridBoundViewportId, setGridBoundViewportId, gridMeters, setGridMeters,
  } = useStore();
  const [selected, setSelected] = useState(null);
  // User request: "let's make some keyboard shortcuts. Like on layout we could have delete key to
  // delete the selected item, and ctrl + click to select multiple items." `selected` stays the single
  // "active" element (the one the properties sidebar edits — multi-selection doesn't get its own bulk-
  // edit panel, out of scope here). `multiSelected` is a separate id set for bulk delete/move only;
  // it's empty/single-member in the normal case and only becomes meaningful once the user starts
  // Ctrl+clicking a second element.
  const [multiSelected, setMultiSelected] = useState(() => new Set());
  // User-facing feedback for the scale-bar/legend sync actions — these used to fail silently (a
  // missing theme, a hidden layer, no captured scale yet), which reads as "the button just doesn't do
  // anything." Now every path — success or a specific reason it can't — sets a short message shown
  // right under the button; cleared when selection changes so a stale message from a different element
  // doesn't linger.
  const [syncNotice, setSyncNotice] = useState("");
  const [sidebarWidth, setSidebarWidth] = useSidebarWidth();
  const dragState = useRef(null);
  const pageRef = useRef(null);
  const logoInput = useRef(null);
  const importedSnapCount = useRef(0);

  // TASKS.csv #19 — more shapes/annotation tools. Rect/arrow/callout are click-to-place-then-adjust
  // (like every other element here); freehand is the odd one out — it needs to capture a drag
  // gesture rather than being placed then resized, so it gets its own "drawing mode" toggle and
  // window-level mousemove/mouseup listeners (same pattern SectionWindow.jsx's contact-drawing tool
  // uses, just single-shot instead of multi-point-click).
  const [freehandTool, setFreehandTool] = useState(false);
  const [freehandPoints, setFreehandPoints] = useState([]);
  const freehandDrawing = useRef(false);
  // Bug fix (user report: "free hand tool in layout is creating numerous lines"). Points were tracked
  // ONLY in the freehandPoints state and read back out via a setFreehandPoints functional updater in
  // onUp — which also called setElements/setSelected *inside* that updater. Calling other components'
  // setState from inside a setState updater function runs during React's render phase (confirmed via
  // React's own "Cannot update a component while rendering a different component" console warning,
  // reproduced with Playwright), which is undefined-behavior territory — React is allowed to invoke a
  // functional updater more than once, and each invocation was pushing a fresh freehand element onto
  // the page, so a single stroke could commit itself multiple times. Fixed by tracking the in-progress
  // stroke in a plain ref (read directly in onUp, no functional-updater trick) and only ever calling
  // setElements/setSelected/setFreehandPoints from the actual event handler body, never from inside
  // another setState's updater.
  const freehandPointsRef = useRef([]);

  // TASKS.csv #18 — saved layout templates.
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // TASKS.csv #78 — drag-and-drop image import onto the page (see onPageDrop below).
  const [dragOverPage, setDragOverPage] = useState(false);

  // TASKS.csv #67 — QGIS-style alignment grid + rulers. Local view-state only (like `selected`
  // below), not persisted with the project — a display aid, not page content. gridMm is the grid
  // spacing AND the snap increment when dragging (real print-composer tools tie these together too).
  const [showGrid, setShowGrid] = useState(false);
  const [gridMm, setGridMm] = useState(10);
  // TASKS.csv #101 — the page's own grid was always paper-space (mm), with no way to lay a
  // real-world-scaled grid (e.g. "100m grid") directly over a bound Viewport the way a printed topo
  // sheet would. Binding to a viewport switches the grid's unit from mm to metres and derives its
  // pixel spacing from that viewport's OWN captured scale (worldHeightAtTarget / its pixel height —
  // the same FOV/target-distance math #46/#69 already compute) instead of a fixed mm value — since
  // this is a plain derived read of that element's current state (not copied/cached anywhere), it
  // automatically follows the viewport's scale whenever it's refreshed/rebound. gridBoundViewportId
  // and gridMeters themselves come from the store (destructured above), NOT local useState — see
  // that destructure's own comment for why local state doesn't survive the Enter/Refresh round trip.

  // ---- Viewport element (TASKS.csv #46): bound to a theme (#45), re-rendered on demand via the
  // request/result round-trip in store.jsx (LayoutModule and ViewerModule are never both mounted).
  // TASKS.csv #70 — the pending-request bookkeeping and the "apply the result to layoutElements"
  // logic used to live here as local refs/state, which broke because LayoutModule itself unmounts
  // during the round-trip (see the long comment in store.jsx next to viewportPendingRequest). Both
  // now live in the store, which never unmounts; this component just kicks off the request and
  // consumes `layoutSelectRequest` to select whatever the store just created/refreshed.
  const [themePickerFor, setThemePickerFor] = useState(null); // null | "new" | elementId — which viewport is choosing/rebinding a theme

  // TASKS.csv #16/#17: drain any 3D-viewport / cross-section snapshots that were queued while this
  // module wasn't mounted (ViewerModule and the section pop-out both push onto the store's queue and
  // don't care whether Layout happens to be open). Each becomes an "image" element sized to fit the
  // page while preserving its captured aspect ratio, staggered slightly so several in a row don't
  // land exactly on top of each other.
  useEffect(() => {
    if (!pendingLayoutImages.length) return;
    const maxW = A4.w - 160;
    const additions = pendingLayoutImages.map((img) => {
      const aspect = img.naturalW && img.naturalH ? img.naturalW / img.naturalH : 16 / 9;
      const w = Math.min(maxW, 700);
      const h = Math.round(w / aspect);
      const stagger = (importedSnapCount.current++ % 5) * 24;
      // worldWidthAtCaptureM (cross-section snapshots only — see SectionWindow.jsx's
      // snapshotToLayout) is the real-world horizontal span the image represented at its native
      // naturalW pixel width; carried through so a scale bar can be assigned to it below, the same
      // way viewport snapshots already carry worldHeightAtTarget.
      // legendItems (cross-section snapshots only — see SectionWindow.jsx's snapshotToLayout and
      // ViewerModule's buildSectionPayload): the exact {label,color} pairs actually drawn in this
      // section, so a legend bound to this image (see syncLegendLithologies below) can match it
      // without needing a live theme, which a flattened snapshot doesn't have.
      return { id: img.id, type: "image", label: img.label || "Snapshot", src: img.src, aspect, x: 90 + stagger, y: 90 + stagger, w, h, worldWidthAtCaptureM: img.worldWidthAtCaptureM ?? null, naturalW: img.naturalW, naturalH: img.naturalH, legendItems: img.legendItems || null };
    });
    setElements((els) => [...els, ...additions]);
    setSelected(additions[additions.length - 1]?.id ?? null);
    pendingLayoutImages.forEach((img) => consumeLayoutImage(img.id));
  }, [pendingLayoutImages, consumeLayoutImage]);

  useEffect(() => { setSyncNotice(""); }, [selected]);

  // Kick off a (re-)render of a theme for a Viewport element. targetElementId is "new" to create a
  // fresh element once the render comes back, or an existing element's id to refresh it in place.
  // TASKS.csv #69 — trueScale threads through to ViewerModule's capture effect (see store.jsx's
  // requestViewportRender and ViewerModule's viewportRenderRequestSeq effect): when set, the capture
  // uses an orthographic camera instead of the live perspective one, which makes the computed
  // world-scale exact everywhere in the image rather than only approximately right at the camera's
  // target distance (see ViewportControls' scale readout below for the user-facing explanation).
  const startViewportRender = (themeId, targetElementId, trueScale) => {
    const theme = themes.find((t) => t.id === themeId);
    if (!theme) return;
    if (targetElementId !== "new") {
      setElements((els) => els.map((el) => el.id === targetElementId ? { ...el, themeId, refreshing: true } : el));
    }
    requestViewportRender(themeId, targetElementId, trueScale);
    setThemePickerFor(null);
    goToModule("viewer");
  };

  // TASKS.csv #198 (part 3) — "Enter" an existing Viewport for live orbit/pan/zoom instead of an
  // instant re-render. Only makes sense for an EXISTING element (never "new" — you can't enter a
  // viewport that doesn't exist yet), so this only gets wired up from ViewportControls, not the
  // "Add viewport" theme picker. Same shape as startViewportRender, just with interactive:true —
  // ViewerModule's render effect (see its own long comment) does the rest: apply the theme, then
  // wait for the user to exit instead of auto-capturing after 400ms.
  const startInteractiveViewportEdit = (themeId, targetElementId, trueScale) => {
    const theme = themes.find((t) => t.id === themeId);
    if (!theme) return;
    setElements((els) => els.map((el) => el.id === targetElementId ? { ...el, themeId, refreshing: true } : el));
    requestViewportRender(themeId, targetElementId, trueScale, true);
    setThemePickerFor(null);
    goToModule("viewer");
  };

  // Store applies the render result to layoutElements itself (it survives the unmount this round-trip
  // causes) and drops the target element's id into layoutSelectRequest as a one-shot "select this
  // when you're next mounted" signal — pick it up and clear it so it doesn't re-fire.
  useEffect(() => {
    if (!layoutSelectRequest) return;
    setSelected(layoutSelectRequest);
    setLayoutSelectRequest(null);
  }, [layoutSelectRequest, setLayoutSelectRequest]);

  const onDown = (e, el) => {
    // Ctrl/Cmd+click toggles this element in/out of the multi-selection instead of starting a drag or
    // replacing the current selection — the standard "add to selection" gesture (Illustrator, Figma,
    // QGIS's own print composer). Seeds the group from whatever was singly-selected before the first
    // Ctrl+click, so "select A, then Ctrl+click B" ends up with {A,B} selected, not just {B}.
    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      setMultiSelected((prev) => {
        const base = prev.size > 1 ? prev : new Set(selected ? [selected] : []);
        const next = new Set(base);
        if (next.has(el.id)) next.delete(el.id); else next.add(el.id);
        return next;
      });
      setSelected(el.id);
      return;
    }
    const isGroupDrag = multiSelected.has(el.id) && multiSelected.size > 1;
    if (!isGroupDrag) setMultiSelected(new Set());
    setSelected(el.id);
    const rect = pageRef.current.getBoundingClientRect();
    dragState.current = isGroupDrag
      ? {
          id: el.id, offX: e.clientX - rect.left - el.x, offY: e.clientY - rect.top - el.y,
          groupOrigin: new Map(elements.filter((e2) => multiSelected.has(e2.id)).map((e2) => [e2.id, { x: e2.x, y: e2.y }])),
        }
      : { id: el.id, offX: e.clientX - rect.left - el.x, offY: e.clientY - rect.top - el.y, groupOrigin: null };
  };
  // TASKS.csv #101 — derived (not stored) so it always reflects the bound viewport's LATEST scale.
  // Falls back to null (and the grid behaves exactly as before, mm-based) if nothing's bound, the
  // bound element was deleted, or that viewport hasn't been rendered yet (no worldHeightAtTarget/h
  // to compute a scale from).
  const boundViewportEl = gridBoundViewportId ? elements.find((el) => el.id === gridBoundViewportId && el.type === "viewport") : null;
  const metersPerPx = boundViewportEl?.worldHeightAtTarget && boundViewportEl?.h ? boundViewportEl.worldHeightAtTarget / boundViewportEl.h : null;
  const gridSnapPx = metersPerPx ? gridMeters / metersPerPx : gridMm * PX_PER_MM;
  // A bound viewport that gets deleted (or was never a viewport to begin with) shouldn't leave a
  // stale, silently-ignored id sitting in the picker — snap back to "None" so the UI stays truthful.
  useEffect(() => {
    if (gridBoundViewportId && !boundViewportEl) setGridBoundViewportId("");
  }, [gridBoundViewportId, boundViewportEl]);

  // Bound at the window level (not just on the page div) so a fast drag that outruns the cursor past
  // the page edge — or into the sidebar — doesn't leave dragState "stuck": mousemove/mouseup only
  // fired while the cursor stayed over .ge-main before, so releasing the button anywhere else left
  // the element following the cursor indefinitely until the next click landed back inside .ge-main.
  useEffect(() => {
    const snapPx = gridSnapPx;
    const onMove = (e) => {
      if (!dragState.current || !pageRef.current) return;
      const rect = pageRef.current.getBoundingClientRect();
      let x = e.clientX - rect.left - dragState.current.offX;
      let y = e.clientY - rect.top - dragState.current.offY;
      if (showGrid) { x = Math.round(x / snapPx) * snapPx; y = Math.round(y / snapPx) * snapPx; }
      x = Math.round(x); y = Math.round(y);
      const { id, groupOrigin } = dragState.current;
      if (groupOrigin) {
        // Multi-element drag (started on a member of a >1 Ctrl+click selection): move every selected
        // element by the same delta the primary (grabbed) element moved, so the group's relative
        // layout is preserved rather than everything collapsing onto the cursor.
        const origin = groupOrigin.get(id);
        const dx = x - origin.x, dy = y - origin.y;
        setElements((els) => els.map((el) => groupOrigin.has(el.id) ? { ...el, x: groupOrigin.get(el.id).x + dx, y: groupOrigin.get(el.id).y + dy } : el));
      } else {
        setElements((els) => els.map((el) => el.id === id ? { ...el, x, y } : el));
      }
    };
    const onUp = () => { dragState.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [showGrid, gridSnapPx]);

  const addElement = (type) => {
    const id = `${type}_${Date.now()}`;
    const base = { id, type, x: 100, y: 100 };
    if (type === "text") base.text = "Text", base.w = 200;
    if (type === "logo") logoInput.current.click();
    if (type === "scale") { base.meters = 100; base.pxPerMeter = DEFAULT_PX_PER_METER; }
    if (type === "legend") base.items = [["Item", "#55606e"]];
    // TASKS.csv #19 — shapes/annotation
    if (type === "rect") { base.w = 180; base.h = 110; base.stroke = "#1a2028"; base.strokeWidth = 2; base.fill = "#ffffff"; base.fillOpacity = 0; }
    if (type === "arrow") { base.length = 140; base.angle = 0; base.stroke = "#1a2028"; base.strokeWidth = 2.5; }
    if (type === "callout") { base.text = "Note"; base.w = 180; base.fill = "#fff9e0"; base.stroke = "#c9a227"; }
    if (type !== "logo") setElements((els) => [...els, base]);
    setSelected(type !== "logo" ? id : null);
  };

  // TASKS.csv #19 — freehand pen. Toggled on from the palette; the next mousedown-drag on the page
  // captures points (in page-relative px, same coordinate space as every other element's x/y — the
  // page isn't CSS-scaled, so clientX/Y minus the page's own bounding-rect origin is exactly right)
  // until mouseup, then commits a single "freehand" element and turns the tool back off — a one-shot
  // draw, not a persistent mode, so it can't be left on by accident.
  const startFreehand = (e) => {
    if (!freehandTool) return;
    freehandDrawing.current = true;
    const rect = pageRef.current.getBoundingClientRect();
    const first = [e.clientX - rect.left, e.clientY - rect.top];
    freehandPointsRef.current = [first];
    setFreehandPoints([first]);
  };
  useEffect(() => {
    if (!freehandTool) return;
    const onMove = (e) => {
      if (!freehandDrawing.current || !pageRef.current) return;
      const rect = pageRef.current.getBoundingClientRect();
      freehandPointsRef.current = [...freehandPointsRef.current, [e.clientX - rect.left, e.clientY - rect.top]];
      setFreehandPoints(freehandPointsRef.current);
    };
    const onUp = () => {
      if (!freehandDrawing.current) return;
      freehandDrawing.current = false;
      const pts = freehandPointsRef.current;
      freehandPointsRef.current = [];
      if (pts.length >= 2) {
        const { min: minX } = minMax(pts.map((p) => p[0]));
        const { min: minY } = minMax(pts.map((p) => p[1]));
        const id = `freehand_${Date.now()}`;
        const rel = pts.map(([x, y]) => [x - minX, y - minY]);
        setElements((els) => [...els, { id, type: "freehand", x: minX, y: minY, points: rel, stroke: "#1a2028", strokeWidth: 2 }]);
        setSelected(id);
      }
      setFreehandPoints([]);
      setFreehandTool(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [freehandTool]);

  // Bug fix (user report — see PromptModal.jsx's header comment): window.prompt() doesn't reliably
  // work in Electron's renderer, so both "name this" flows below used it silently failed to appear.
  const [promptState, setPromptState] = useState(null); // { title, defaultValue, onSubmit } | null
  const askPrompt = (title, defaultValue, onSubmit) => setPromptState({ title, defaultValue: defaultValue || "", onSubmit });

  const saveAsTemplate = () => {
    askPrompt("Template name?", "", (name) => {
      if (!name || !name.trim()) return;
      addLayoutTemplate(name.trim(), elements);
    });
  };
  const loadTemplate = (tpl) => {
    if (elements.length && !window.confirm(`Replace the current page with "${tpl.name}"? This can't be undone.`)) return;
    setElements(tpl.elements.map((el) => ({ ...el, id: `${el.type}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}` })));
    setSelected(null);
    setTemplatesOpen(false);
  };

  const onLogoFile = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setElements((els) => [...els, { id: `logo_${Date.now()}`, type: "logo", x: 100, y: 100, src: reader.result, w: 160 }]);
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  const updateSelected = (patch) => setElements((els) => els.map((el) => el.id === selected ? { ...el, ...patch } : el));
  // Deleting a viewport/section also drops any scale bar bound to it (an orphaned bar with no view to
  // describe would just be confusing) and un-binds any legend that was reading lithologies from it
  // (the legend itself stays — just reverts to a plain manually-editable one). Generalized to a set of
  // ids (not just the single `selected`) so the Delete-key shortcut can remove an entire Ctrl+click
  // multi-selection in one go, with the same bound-element cleanup applied per deleted id.
  const removeElementsByIds = (ids) => {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    if (!idSet.size) return;
    setElements((els) => els
      .filter((el) => !idSet.has(el.id) && !idSet.has(el.boundTo))
      .map((el) => idSet.has(el.boundViewportId) ? { ...el, boundViewportId: null } : el));
    setSelected(null);
    setMultiSelected(new Set());
  };
  const removeSelected = () => removeElementsByIds(multiSelected.size > 1 ? multiSelected : (selected ? [selected] : []));

  // User request: "delete key to delete the selected item[s]". Deletes the whole Ctrl+click
  // multi-selection when there is one, else the single selected element — same target resolution
  // removeSelected() above uses, so this is just wiring a key to the existing action. Skipped while
  // focus is in a text input/textarea/contentEditable (a page-title or callout text field, an element's
  // sidebar name field, etc.) so Backspace still edits text as expected instead of deleting the element.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || active?.isContentEditable) return;
      if (multiSelected.size > 1) { e.preventDefault(); removeElementsByIds(multiSelected); }
      else if (selected) { e.preventDefault(); removeElementsByIds([selected]); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, multiSelected]);

  // "Each viewport and cross section need an option to assign a scale bar to it" — previously there
  // was only ever ONE scale-bar element on a page (onSyncScaleBar found-or-created the single
  // `type === "scale"` element, full stop), so a page with two viewports/sections at different scales
  // had no way to give each its own correct bar. Now every scale element carries a `boundTo: elId`
  // back-reference; syncing a given viewport/section finds-or-creates the ONE scale element bound to
  // THAT element specifically, dropped just under it so it's obviously "this bar belongs to this
  // view". Legacy free-floating scale bars (no boundTo, added via the toolbar's plain "Add scale bar")
  // are left alone by this — they're a different, still-supported use case (a bar that isn't tied to
  // any one view, e.g. a page-wide reference scale).
  const syncScaleBarForElement = (sel, worldSizeM, pxSizeOnPage) => {
    if (!worldSizeM || !pxSizeOnPage) {
      setSyncNotice("No scale data available yet for this element — for a viewport, click \"Refresh from theme\" first; for a cross-section, re-snapshot it from the section pop-out.");
      return;
    }
    // pxPerMeter is the TRUE on-page pixel-per-metre ratio implied by this element's own captured
    // geometry (worldSizeM real metres shown across pxSizeOnPage on-page pixels) — not tied to the
    // arbitrary SCALE_BAR_PX constant. The bar is rendered at meters*pxPerMeter (see LayoutElement's
    // "scale" branch), so once this ratio is set it stays fixed even as `meters` is hand-edited
    // afterward — exactly what makes editing the number resize the bar instead of just relabeling it.
    const pxPerMeter = pxSizeOnPage / worldSizeM;
    // Suggest a "nice" round distance close to the old default 180px-wide bar's span, purely as a
    // sensible starting number — the user can retype it to anything and the bar will resize to match.
    const meters = niceScaleNumber(SCALE_BAR_PX / pxPerMeter);
    setElements((els) => {
      const existing = els.find((el) => el.type === "scale" && el.boundTo === sel.id);
      if (existing) return els.map((el) => el === existing ? { ...el, meters, pxPerMeter } : el);
      return [...els, { id: `scale_${Date.now()}`, type: "scale", boundTo: sel.id, x: sel.x, y: sel.y + (sel.h || 0) + 14, meters, pxPerMeter }];
    });
    setSyncNotice(`Scale bar assigned (${meters.toLocaleString()} m) — edit the number any time and the bar will resize to match.`);
  };

  // "The legend should be able to load the lithologies present in the view attached to it" — a legend
  // element gains an optional `boundViewportId` (set from the dropdown in its property panel below);
  // this reads that viewport's saved theme (layerVisible.litho + categoryFilter.litho, the same fields
  // ViewerModule itself uses to decide what's on screen — see captureCurrentTheme there) against the
  // ACTUAL litho vocabulary in `layers.litho` (a theme only stores which units are hidden, not the
  // full unit list, since that list can grow after the theme was saved) to build the item list.
  const syncLegendLithologies = (legendId) => {
    const legend = elements.find((el) => el.id === legendId);
    if (!legend) return;
    if (!legend.boundViewportId) { setSyncNotice("Pick a bound viewport or cross-section above first."); return; }
    const vp = elements.find((el) => el.id === legend.boundViewportId);
    if (!vp) { setSyncNotice("That viewport/section no longer exists on this page — pick a different one."); return; }

    // Cross-section snapshots (type "image") carry their own pre-computed legendItems — the exact
    // {label,color} pairs drawn in that section (litho/alt/vein/structure), built once in
    // ViewerModule's buildSectionPayload and threaded through snapshotToLayout. No live theme to
    // look up here (a flattened image has none), so this is a direct copy rather than a rebuild —
    // "sync" just means "refresh from whatever this snapshot was captured with".
    if (vp.type === "image") {
      const items = vp.legendItems || [];
      if (!items.length) { setSyncNotice("This cross-section snapshot has no litho/alteration/vein/structure data to show — nothing to load."); return; }
      setElements((els) => els.map((el) => el.id === legendId ? { ...el, items } : el));
      setSyncNotice(`Loaded ${items.length} categor${items.length === 1 ? "y" : "ies"} from "${vp.label || vp.id}".`);
      return;
    }

    const theme = themes.find((t) => t.id === vp.themeId);
    if (!theme) { setSyncNotice("This viewport's saved theme could no longer be found (it may have been renamed or deleted) — rebind the viewport to a theme in its own panel, or resave that theme, then sync again."); return; }
    const lithoVisible = theme.layerVisible ? theme.layerVisible.litho !== false : true;
    if (!lithoVisible) { setElements((els) => els.map((el) => el.id === legendId ? { ...el, items: [] } : el)); setSyncNotice("The Lithology layer was hidden in that view's theme, so there's nothing to load — show it in the 3D Viewer, resave the theme, and sync again."); return; }
    const hidden = new Set(theme.categoryFilter?.litho || []);
    const rows = layers?.litho || [];
    if (!rows.length) { setSyncNotice("No lithology data is loaded in this project yet."); return; }
    const items = distinctValues(rows)
      .map(([v]) => v)
      .filter((v) => !hidden.has(v))
      .map((v) => [UNIT_NAMES[v] || v, colorForLithology(v)]);
    if (!items.length) { setSyncNotice("Every lithology unit is filtered out in that view's theme — nothing to show."); return; }
    setElements((els) => els.map((el) => el.id === legendId ? { ...el, items } : el));
    setSyncNotice(`Loaded ${items.length} lithology unit${items.length === 1 ? "" : "s"} from "${theme.name}".`);
  };

  // TASKS.csv #78 — drag-and-drop as a consistent import method. Layout's own "asset" is an image
  // (logo aside, which stays its own small fixed-size button flow since it's meant to be one
  // consistent letterhead mark, not a general photo drop) — dropping any image file onto the page adds
  // it as a normal "image" element (same type/behavior as a 3D View/section snapshot) sized to fit,
  // placed at the drop point rather than always the same fixed corner so multiple drops don't stack.
  const onPageDrop = (e) => {
    e.preventDefault(); setDragOverPage(false);
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    const rect = pageRef.current.getBoundingClientRect();
    const dropX = Math.max(0, e.clientX - rect.left), dropY = Math.max(0, e.clientY - rect.top);
    files.forEach((f, i) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new window.Image();
        img.onload = () => {
          const aspect = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 16 / 9;
          const w = Math.min(A4.w - 160, 400);
          const h = Math.round(w / aspect);
          const id = `image_${Date.now()}_${i}`;
          setElements((els) => [...els, { id, type: "image", label: f.name, src: reader.result, aspect, x: dropX + i * 20, y: dropY + i * 20, w, h }]);
          setSelected(id);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    });
  };

  const sel = elements.find((el) => el.id === selected);

  return (
    <div className="ge-body" style={{ width: "100%" }}>
      <div className="ge-panel" style={{ padding: "16px 14px", width: sidebarWidth }}>
        {/* TASKS.csv #65 — icon-first tool palette (QGIS print-composer style): icon only, full name
            on hover via `title`, instead of every button pairing an icon with always-visible text.
            Scoped to this "Add element" palette first — the app's most toolbar-like, most-frequently-
            reused set of buttons, and the one the user's request most directly evokes ("the layout
            could use a lot of the features QGIS has"). Other sidebar buttons (imports, destructive
            actions like #63's clear buttons) deliberately keep visible text — see #65's TASKS.csv note
            on why a blind global icon-only pass isn't the right call for those. */}
        <div className="ge-section-label">Add element</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <ToolIconBtn icon={<Type size={15} />} title="Add text" onClick={() => addElement("text")} />
          <ToolIconBtn icon={<ImageIcon size={15} />} title="Add company logo" onClick={() => addElement("logo")} />
          <input ref={logoInput} type="file" accept="image/*" style={{ display: "none" }} onChange={onLogoFile} />
          <ToolIconBtn icon={<Compass size={15} />} title="Add north arrow" onClick={() => addElement("north")} />
          <ToolIconBtn icon={<Ruler size={15} />} title="Add scale bar" onClick={() => addElement("scale")} />
          <ToolIconBtn icon={<Plus size={15} />} title="Add legend" onClick={() => addElement("legend")} />
          <ToolIconBtn
            icon={<MonitorPlay size={15} />}
            title={themes.length ? "Add a live-bound viewport of a saved 3D View theme" : "Add viewport (save a theme in the 3D View sidebar first)"}
            onClick={() => setThemePickerFor(themePickerFor === "new" ? null : "new")}
            disabled={!themes.length}
            active={themePickerFor === "new"}
          />
        </div>
        {/* TASKS.csv #19 — shapes/annotation tools */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <ToolIconBtn icon={<Square size={15} />} title="Add rectangle" onClick={() => addElement("rect")} />
          <ToolIconBtn icon={<ArrowUpRight size={15} />} title="Add arrow" onClick={() => addElement("arrow")} />
          <ToolIconBtn icon={<MessageSquare size={15} />} title="Add callout" onClick={() => addElement("callout")} />
          <ToolIconBtn
            icon={<Pencil size={15} />}
            title={freehandTool ? "Click and drag on the page to draw — click again to cancel" : "Freehand pen — click, then drag on the page"}
            onClick={() => setFreehandTool((v) => !v)}
            active={freehandTool}
          />
        </div>
        {themePickerFor === "new" && (
          <div style={{ marginBottom: 8, padding: 8, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6 }}>
            <div style={{ fontSize: 10.5, color: "#55606e", marginBottom: 6 }}>Pick a theme:</div>
            {themes.map((t) => (
              <div key={t.id} onClick={() => startViewportRender(t.id, "new")} style={{ padding: "5px 7px", fontSize: 12, color: "#1a2028", cursor: "pointer", borderRadius: 4 }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#eef1f5"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                {t.name}
              </div>
            ))}
          </div>
        )}

        {sel && (
          <>
            <div className="ge-section-label" style={{ marginTop: 18 }}>Selected: {sel.type}</div>
            {"text" in sel && (
              <input value={sel.text} onChange={(e) => updateSelected({ text: e.target.value })} style={inp} />
            )}
            {"meters" in sel && (
              <label style={{ fontSize: 11.5, color: "#55606e" }}>Scale length (m)
                <input type="number" value={sel.meters} onChange={(e) => updateSelected({ meters: Number(e.target.value) })} style={inp} />
              </label>
            )}
            {(sel.type === "image" || sel.type === "viewport") && (
              <label style={{ fontSize: 11.5, color: "#55606e" }}>Width (px) — height locks to the captured aspect ratio
                <input type="number" value={sel.w} onChange={(e) => {
                  const w = Math.max(40, Number(e.target.value) || sel.w);
                  updateSelected({ w, h: Math.round(w / (sel.aspect || 1)) });
                }} style={inp} />
              </label>
            )}
            {/* Manual rotation for elements other than "viewport" (which has its own Rotation field
                inside ViewportControls below) — mainly for the north arrow (TASKS.csv #67), whether
                set by hand or nudged after "Sync north arrow". */}
            {sel.type === "north" && (
              <label style={{ fontSize: 11.5, color: "#55606e" }}>Rotation (°)
                <input type="number" value={sel.rotation || 0} onChange={(e) => updateSelected({ rotation: Number(e.target.value) || 0 })} style={inp} />
              </label>
            )}
            {/* Legend editing (TASKS.csv — "edit all elements", per the Castilla example the user
                referenced: add/rename/recolor/remove/reorder rows). Previously el.items was a fixed
                array set at creation with no way to touch it afterward. */}
            {"items" in sel && (
              <div style={{ marginTop: 4 }}>
                {/* "The legend should be able to load the lithologies present in the view attached to
                    it." Bind this legend to one of the page's viewport elements, then pull the
                    lithology units actually visible in that viewport's saved theme (color + name via
                    the same colorForLithology/UNIT_NAMES the 3D viewer itself uses). */}
                <label style={{ fontSize: 11.5, color: "#55606e", display: "block", marginBottom: 6 }}>
                  Bound viewport / cross-section
                  <select value={sel.boundViewportId || ""} onChange={(e) => updateSelected({ boundViewportId: e.target.value || null })} style={{ ...inp, marginTop: 4 }}>
                    <option value="">— none —</option>
                    {elements.filter((el) => el.type === "viewport").map((el) => (
                      <option key={el.id} value={el.id}>{themes.find((t) => t.id === el.themeId)?.name || el.id}</option>
                    ))}
                    {/* Cross-section snapshots (type "image") carry their own legendItems, computed
                        from exactly what was drawn in that section — see snapshotToLayout/
                        buildSectionPayload. Only images that actually have legend data are listed;
                        a plain photo/logo dropped onto the page has nothing to sync from. */}
                    {elements.filter((el) => el.type === "image" && el.legendItems && el.legendItems.length).map((el) => (
                      <option key={el.id} value={el.id}>{el.label || el.id} (cross-section)</option>
                    ))}
                  </select>
                </label>
                <button onClick={() => syncLegendLithologies(sel.id)} disabled={!sel.boundViewportId} style={{ ...pBtn, opacity: sel.boundViewportId ? 1 : 0.5 }}>
                  <RefreshCw size={12} /> Load from view / section
                </button>
                {syncNotice && <div style={{ fontSize: 10.5, color: "#8a6a1f", margin: "4px 0 8px", lineHeight: 1.4 }}>{syncNotice}</div>}
                {sel.items.map(([name, color], i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                    <input type="color" value={color} onChange={(e) => {
                      const items = sel.items.map((it, j) => j === i ? [it[0], e.target.value] : it);
                      updateSelected({ items });
                    }} style={{ width: 24, height: 24, padding: 0, border: "1px solid #d9dce1", borderRadius: 4, background: "transparent", flexShrink: 0 }} />
                    <input value={name} onChange={(e) => {
                      const items = sel.items.map((it, j) => j === i ? [e.target.value, it[1]] : it);
                      updateSelected({ items });
                    }} style={{ ...inp, marginBottom: 0, flex: 1 }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <div onClick={() => { if (i === 0) return; const items = sel.items.slice(); [items[i - 1], items[i]] = [items[i], items[i - 1]]; updateSelected({ items }); }}
                        style={{ cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "#c7ccd3" : "#55606e", fontSize: 9, lineHeight: 1 }} title="Move up">▲</div>
                      <div onClick={() => { if (i === sel.items.length - 1) return; const items = sel.items.slice(); [items[i + 1], items[i]] = [items[i], items[i + 1]]; updateSelected({ items }); }}
                        style={{ cursor: i === sel.items.length - 1 ? "default" : "pointer", color: i === sel.items.length - 1 ? "#c7ccd3" : "#55606e", fontSize: 9, lineHeight: 1 }} title="Move down">▼</div>
                    </div>
                    <Trash2 size={12} style={{ cursor: sel.items.length > 1 ? "pointer" : "default", color: sel.items.length > 1 ? "#55606e" : "#c7ccd3", flexShrink: 0 }}
                      onClick={() => { if (sel.items.length <= 1) return; updateSelected({ items: sel.items.filter((_, j) => j !== i) }); }} />
                  </div>
                ))}
                <button onClick={() => updateSelected({ items: [...sel.items, ["Item", "#55606e"]] })} style={{ ...pBtn, marginTop: 2 }}>
                  <Plus size={12} /> Add row
                </button>
              </div>
            )}
            {sel.type === "viewport" && (
              <ViewportControls
                sel={sel} themes={themes} updateSelected={updateSelected} syncNotice={syncNotice}
                onRefresh={() => startViewportRender(sel.themeId, sel.id, sel.trueScale)}
                onRebind={(themeId) => startViewportRender(themeId, sel.id, sel.trueScale)}
                onEnter={() => startInteractiveViewportEdit(sel.themeId, sel.id, sel.trueScale)}
                onSyncScaleBar={() => syncScaleBarForElement(sel, sel.worldHeightAtTarget, sel.h)}
                onSyncNorth={() => {
                  // TASKS.csv #67 — same pattern as onSyncScaleBar just above: apply this viewport's
                  // captured camera azimuth to the nearest existing north-arrow element, or add one if
                  // there isn't one yet. See the cameraAzimuthDeg comment in ViewerModule.jsx for how
                  // that angle is derived (reuses the compass rose's own -theta formula).
                  if (sel.cameraAzimuthDeg == null) return;
                  const deg = sel.cameraAzimuthDeg;
                  setElements((els) => {
                    const hasNorth = els.some((el) => el.type === "north");
                    if (hasNorth) return els.map((el) => el.type === "north" ? { ...el, rotation: deg } : el);
                    return [...els, { id: `north_${Date.now()}`, type: "north", x: 1000, y: 40, rotation: deg }];
                  });
                }}
              />
            )}
            {/* "Each viewport and cross section need an option to assign a scale bar to it." Cross-
                section snapshots carry worldWidthAtCaptureM (see SectionWindow.jsx's snapshotToLayout)
                only when they came from the pop-out's "Snapshot to Layout" button — a plain imported
                photo or logo has no known real-world scale, so this stays hidden for those. */}
            {sel.type === "image" && sel.worldWidthAtCaptureM != null && (
              <>
                <button onClick={() => syncScaleBarForElement(sel, sel.worldWidthAtCaptureM, sel.w)} style={{ ...pBtn, marginTop: 4 }}>
                  <Ruler size={12} /> Assign scale bar to this section
                </button>
                {syncNotice && <div style={{ fontSize: 10.5, color: "#8a6a1f", margin: "4px 0 8px", lineHeight: 1.4 }}>{syncNotice}</div>}
              </>
            )}
            {/* A plain imported photo/logo ("image" with no worldWidthAtCaptureM) has no known
                real-world scale — nothing to assign here, silently (no button shown at all), same as
                before. */}
            {/* TASKS.csv #19 — shape/annotation property editors */}
            {sel.type === "rect" && (
              <>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <label style={{ fontSize: 11.5, color: "#55606e", flex: 1 }}>Width
                    <input type="number" min="10" value={sel.w} onChange={(e) => updateSelected({ w: Math.max(10, Number(e.target.value) || sel.w) })} style={{ ...inp, marginTop: 4, marginBottom: 0 }} />
                  </label>
                  <label style={{ fontSize: 11.5, color: "#55606e", flex: 1 }}>Height
                    <input type="number" min="10" value={sel.h} onChange={(e) => updateSelected({ h: Math.max(10, Number(e.target.value) || sel.h) })} style={{ ...inp, marginTop: 4, marginBottom: 0 }} />
                  </label>
                </div>
                <ColorRow label="Stroke" value={sel.stroke} onChange={(v) => updateSelected({ stroke: v })} />
                <label style={{ fontSize: 11.5, color: "#55606e" }}>Stroke width
                  <input type="number" min="0" value={sel.strokeWidth} onChange={(e) => updateSelected({ strokeWidth: Math.max(0, Number(e.target.value) || 0) })} style={inp} />
                </label>
                <ColorRow label="Fill" value={sel.fill} onChange={(v) => updateSelected({ fill: v })} />
                <label style={{ fontSize: 11.5, color: "#55606e", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <input type="checkbox" checked={sel.fillOpacity > 0} onChange={(e) => updateSelected({ fillOpacity: e.target.checked ? 1 : 0 })} /> Filled
                </label>
              </>
            )}
            {sel.type === "arrow" && (
              <>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <label style={{ fontSize: 11.5, color: "#55606e", flex: 1 }}>Length
                    <input type="number" min="10" value={sel.length} onChange={(e) => updateSelected({ length: Math.max(10, Number(e.target.value) || sel.length) })} style={{ ...inp, marginTop: 4, marginBottom: 0 }} />
                  </label>
                  <label style={{ fontSize: 11.5, color: "#55606e", flex: 1 }}>Angle (°)
                    <input type="number" value={sel.angle} onChange={(e) => updateSelected({ angle: Number(e.target.value) || 0 })} style={{ ...inp, marginTop: 4, marginBottom: 0 }} />
                  </label>
                </div>
                <ColorRow label="Color" value={sel.stroke} onChange={(v) => updateSelected({ stroke: v })} />
                <label style={{ fontSize: 11.5, color: "#55606e" }}>Stroke width
                  <input type="number" min="0.5" value={sel.strokeWidth} onChange={(e) => updateSelected({ strokeWidth: Math.max(0.5, Number(e.target.value) || 1) })} style={inp} />
                </label>
              </>
            )}
            {sel.type === "callout" && (
              <>
                <label style={{ fontSize: 11.5, color: "#55606e" }}>Width
                  <input type="number" min="60" value={sel.w} onChange={(e) => updateSelected({ w: Math.max(60, Number(e.target.value) || sel.w) })} style={inp} />
                </label>
                <ColorRow label="Fill" value={sel.fill} onChange={(v) => updateSelected({ fill: v })} />
                <ColorRow label="Border" value={sel.stroke} onChange={(v) => updateSelected({ stroke: v })} />
              </>
            )}
            {sel.type === "freehand" && (
              <>
                <ColorRow label="Color" value={sel.stroke} onChange={(v) => updateSelected({ stroke: v })} />
                <label style={{ fontSize: 11.5, color: "#55606e" }}>Stroke width
                  <input type="number" min="0.5" value={sel.strokeWidth} onChange={(e) => updateSelected({ strokeWidth: Math.max(0.5, Number(e.target.value) || 1) })} style={inp} />
                </label>
              </>
            )}
            <button onClick={removeSelected} style={{ ...pBtn, background: "#2a1a1a", border: "1px solid #5a2a2a", color: "#e0a0a0", marginTop: 10 }}>Remove element</button>
          </>
        )}

        {/* TASKS.csv #18 — saved layout templates */}
        <div className="ge-section-label" style={{ marginTop: 20 }}>Templates</div>
        <button onClick={saveAsTemplate} style={pBtn}><Save size={13} /> Save page as template</button>
        <button onClick={() => setTemplatesOpen((v) => !v)} style={{ ...pBtn, opacity: layoutTemplates.length ? 1 : 0.5 }} disabled={!layoutTemplates.length}>
          <FolderOpen size={13} /> Load template ({layoutTemplates.length})
        </button>
        {templatesOpen && (
          <div style={{ marginBottom: 8, padding: 6, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, maxHeight: 180, overflowY: "auto" }}>
            {layoutTemplates.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", borderRadius: 4 }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#eef1f5"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <span onClick={() => loadTemplate(t)} style={{ flex: 1, fontSize: 12, color: "#1a2028", cursor: "pointer" }}>{t.name}</span>
                <span style={{ fontSize: 9.5, color: "#94a1b0" }}>{t.elements.length} el.</span>
                <Trash2 size={12} style={{ cursor: "pointer", color: "#8a5555", flexShrink: 0 }} onClick={() => deleteLayoutTemplate(t.id)} />
              </div>
            ))}
          </div>
        )}

        {/* TASKS.csv #67 — QGIS-style alignment grid + rulers. */}
        <div className="ge-section-label" style={{ marginTop: 20 }}>View</div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, marginBottom: 6 }}>
          <div onClick={() => setShowGrid((v) => !v)} style={{ cursor: "pointer", color: showGrid ? "#e2a63c" : "#9aa5b3" }} title={showGrid ? "Hide grid" : "Show grid"}>
            <Grid3x3 size={14} />
          </div>
          <div style={{ flex: 1, fontSize: 12, color: showGrid ? "#1a2028" : "#6b7684" }}>Grid + snap</div>
          {metersPerPx ? (
            <>
              <input type="number" min={1} value={gridMeters} onChange={(e) => setGridMeters(Math.max(1, Number(e.target.value) || 100))} style={{ width: 46, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 4, color: "#1a2028", fontSize: 11, padding: "3px 5px" }} />
              <span style={{ fontSize: 10.5, color: "#94a1b0" }}>m</span>
            </>
          ) : (
            <>
              <input type="number" min={1} value={gridMm} onChange={(e) => setGridMm(Math.max(1, Number(e.target.value) || 10))} style={{ width: 46, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 4, color: "#1a2028", fontSize: 11, padding: "3px 5px" }} />
              <span style={{ fontSize: 10.5, color: "#94a1b0" }}>mm</span>
            </>
          )}
        </div>
        {/* TASKS.csv #101 — bind the grid's real-world spacing to a Viewport's own captured scale
            instead of a fixed paper-space mm value, so a "100m grid" can sit directly over the map
            the way a printed topo sheet's grid would, staying correct across refreshes/rebinds. */}
        <label style={{ fontSize: 10.5, color: "#55606e", display: "block", marginBottom: 4 }}>
          Bind grid to viewport
          <select value={gridBoundViewportId} onChange={(e) => setGridBoundViewportId(e.target.value)} style={inp}>
            <option value="">None — free {gridMm}mm grid</option>
            {elements.filter((el) => el.type === "viewport").map((el) => (
              <option key={el.id} value={el.id}>
                {(themes.find((t) => t.id === el.themeId)?.name) || "Viewport"}{el.worldHeightAtTarget ? "" : " (not rendered yet)"}
              </option>
            ))}
          </select>
        </label>
        {gridBoundViewportId && !metersPerPx && (
          <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 10, lineHeight: 1.4 }}>
            This viewport hasn't been rendered yet — use "Refresh from theme" on it once to get a real-world scale to bind to.
          </div>
        )}
        {metersPerPx && (
          <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 10, lineHeight: 1.4 }}>
            Grid spacing is locked to {gridMeters}m in the real world using this viewport's current scale — recomputes automatically whenever it's refreshed or rebound.
          </div>
        )}

        <div className="ge-section-label" style={{ marginTop: 20 }}>Output</div>
        <button onClick={() => savePDF("layout.pdf")} style={{ ...pBtn, background: "#1e3629", border: "1px solid #3d6b52", color: "#8fd9ab" }}><FileDown size={13} /> Export PDF</button>
        <div style={{ fontSize: 10, color: "#94a1b0", marginTop: 8, lineHeight: 1.5 }}>
          Use "Snapshot to Layout" in the 3D View toolbar, or in a cross-section pop-out, to drop a capture
          of that view onto the page below — drag to place it, and use the width field to resize (aspect
          ratio locks automatically).
        </div>
      </div>

      <SidebarResizeHandle width={sidebarWidth} onResize={setSidebarWidth} />

      <div className="ge-main" style={{ overflow: "auto", background: "#0a0d11", padding: 0, display: "flex", flexDirection: "column" }}>
        {/* TASKS.csv #69 — multiple layout pages. Own row above the page canvas rather than folded
            into the sidebar, so it reads as "which page am I looking at" the same way browser/editor
            tabs do, right next to the thing it switches. Hidden on print (see app.css) — only the
            active page's canvas below should ever end up on paper. */}
        <div className="ge-layout-pagebar" style={{ display: "flex", alignItems: "center", gap: 4, padding: "10px 30px 0", flexShrink: 0 }}>
          {layoutPages.map((p) => {
            const isActive = p.id === activeLayoutPageId;
            return (
              <div
                key={p.id}
                onClick={() => switchLayoutPage(p.id)}
                title={p.name}
                style={{
                  display: "flex", alignItems: "center", gap: 6, maxWidth: 160, padding: "5px 9px",
                  background: isActive ? "#f4f5f7" : "#ffffff", border: `1px solid ${isActive ? "#a9c6e0" : "#f0f1f3"}`,
                  borderBottom: isActive ? "1px solid #f4f5f7" : "1px solid #f0f1f3", borderRadius: "6px 6px 0 0",
                  color: isActive ? "#1a2028" : "#6b7684", fontSize: 11.5, cursor: "pointer", position: "relative", top: 1,
                }}
              >
                <span
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  onDoubleClick={(e) => { e.stopPropagation(); askPrompt("Rename page", p.name, (name) => { if (name) renameLayoutPage(p.id, name); }); }}
                >
                  {p.name}
                </span>
                <Trash2
                  size={11}
                  style={{ flexShrink: 0, color: "#94a1b0" }}
                  onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete page "${p.name}"? This can't be undone.`)) deleteLayoutPage(p.id); }}
                />
              </div>
            );
          })}
          <button
            onClick={() => addLayoutPage()}
            title="Add page"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, marginBottom: 2, background: "transparent", border: "1px solid transparent", borderRadius: 5, color: "#94a1b0", cursor: "pointer" }}
          >
            <Plus size={13} />
          </button>
        </div>
        <div style={{ overflow: "auto", padding: 30, flex: 1 }}>
        <div style={{ display: "inline-grid", gridTemplateColumns: "18px auto", gridTemplateRows: "18px auto", margin: "0 auto" }}>
          <div />
          <Ruler2D axis="x" length={A4.w} mmStep={gridMm} />
          <Ruler2D axis="y" length={A4.h} mmStep={gridMm} />
          <div
            ref={pageRef}
            className="ge-layout-page"
            style={{
              width: A4.w, height: A4.h, background: "#fbfbf8", position: "relative", boxShadow: "0 4px 30px rgba(0,0,0,0.5)",
              cursor: freehandTool ? "crosshair" : "default",
              outline: dragOverPage ? "2px dashed #4a9be0" : "none", outlineOffset: 2,
              backgroundImage: showGrid
                ? `linear-gradient(to right, rgba(74,155,224,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(74,155,224,0.18) 1px, transparent 1px)`
                : "none",
              backgroundSize: showGrid ? `${gridSnapPx}px ${gridSnapPx}px` : "auto",
            }}
            // Bug fix, part of the "creating numerous lines" report: starting a freehand stroke on top
            // of an existing element (the default title/legend/north-arrow/scale-bar all sit on a
            // fresh page) used to hit that ELEMENT's own onMouseDown first (which calls
            // e.stopPropagation()), so the click selected/dragged that element instead of drawing —
            // the freehand tool stayed "on" the whole time since startFreehand() was never reached to
            // turn it off, so the very next click ANYWHERE (even an unrelated selection click) would
            // also try to draw, compounding into stray strokes. Capturing mousedown here, before it
            // reaches any child element, means a freehand stroke always starts exactly where the user
            // pressed down, regardless of what's underneath — and reliably turns the tool back off on
            // mouseup every time.
            onMouseDownCapture={(e) => { if (freehandTool) { e.stopPropagation(); startFreehand(e); } }}
            onMouseDown={(e) => { if (freehandTool) return; setSelected(null); setMultiSelected(new Set()); }}
            onDragOver={(e) => { e.preventDefault(); setDragOverPage(true); }}
            onDragLeave={() => setDragOverPage(false)}
            onDrop={onPageDrop}
          >
          {elements.map((el) => (
            <LayoutElement key={el.id} el={el} selected={selected === el.id} multiSelected={multiSelected.size > 1 && multiSelected.has(el.id)} onDown={(e) => { e.stopPropagation(); onDown(e, el); }} />
          ))}
          {freehandPoints.length > 1 && (
            <svg style={{ position: "absolute", inset: 0, pointerEvents: "none" }} width={A4.w} height={A4.h}>
              <polyline points={freehandPoints.map((p) => p.join(",")).join(" ")} fill="none" stroke="#4a9be0" strokeWidth="2" strokeDasharray="4 3" />
            </svg>
          )}
          </div>
        </div>
        </div>
      </div>
      {promptState && (
        <PromptModal
          title={promptState.title}
          defaultValue={promptState.defaultValue}
          onCancel={() => setPromptState(null)}
          onConfirm={(value) => { promptState.onSubmit(value); setPromptState(null); }}
        />
      )}
    </div>
  );
}

// TASKS.csv #67 — a plain CSS/SVG ruler bar (top: horizontal, left: vertical) with tick marks every
// mmStep and a numbered label every 5th tick, matching the page's own ~96dpi assumption (PX_PER_MM).
// Purely a visual reference alongside the grid overlay — not interactive (no drag-to-place guides).
function Ruler2D({ axis, length, mmStep }) {
  const ticks = [];
  for (let mm = 0, i = 0; mm * PX_PER_MM <= length; mm += mmStep, i++) {
    ticks.push({ px: mm * PX_PER_MM, major: i % 5 === 0, mm });
  }
  const isX = axis === "x";
  return (
    <div style={{ position: "relative", width: isX ? length : 18, height: isX ? 18 : length, background: "#ffffff", overflow: "hidden", flexShrink: 0 }}>
      {ticks.map((t, i) => (
        <div key={i} style={isX
          ? { position: "absolute", left: t.px, top: 0, width: 1, height: t.major ? 10 : 5, background: "#eef1f4" }
          : { position: "absolute", top: t.px, left: 0, height: 1, width: t.major ? 10 : 5, background: "#eef1f4" }
        } />
      ))}
      {ticks.filter((t) => t.major).map((t, i) => (
        <div key={`l${i}`} style={isX
          ? { position: "absolute", left: t.px + 2, top: 9, fontSize: 8, color: "#94a1b0", fontFamily: "'Exo 2', system-ui, sans-serif" }
          : { position: "absolute", top: t.px + 2, left: 9, fontSize: 8, color: "#94a1b0", fontFamily: "'Exo 2', system-ui, sans-serif", writingMode: "vertical-rl" }
        }>{t.mm}</div>
      ))}
    </div>
  );
}

// Sidebar controls for a selected "viewport" element (TASKS.csv #46): rebind to a different theme,
// refresh (re-render the same theme — picks up any data/view changes made since it was last
// captured), rotate, customize the frame (QGIS-style border), and see/apply the approximate scale.
function ViewportControls({ sel, themes, updateSelected, onRefresh, onRebind, onEnter, onSyncScaleBar, onSyncNorth, syncNotice }) {
  // TASKS.csv #69 — the "~" prefix and hedge text below only apply to a perspective capture (the
  // ordinary, pre-#69 default) — sel.trueScale means the LAST capture was rendered with an
  // orthographic camera (see startViewportRender/ViewerModule's capture effect), which makes
  // worldHeightAtTarget an exact figure, not an estimate at one particular distance.
  const scaleText = (() => {
    if (!sel.worldHeightAtTarget || !sel.h) return null;
    const printedHeightM = (sel.h / 96) * 0.0254;
    const ratio = sel.worldHeightAtTarget / printedHeightM;
    return `${sel.trueScale ? "" : "~"}1 : ${Math.round(ratio).toLocaleString()}`;
  })();
  return (
    <div style={{ marginTop: 4 }}>
      <label style={{ fontSize: 11.5, color: "#55606e" }}>Theme
        <select value={sel.themeId || ""} onChange={(e) => onRebind(e.target.value)} style={inp}>
          {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <button onClick={onRefresh} disabled={sel.refreshing} style={{ ...pBtn, opacity: sel.refreshing ? 0.6 : 1 }}>
        <RefreshCw size={13} /> {sel.refreshing ? "Rendering…" : "Refresh from theme"}
      </button>
      {/* TASKS.csv #198 (part 3) — QGIS-style "enter" a viewport: switches to the 3D View tab with
          this viewport's theme/camera live, ready for real orbit/pan/zoom, instead of an instant
          re-render. See startInteractiveViewportEdit above and ViewerModule's interactive-session
          banner for the other half of this flow. */}
      <button onClick={onEnter} disabled={sel.refreshing} title="Switch to the 3D View tab and interactively orbit/pan/zoom this viewport's camera, then bring the new angle back here" style={{ ...pBtn, opacity: sel.refreshing ? 0.6 : 1 }}>
        <LogIn size={13} /> Enter &amp; adjust view…
      </button>
      {/* TASKS.csv #69 — true-scale (orthographic) capture. Takes effect on the NEXT refresh, not
          retroactively on the image already captured — toggling it alone doesn't re-render. */}
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#55606e", marginBottom: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={!!sel.trueScale} onChange={(e) => updateSelected({ trueScale: e.target.checked })} />
        True scale (orthographic) — exact, not just at the camera's focus point. Refresh to apply.
      </label>
      <label style={{ fontSize: 11.5, color: "#55606e" }}>Rotation (°)
        <input type="number" value={sel.rotation || 0} onChange={(e) => updateSelected({ rotation: Number(e.target.value) || 0 })} style={inp} />
      </label>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <label style={{ fontSize: 11.5, color: "#55606e", flex: 1 }}>Frame width
          <input type="number" min="0" value={sel.frameWidth ?? 1} onChange={(e) => updateSelected({ frameWidth: Math.max(0, Number(e.target.value) || 0) })} style={{ ...inp, marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 11.5, color: "#55606e" }}>Color
          <input type="color" value={sel.frameColor || "#1a1a1a"} onChange={(e) => updateSelected({ frameColor: e.target.value })} style={{ display: "block", marginTop: 4, width: 34, height: 30, padding: 0, border: "1px solid #d9dce1", borderRadius: 5, background: "none", cursor: "pointer" }} />
        </label>
      </div>
      <label style={{ fontSize: 11.5, color: "#55606e" }}>Frame style
        <select value={sel.frameStyle || "solid"} onChange={(e) => updateSelected({ frameStyle: e.target.value })} style={inp}>
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="double">Double</option>
        </select>
      </label>
      <div style={{ fontSize: 10.5, color: "#55606e", marginBottom: 6, lineHeight: 1.5 }}>
        {sel.trueScale ? "Scale" : "Approx. scale"}: <span style={{ color: "#1a2028" }}>{scaleText || "—"}</span><br />
        <span style={{ color: "#94a1b0" }}>
          {sel.trueScale
            ? "Orthographic capture — this ratio is exact across the whole image, not just at one distance."
            : "Estimated at the theme's camera target distance — perspective view, so scale drifts slightly nearer/farther from that point. Check \"True scale\" above and refresh for an exact figure."}
        </span>
      </div>
      <button onClick={onSyncScaleBar} disabled={!scaleText} style={{ ...pBtn, opacity: scaleText ? 1 : 0.5 }}>
        <Ruler size={13} /> Assign scale bar to this view
      </button>
      {syncNotice && <div style={{ fontSize: 10.5, color: "#8a6a1f", margin: "4px 0 8px", lineHeight: 1.4 }}>{syncNotice}</div>}
      {/* TASKS.csv #67 — cameraAzimuthDeg is computed in ViewerModule.jsx (see that comment for the
          worked-through, numerically-checked derivation of the CSS rotation angle). */}
      <button onClick={onSyncNorth} disabled={sel.cameraAzimuthDeg == null} style={{ ...pBtn, opacity: sel.cameraAzimuthDeg == null ? 0.5 : 1 }}>
        <Compass size={13} /> Sync north arrow
      </button>
    </div>
  );
}

function LayoutElement({ el, selected, multiSelected, onDown }) {
  // multiSelected (part of a Ctrl+click bulk selection, but not the single "active" element) gets a
  // dashed outline so a multi-selection reads visually distinct from the one element whose properties
  // are actually showing in the sidebar.
  const outline = selected ? "1.5px solid #4a9be0" : multiSelected ? "1.5px dashed #4a9be0" : "none";
  const wrap = { position: "absolute", left: el.x, top: el.y, cursor: "move", outline, outlineOffset: 3 };
  if (el.type === "title") return <div style={{ ...wrap, width: el.w }} onMouseDown={onDown}><div style={{ fontSize: 26, fontWeight: 700, color: "#1a2028", fontFamily: "'Exo 2', system-ui, sans-serif" }}>{el.text}</div></div>;
  if (el.type === "text") return <div style={{ ...wrap, width: el.w }} onMouseDown={onDown}><div style={{ fontSize: 14, color: "#222" }}>{el.text}</div></div>;
  if (el.type === "logo") return <img src={el.src} alt="logo" style={{ ...wrap, width: el.w }} onMouseDown={onDown} draggable={false} />;
  if (el.type === "image") {
    if (!el.src) return null; // defensive: a malformed/partial snapshot shouldn't take the whole page down
    return (
      <div style={{ ...wrap, width: el.w || 200, height: el.h || 120 }} onMouseDown={onDown}>
        <img src={el.src} alt={el.label || "snapshot"} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#fff" }} draggable={false} />
      </div>
    );
  }
  if (el.type === "viewport") {
    const borderStyle = el.frameStyle === "double" ? "double" : el.frameStyle === "dashed" ? "dashed" : "solid";
    const frameW = el.frameStyle === "double" ? Math.max(3, (el.frameWidth || 1) * 3) : (el.frameWidth || 0);
    return (
      <div
        style={{ ...wrap, width: el.w || 400, height: el.h || 260, transform: `rotate(${el.rotation || 0}deg)`, transformOrigin: "center center" }}
        onMouseDown={onDown}
      >
        <div style={{ width: "100%", height: "100%", border: frameW ? `${frameW}px ${borderStyle} ${el.frameColor || "#1a1a1a"}` : "none", background: "#fff", position: "relative", boxSizing: "border-box" }}>
          {el.src && <img src={el.src} alt="viewport" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} draggable={false} />}
          {el.refreshing && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.75)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#333", fontFamily: "'Exo 2', system-ui, sans-serif" }}>
              Rendering…
            </div>
          )}
        </div>
      </div>
    );
  }
  // TASKS.csv #67 — el.rotation (set manually, or via "Sync north arrow" on a bound viewport) rotates
  // the whole glyph around its own center rather than the page's drag-anchor corner.
  if (el.type === "north") return (
    <div style={{ ...wrap, transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined, transformOrigin: "27px 35px" }} onMouseDown={onDown}>
      <svg width="54" height="70" viewBox="0 0 54 70">
        <polygon points="27,4 38,44 27,36 16,44" fill="#ffffff" stroke="#1a2028" strokeWidth="1.5" strokeLinejoin="round" />
        <polygon points="27,4 38,44 27,36" fill="#666" />
        <text x="27" y="64" fontSize="18" fontWeight="700" textAnchor="middle" fill="#1a2028" fontFamily="'Exo 2', system-ui, sans-serif">N</text>
      </svg>
    </div>
  );
  if (el.type === "scale") {
    // "Customize the scale bar by changing the number, but without changing the scale — if I change
    // 200 to 300 the SIZE has to change." The bar's on-page length now tracks el.meters at whatever
    // real pixel-per-metre ratio was last established (by syncing to a view, or the plain default for
    // a freeform bar that's never been synced) — see pxPerMeter's definition up top — instead of a
    // fixed 180px that only ever changed its printed label.
    const px = Math.max(20, Math.round((el.meters || 100) * (el.pxPerMeter || DEFAULT_PX_PER_METER)));
    return (
      <div style={wrap} onMouseDown={onDown}>
        <svg width={px + 4} height="34">
          <rect x="2" y="4" width={px / 2} height="10" fill="#1a2028" />
          <rect x={2 + px / 2} y="4" width={px / 2} height="10" fill="#fbfbf8" stroke="#1a2028" />
          <rect x="2" y="4" width={px} height="10" fill="none" stroke="#1a2028" />
          <text x="2" y="28" fontSize="11" fill="#1a2028" fontFamily="'Exo 2', system-ui, sans-serif">0</text>
          <text x={px + 2} y="28" fontSize="11" textAnchor="end" fill="#1a2028" fontFamily="'Exo 2', system-ui, sans-serif">{el.meters} m</text>
        </svg>
      </div>
    );
  }
  if (el.type === "legend") return (
    <div style={{ ...wrap, background: "#fff", border: "1px solid #ccc", padding: "8px 12px", minWidth: 150 }} onMouseDown={onDown}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#222", marginBottom: 6, fontFamily: "'Exo 2', system-ui, sans-serif" }}>Legend</div>
      {el.items.map(([name, color], i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ width: 14, height: 14, background: color, display: "inline-block", border: "1px solid #999" }} />
          <span style={{ fontSize: 12, color: "#222" }}>{name}</span>
        </div>
      ))}
    </div>
  );
  // TASKS.csv #19 — shapes/annotation tools
  if (el.type === "rect") return (
    <div style={{ ...wrap, width: el.w, height: el.h }} onMouseDown={onDown}>
      <svg width={el.w} height={el.h} style={{ display: "block" }}>
        <rect x={(el.strokeWidth || 0) / 2} y={(el.strokeWidth || 0) / 2} width={Math.max(0, el.w - (el.strokeWidth || 0))} height={Math.max(0, el.h - (el.strokeWidth || 0))}
          fill={el.fillOpacity > 0 ? el.fill : "none"} stroke={el.stroke} strokeWidth={el.strokeWidth} />
      </svg>
    </div>
  );
  if (el.type === "arrow") {
    const rad = (el.angle * Math.PI) / 180;
    const dx = Math.cos(rad) * el.length, dy = Math.sin(rad) * el.length;
    const pad = 12; // room for the arrowhead so it isn't clipped by the svg bounds
    const w = Math.abs(dx) + pad * 2, h = Math.abs(dy) + pad * 2;
    const x1 = dx < 0 ? w - pad : pad, y1 = dy < 0 ? h - pad : pad;
    const x2 = x1 + dx, y2 = y1 + dy;
    const headLen = 10, headAngle = Math.PI / 7;
    const hx1 = x2 - headLen * Math.cos(rad - headAngle), hy1 = y2 - headLen * Math.sin(rad - headAngle);
    const hx2 = x2 - headLen * Math.cos(rad + headAngle), hy2 = y2 - headLen * Math.sin(rad + headAngle);
    return (
      <div style={{ ...wrap, width: w, height: h }} onMouseDown={onDown}>
        <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={el.stroke} strokeWidth={el.strokeWidth} />
          <polyline points={`${hx1},${hy1} ${x2},${y2} ${hx2},${hy2}`} fill="none" stroke={el.stroke} strokeWidth={el.strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  if (el.type === "callout") return (
    <div style={{ ...wrap, width: el.w, background: el.fill, border: `1.5px solid ${el.stroke}`, borderRadius: 6, padding: "8px 12px", position: "absolute" }} onMouseDown={onDown}>
      <div style={{ fontSize: 12.5, color: "#222", fontFamily: "'Exo 2', system-ui, sans-serif" }}>{el.text}</div>
      <svg width="16" height="10" style={{ position: "absolute", left: 14, bottom: -9 }}>
        <polygon points="0,0 16,0 5,10" fill={el.fill} stroke={el.stroke} strokeWidth="1.5" />
      </svg>
    </div>
  );
  if (el.type === "freehand") {
    // minMax (a plain reduce loop) rather than Math.max(...xs) — spreading a large array as call
    // arguments can exceed the JS engine's argument-count limit; a careful/slow freehand stroke can
    // rack up thousands of points, so this avoids the same crash class fixed elsewhere in the app
    // (see layers.js's minMax header comment).
    const w = minMax(el.points.map((p) => p[0])).max + 4, h = minMax(el.points.map((p) => p[1])).max + 4;
    return (
      <div style={{ ...wrap, width: w, height: h }} onMouseDown={onDown}>
        <svg width={w} height={h} style={{ display: "block" }}>
          <polyline points={el.points.map((p) => p.join(",")).join(" ")} fill="none" stroke={el.stroke} strokeWidth={el.strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  return null;
}

// TASKS.csv #19 — small labeled color-swatch input, reused across the new shape/annotation property
// editors (rect/arrow/callout) instead of repeating the same label+input markup three times.
function ColorRow({ label, value, onChange }) {
  return (
    <label style={{ fontSize: 11.5, color: "#55606e", display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{ flex: 1 }}>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 30, height: 26, padding: 0, border: "1px solid #d9dce1", borderRadius: 4, background: "transparent", cursor: "pointer" }} />
    </label>
  );
}

const pBtn = { display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 10px", marginBottom: 6, background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, color: "#1a2028", fontSize: 12, cursor: "pointer" };
const inp = { width: "100%", marginTop: 4, marginBottom: 8, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "6px 8px", color: "#1a2028", fontSize: 12 };

// TASKS.csv #65 — icon-only tool button, full name shown on hover via the native `title` attribute.
function ToolIconBtn({ icon, title, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
        background: active ? "#26344a" : "#f4f5f7", border: `1px solid ${active ? "#4a9be0" : "#d9dce1"}`,
        borderRadius: 6, color: disabled ? "#4a5260" : "#1a2028", cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1, flexShrink: 0,
      }}
    >{icon}</button>
  );
}
