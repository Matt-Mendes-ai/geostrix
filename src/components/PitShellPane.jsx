// TASKS.csv #1341 — the Mine Design tab's pit shell: a block model and your own economics in, the pit that makes the most
// undiscounted money out, as a surface in the 3D view with what it holds. Every number is the user's: no default price, cost or
// density (a default would read as a fact, as #264). Maths in lib/pitShell.js; framing from #836.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pickaxe, Eye, EyeOff, Trash2, Pencil } from "./icons.js";
import { confirmDestructive } from "../lib/confirmDestructive.js"; // #1498
import { TaskPaneHeader } from "./Ribbon.jsx";
import { useStore } from "../lib/store.jsx";
import { joinByProduct /* #2115 */, pitEconomics, pitMetalOf, elementOfModel, SECTORS, hasSectorSlopes, slopeForSector, priceUnitsFor, PRICED_MASS_T, metalAmountText, gradeWithElement, oxideSuffix /* #2594 */, gradeUnitText /* #2111 */ } from "../lib/pitShell.js"; // pitMetalOf / elementOfModel: #1748; SECTORS: #1881
import { sgSummary } from "../lib/gradeTonnage.js";
import { valueUnit } from "../lib/blockModelExport.js";
import { categoricalModels } from "../lib/geologyForward.js";
import { gradeCandidate } from "../lib/gradeCandidate.js"; // #1848
import { runPitShellAsync } from "../lib/pitShellClient.js";
import { slopeName } from "../lib/pitWalls.js"; // TASKS.csv #2433
import { pBtn, smallSel } from "../lib/sidebarStyles.js";
import UndergroundOreNote from "./UndergroundOreNote.jsx"; // TASKS.csv #2277
import NotOfferedGrades from "./NotOfferedGrades.jsx"; // TASKS.csv #2436
import { drilledOutsideModel } from "../lib/pitDrilledOutside.js"; // TASKS.csv #2593
import { weatheredBasePoints, weatheringCodes } from "../lib/weatheredZone.js"; // TASKS.csv #2597
import { ringContains } from "../lib/polygonRings.js"; // TASKS.csv #2120
import { holeTraces } from "../lib/evidenceSources.js";
import { excludeQAQC } from "../lib/qaqc.js";
import { valueIn } from "../lib/geochem.js";
import { t as tr } from "../lib/i18n.js";
import { DENSITY_CODE_LAYERS, modelWithCodeDensity, typedCodeDensities } from "../lib/densityByCode.js"; // TASKS.csv #2647
import { densityUsedText } from "./densityUsedText.js"; // TASKS.csv #2647
import CollarLevelsNote from "./CollarLevelsNote.jsx"; // TASKS.csv #2584 — the lowest collar used where collars stand on benches

const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", marginTop: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const warn = { ...note, color: "var(--color-warn-text-strong)", marginTop: 4 };
const num = { ...smallSel, width: 84 };
const big = (v) => new Intl.NumberFormat(undefined, { notation: "compact", maximumSignificantDigits: 3 }).format(v);
const GRADE_UNITS = ["g/t", "ppm", "ppb", "%"];
const EMPTY = { price: "", priceUnit: "", recovery: "", miningCost: "", processingCost: "", density: "", wasteDensity: "", slopeDeg: "", revenueFactor: "1", size: "", unit: "", sectorSlopes: {}, byModelId: "", byPrice: "", byPriceUnit: "", byRecovery: "", areaId: "" /* #2120 */, upperDeg: "", upperRL: "" /* #2439 */, weathMode: "", weathThick: "", weathCode: "", weathDensity: "", densityLayer: "", densityByCode: {} /* #2647 */, limitM: "" /* #2665 */ }; // sectorSlopes: #1881; by*: #1917; weath*: #2597
// TASKS.csv #1917 — the by-product's inputs ride in inputs.by; in the form they are flat fields
// TASKS.csv #2597 — the weathered zone's inputs ride in inputs.weathered ({ density, thicknessM } or { density, freshCode }); flat in the form
const weathFields = (inp) => ({ weathMode: inp?.weathered?.thicknessM > 0 ? "thick" : inp?.weathered?.freshCode ? "log" : "", weathThick: inp?.weathered?.thicknessM > 0 ? String(inp.weathered.thicknessM) : "", weathCode: inp?.weathered?.freshCode || "", weathDensity: inp?.weathered?.density > 0 ? String(inp.weathered.density) : "" });
const byFields = (inp) => ({ byModelId: inp?.by?.modelId ?? "", byPrice: inp?.by?.price == null ? "" : String(inp.by.price), byPriceUnit: inp?.by?.priceUnit ?? "", byRecovery: inp?.by?.recovery == null ? "" : String(inp.by.recovery) });
const SECTOR_GRID = [["NW", "N", "NE"], ["W", null, "E"], ["SW", "S", "SE"]]; // the compass layout of the sector slopes
const PRICE_UNIT_MASS = { g: { g: 1, oz: 31.1034768 }, t: { t: 1, lb: 1 / 2204.62262 } }; // #1898 — the mass each price unit prices
const FIELDS = ["price", "recovery", "miningCost", "processingCost", "density", "slopeDeg"];
let keptForm = null; // TASKS.csv #2602 — the form as last set (a by-product cleared stays cleared when the pane reopens)
let kept = null; // #1356 — the last result, shown again when the pane or the tab comes back (this session)

// surfaces: the project's generated surfaces (the last pit's inputs come back from its saved parameters).
// onAdd({ name, positions, indices, params, tip, type, closure, color, tag }) puts the pit in the 3D view; onToggle(id) shows/hides a surface;
// onRemove(id) deletes one (#1498).
export default function PitShellPane({ surfaces = [], onAdd, onToggle, onRemove, onClose }) {
  const { voxelModels = [], terrain, layers, collars = [], assays = [], assayElements = [], survey = [], desurveyMethod, designStrings = [] } = useStore(); // assays..desurveyMethod: #2593; designStrings: #2120
  // a grade: a unit that counts metal first, then none stated (an import may simply not say); never a resistivity, a variance, an inversion or a category
  const models = useMemo(() => {
    const cat = new Set(categoricalModels(voxelModels));
    return voxelModels.filter((m) => gradeCandidate(m, (x) => cat.has(x)))
      .sort((a, c) => (valueUnit(c) ? 1 : 0) - (valueUnit(a) ? 1 : 0));
  }, [voxelModels]);
  const last = useMemo(() => [...surfaces].reverse().find((s) => s.type === "pit_shell" && !s.params?.seriesId)?.params?.inputs || null, [surfaces]); // not a series shell (#1927)
  const [modelId, setModelId] = useState(() => (keptForm && models.some((m) => (m.id ?? m.name) === keptForm.modelId) ? keptForm.modelId : models.find((m) => (m.id ?? m.name) === last?.modelId) ? last.modelId : models[0]?.id ?? models[0]?.name ?? "")); // keptForm: #2602
  const [f, setF] = useState(() => (keptForm && models.some((m) => (m.id ?? m.name) === keptForm.modelId) ? keptForm.f : { ...EMPTY, ...(last || {}), ...byFields(last), ...weathFields(last) })); // keptForm: #2602
  useEffect(() => { keptForm = { f, modelId }; }); // #2602 — after every render: the form and its model
  const [busy, setBusy] = useState(null);
  const [res, setRes] = useState(() => (kept && models.some((m) => m.name === kept.model) ? kept : null));
  const [hideEarlier, setHideEarlier] = useState(true);
  const [msg, setMsg] = useState(null);
  const [showSectors, setShowSectors] = useState(() => hasSectorSlopes(last?.sectorSlopes)); // #1881
  const sectorBad = SECTORS.some((k) => { const v = f.sectorSlopes?.[k]; return v !== "" && v != null && !(Number(v) > 0 && Number(v) < 90); });
  const setSector = (k, v) => { setF((p) => ({ ...p, sectorSlopes: { ...(p.sectorSlopes || {}), [k]: v } })); setMsg(null); };
  // TASKS.csv #1613 (review #1497, Lawyers) — the figures belong to one pit: once it is removed (here, or from 3D Modelling's
  // surfaces list) they go too, as does a "no pit" message once the inputs it describes are changed
  const resGone = !!res?.pitId && !surfaces.some((s) => s.id === res.pitId);
  useEffect(() => { if (resGone) { setRes(null); if (kept?.pitId === res.pitId) kept = null; } }, [resGone]);
  // TASKS.csv #1498 — Matt: "currently there is no way to turn off or remove or edit the pit shell". The pits are listed here with a
  // show / hide eye, Edit (their saved inputs back in the form; the next run replaces that pit) and delete.
  const pits = surfaces.filter((s) => s.type === "pit_shell");
  const [editingId, setEditingId] = useState(null);
  const editing = pits.find((s) => s.id === editingId) || null;
  const editPit = (s) => {
    const inp = s.params?.inputs || {};
    if (inp.modelId != null && models.some((m) => (m.id ?? m.name) === inp.modelId)) setModelId(inp.modelId);
    setF({ ...EMPTY, ...Object.fromEntries(Object.entries(inp).filter(([k]) => k in EMPTY && k !== "sectorSlopes").map(([k, v]) => [k, v == null ? "" : String(v)])), sectorSlopes: Object.fromEntries(SECTORS.map((k) => [k, inp.sectorSlopes?.[k] == null ? "" : String(inp.sectorSlopes[k])])), ...byFields(inp), ...weathFields(inp) }); // sectorSlopes: #1881; byFields: #1917; weathFields: #2597
    setShowSectors(hasSectorSlopes(inp.sectorSlopes));
    setEditingId(s.id); setMsg(null);
  };
  // TASKS.csv #2109 (review #2013, Woodjam) — a shell's benched designs (params.pitId) go with it and the confirm names them: they stayed
  // in the project with no word, and could no longer be re-made (the Pit design picker no longer offered their shell)
  const removePit = (s) => {
    const designs = surfaces.filter((g) => g.params?.pitId === s.id);
    const andDesigns = designs.length ? " " + tr("Its {n} benched design(s) go too: {names}.", { n: designs.length, names: designs.slice(0, 3).map((g) => `"${g.name}"`).join(", ") + (designs.length > 3 ? ` (+${designs.length - 3})` : "") }) : "";
    if (!confirmDestructive(tr("Remove the pit \"{name}\"?", { name: s.name }) + andDesigns, { recover: tr("run it again with the same inputs (Edit keeps them until then).") })) return;
    if (editingId === s.id) setEditingId(null);
    onRemove?.(s.id);
    designs.forEach((g) => onRemove?.(g.id));
  };
  const job = useRef(null);
  const model = models.find((m) => (m.id ?? m.name) === modelId) || null;
  const stated = model ? valueUnit(model) : null, unit = stated || f.unit;
  const element = elementOfModel(model); // #1748 — copper in ppm is still sold by the pound
  const metal = unit ? pitMetalOf(unit, element) : null;
  const prices = metal ? priceUnitsFor(metal, element) : null, priceUnit = prices?.some(([k]) => k === f.priceUnit) ? f.priceUnit : prices?.[0][0];
  // TASKS.csv #1917 (from #1615 Lawyers, #1749 Copley) — an optional BY-PRODUCT: a second block model on the same grid (Ag beside Au,
  // Au beside Cu) with its own price and recovery; a block's revenue is the sum over the metals. Only a model with a stated unit.
  const byCandidates = models.filter((m) => m !== model && valueUnit(m) && !(element && elementOfModel(m) === element)); // #2443 — the same metal is not a by-product (it would be paid twice)
  const byModel = byCandidates.find((m) => (m.id ?? m.name) === f.byModelId) || null;
  const byUnit = byModel ? valueUnit(byModel) : null, byElement = elementOfModel(byModel), byMetal = byUnit ? pitMetalOf(byUnit, byElement) : null;
  const byPrices = byMetal ? priceUnitsFor(byMetal, byElement) : null, byPriceUnit = byPrices?.some(([k]) => k === f.byPriceUnit) ? f.byPriceUnit : byPrices?.[0][0];
  const byLabel = byElement || byModel?.name || "", byPriceLabel = (byPrices?.find(([k]) => k === byPriceUnit) || [])[1] || "";
  // TASKS.csv #2115 (review #2013, Woodjam) — a by-product on another grid was refused only after Run: the block centres are matched on pick
  const byGridMiss = useMemo(() => (model && byModel ? joinByProduct(model.cells, byModel.cells).matched === 0 : false), [model, byModel]);
  const byBad = !!byModel && (byGridMiss || !byMetal || !(Number(f.byPrice) > 0) || !(Number(f.byRecovery) > 0 && Number(f.byRecovery) <= 100));
  const byInputs = byModel && byMetal ? { modelId: byModel.id ?? byModel.name, unit: byUnit, element: byElement, price: Number(f.byPrice), priceUnit: byPriceUnit, recovery: Number(f.byRecovery) } : null;
  const sg = useMemo(() => sgSummary(layers?.sg), [layers?.sg]);
  // TASKS.csv #2120 (review #2013, Woodjam) — a PIT AREA (a closed design string, not a stope outline): only the blocks whose centre lies inside
  // it are priced, so one prospect of a property-wide model gets its own grid (Woodjam's 10 m model was forced to 30.5 m cells over three)
  const areas = useMemo(() => designStrings.filter((s) => s.closed && s.vertices.length > 2 && !s.stopeRun), [designStrings]);
  const area = areas.find((s) => s.id === f.areaId) || null;
  const clip = (m) => { if (!m || !area) return m; const ring = area.vertices.map((p) => [p[0], p[1]]); return { ...m, cells: m.cells.filter((c) => ringContains(ring, [c.x, c.y])) }; };
  const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setMsg(null); }; // #1613
  // #1355 — a price belongs to the unit it was typed in: switching from a % model ($/lb) to a ppm one ($/oz) blanks it, never re-reads it
  const priceStale = f.price !== "" && !!f.priceUnit && !!prices && !prices.some(([k]) => k === f.priceUnit);
  // TASKS.csv #2442 (review #2325) — every conversion starts from the price as TYPED, so $/lb -> $/t -> $/lb returns 80, not 80.0001
  const typedPrice = useRef(null);
  const setPrice = (e) => { typedPrice.current = { value: e.target.value, unit: priceUnit }; setF((p) => ({ ...p, price: e.target.value, priceUnit })); };
  // #1898 — switching the picker converts the typed price to the new unit (1,800 $/oz is 57.87 $/g; 4 $/lb is 8,818 $/t)
  const setPriceUnit = (e) => {
    const F0 = metal?.unit === "g" ? PRICE_UNIT_MASS.g : PRICED_MASS_T;
    // #2442 — the typed price is the source while it still matches what the field shows (an Edit or a reload replaces it)
    const t0 = typedPrice.current, shown = Number(f.price);
    const viaTyped = t0 && Number(t0.value) > 0 && F0[t0.unit] != null && F0[priceUnit] != null ? Number(t0.value) * (F0[priceUnit] / F0[t0.unit]) : NaN;
    const src = t0 && shown > 0 && Math.abs(viaTyped - shown) <= 1e-5 * shown ? t0 : shown > 0 ? (typedPrice.current = { value: f.price, unit: priceUnit }) : null;
    const to = e.target.value, from = src ? src.unit : priceUnit, n = Number(src ? src.value : f.price); // #2442
    const F = metal?.unit === "g" ? PRICE_UNIT_MASS.g : PRICED_MASS_T; // lbU3O8 / kgU: #2434
    const conv = n > 0 && from && from !== to && F[from] != null && F[to] != null ? n * (F[to] / F[from]) : null;
    setF((p) => ({ ...p, priceUnit: to, price: to === from && src ? src.value : conv == null ? p.price : String(+conv.toPrecision(6)) }));
    setMsg(conv == null ? null : tr("The price was converted to {unit}: {v}.", { unit: (prices.find(([k]) => k === to) || [])[1] || to, v: +conv.toPrecision(6) }));
  };
  const value = (k) => (k === "price" && priceStale ? NaN : Number(f[k]));
  // TASKS.csv #2647 — a density per code of a logged layer (Lithology: LIG 1.3, SAN 1.9 ...), each block taking the nearest logged interval
  const codeLayers = useMemo(() => DENSITY_CODE_LAYERS.filter((k) => (layers?.[k] || []).some((r) => r.value != null && String(r.value).trim() !== "")), [layers]);
  const layerCodes = useMemo(() => (f.densityLayer ? [...new Set((layers?.[f.densityLayer] || []).map((r) => String(r.value ?? "").trim()).filter(Boolean))].sort().slice(0, 30) : []), [f.densityLayer, layers]);
  const codeDensityBad = Object.values(f.densityByCode || {}).some((v) => v !== "" && v != null && !(Number(v) > 0));
  // TASKS.csv #2437 (review #2325, WA uranium) — an optional waste density: blank, every rock takes the one density
  const wasteBad = f.wasteDensity !== "" && f.wasteDensity != null && !(Number(f.wasteDensity) > 0);
  // TASKS.csv #2439 — an optional flatter (or steeper) slope above an RL: both numbers, or neither
  const limitBad = f.limitM !== "" && f.limitM != null && !(Number(f.limitM) >= 0); // #2665
  const upperTyped = f.upperDeg !== "" || f.upperRL !== "", upperBad = upperTyped && !(Number(f.upperDeg) > 0 && Number(f.upperDeg) < 90 && f.upperRL !== "" && Number.isFinite(Number(f.upperRL)));
  // TASKS.csv #2597 (review #2486, WA lithium) — an optional weathered zone: a thickness below the ground, or the base of the Weathering log's
  // fresh-rock code in each hole, interpolated between the holes; its own density for every tonne above it
  const weathRows = layers?.weath || [];
  const weathCodes = useMemo(() => weatheringCodes(weathRows), [weathRows]);
  const weathBase = useMemo(() => (f.weathMode === "log" && f.weathCode ? weatheredBasePoints(weathRows, holeTraces(collars, survey, desurveyMethod), f.weathCode) : null), [f.weathMode, f.weathCode, weathRows, collars, survey, desurveyMethod]);
  const weathBad = !!f.weathMode && (!(Number(f.weathDensity) > 0) || (f.weathMode === "thick" ? !(Number(f.weathThick) > 0) : !weathBase?.points.length));
  const weathInputs = !f.weathMode || weathBad ? null : f.weathMode === "thick" ? { density: Number(f.weathDensity), thicknessM: Number(f.weathThick) } : { density: Number(f.weathDensity), freshCode: f.weathCode };
  const missing = limitBad /* #2665 */ || codeDensityBad /* #2647 */ || wasteBad || weathBad || upperBad || !model || !metal || FIELDS.some((k) => !(value(k) > 0)) || value("slopeDeg") >= 90 || value("recovery") > 100 || !(Number(f.revenueFactor) > 0) || sectorBad || byBad; // revenue factor: #1363; sectorBad: #1881; byBad: #1917
  // #1753 — when every number is typed but one is out of its range, say which
  const outOfRange = (() => {
    if (!model || !metal) return null;
    if (FIELDS.some((k) => f[k] === "") || f.revenueFactor === "") return null;
    if (value("slopeDeg") >= 90) return tr("The overall slope must be below 90°.");
    if (wasteBad) return tr("The waste density must be above 0, or blank."); // #2437
    if (upperBad && f.upperDeg !== "" && f.upperRL !== "") return tr("The upper slope is between 0 and 90°, with the RL it starts at."); // #2439
    if (weathBad && (f.weathDensity === "" || (f.weathMode === "thick" && f.weathThick === ""))) return null; // #2597 — still being typed
    if (weathBad) return f.weathMode === "log" && !weathBase?.points.length ? tr("No hole of the Weathering log reaches that code: choose the code of fresh rock.") : tr("The weathered zone needs a density and a thickness above 0.");
    if (value("recovery") > 100) return tr("The recovery is at most 100 %.");
    if (!(Number(f.revenueFactor) > 0)) return tr("The revenue factor must be above 0.");
    if (byModel && (f.byPrice === "" || f.byRecovery === "")) return null; // #1917
    if (byModel && !(Number(f.byPrice) > 0)) return tr("The by-product price must be above 0.");
    if (byModel && !(Number(f.byRecovery) > 0 && Number(f.byRecovery) <= 100)) return tr("The by-product recovery is between 0 and 100 %.");
    const zero = FIELDS.find((k) => !(value(k) > 0));
    return zero ? tr("Every price, cost, recovery, density and slope must be above 0.") : null;
  })();
  const eco = !missing ? pitEconomics({ unit, element, price: value("price"), priceUnit, recovery: value("recovery"), processingCost: value("processingCost"), revenueFactor: Number(f.revenueFactor) || 1, by: byInputs }) : null; // by: #1917
  const cutoff = eco?.cutoff ?? null;

  const run = async () => {
    const rf = Number(f.revenueFactor) > 0 ? Number(f.revenueFactor) : 1, size = Number(f.size) > 0 ? Number(f.size) : null;
    // #1881 — the sector slopes that are set, as numbers; none set: no key at all, so an older project's inputs read the same
    const sectors = Object.fromEntries(SECTORS.filter((k) => Number(f.sectorSlopes?.[k]) > 0 && Number(f.sectorSlopes?.[k]) < 90).map((k) => [k, Number(f.sectorSlopes[k])]));
    const inputs = { unit, element, price: value("price"), priceUnit, recovery: value("recovery"), miningCost: value("miningCost"), processingCost: value("processingCost"), density: value("density"), ...(Number(f.wasteDensity) > 0 ? { wasteDensity: Number(f.wasteDensity) } : {}) /* #2437 */, ...(f.densityLayer && typedCodeDensities(f.densityByCode) ? { densityLayer: f.densityLayer, densityByCode: typedCodeDensities(f.densityByCode) } : {}) /* #2647 */, slopeDeg: value("slopeDeg"), revenueFactor: rf, size, ...(Object.keys(sectors).length ? { sectorSlopes: sectors } : {}), ...(byInputs ? { by: byInputs } : {}), ...(weathInputs ? { weathered: weathInputs } : {}) /* #2597 */, ...(upperTyped && !upperBad ? { upperSlope: { slopeDeg: Number(f.upperDeg), rl: Number(f.upperRL) } } : {}) /* #2439 */, ...(f.limitM !== "" && f.limitM != null && Number(f.limitM) >= 0 ? { limitM: Number(f.limitM) } : {}) /* #2665 */ }; // by: #1917
    setBusy(0); setMsg(null); // the previous result stays until a new one arrives (#1366)
    const t0 = performance.now();
    try {
      const runInputs = weathInputs?.freshCode ? { ...inputs, weathered: { ...weathInputs, points: weathBase.points } } : inputs; // #2597 — the points go to the solve, not into the saved pit
      const byIn = clip(byModel), coded = modelWithCodeDensity(clip(model), inputs, layers, collars, survey, desurveyMethod), mIn = coded.model; // #2120; per-code density: #2647
      if (area && !mIn.cells.length) { setMsg(tr("No block of \"{model}\" lies inside \"{area}\".", { model: model.name, area: area.name })); return; }
      job.current = runPitShellAsync(mIn, runInputs, terrain, (phases) => setBusy(phases), collars, byIn); // collars: the ground when there is no terrain (#1353); byModel: #1917; clipped to the pit area: #2120
      const r = await job.current.promise;
      if (r.cancelled) { setMsg(tr("Cancelled: nothing was added.")); return; }
      setRes(null); kept = null;
      if (r.failed || r.empty) {
        setMsg(r.empty ? tr("At these inputs no block pays for the rock over it, so there is no pit. Cut-off grade {c} {unit}.", { c: Number(r.cutoff.toPrecision(3)), unit: `${gradeUnitText(unit, element) /* #2111 */}${element ? ` ${element}` : ""}${oxideSuffix(r.cutoff, unit, element)}` /* #2594 */ })
          : r.failed === "underground" ? tr("The collars look like underground drill positions ({upward} hole(s) drilled upward, {stacked} pair(s) of collars stacked over each other): no ground surface is known, so no pit is cut from them. Load a terrain (Maps > Terrain) for the real surface.", { upward: r.underground?.upward ?? 0, stacked: r.underground?.stacked ?? 0 }) /* #2276 */
          : r.failed === "by-grid" ? tr("\"{by}\" is not on the same grid as \"{model}\": no block centre matches. Estimate the by-product with the same cell size over the same area (the same holes or area box) and run again.", { by: byModel?.name || "?", model: model.name }) // #1917
          : r.failed === "by-units" ? tr("The by-product model's grade unit cannot be priced.")
          : tr("The block model has no blocks with values."));
        return;
      }
      const seconds = Math.round((performance.now() - t0) / 100) / 10, rfText = rf !== 1 ? ` x${rf}` : "";
      const cellText = size || r.coarsened ? tr(", {c} m cells", { c: Math.round(r.cell[0] * 10) / 10 }) : ""; // #1900 — a typed or coarsened size names the pit
      const support = model.cells.some((c) => Number.isFinite(c.nHoles)); // #1354 — the estimate says how many holes informed each block
      // TASKS.csv #2593 — the project's assays of this element inside the pit and outside the model: drilled rock the pit counted as barren
      let outside = null;
      if (r.barrenShare > 0.02 && element && assays.length) {
        try {
          const units = Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit]));
          const samples = excludeQAQC(assays).filter((a) => a.values && a.values[element] != null).map((a) => ({ hole_id: a.hole_id, from: a.from, to: a.to, value: valueIn(a, element, unit, units) }));
          if (samples.length) outside = drilledOutsideModel(model.cells, samples, holeTraces(collars, survey, desurveyMethod), { positions: r.positions, indices: r.indices, cellM: r.cell[0] }, r.cutoff);
        } catch { outside = null; }
      }
      const beyondFlagged = !!model.params?.beyondFlagged || model.cells.some((c) => c.beyond); // #2435 — the estimate flagged blocks beyond its samples (#2417)
      const nearUnsFlagged = !!model.params?.nearUnsampledFlagged || model.cells.some((c) => c.nearUnsampled); // #2596 — and blocks whose nearest drilling was never sampled
      const logFilled = Number(model.params?.unsampledLogFilledM) > 0 ? { log: model.params.unsampledLog, factor: model.params.unsampledLogFactor } : null; // #2748 — as Grade-tonnage's logKnown (#2721)
      kept = { ...r, densityUsed: coded.used ? { layer: inputs.densityLayer, used: coded.used } : null /* #2647 */, unit, seconds, hasTerrain: !!terrain, model: model.name, slopeDeg: inputs.slopeDeg, sectorSlopes: inputs.sectorSlopes || null, support, beyondFlagged, nearUnsFlagged /* #2596 */, logFilled /* #2748 */, byUnit, byLabel, byElement, element /* #2594 */, outside /* #2593 */, weathered: inputs.weathered || null /* #2597 */ }; // byUnit / byLabel: #1917; beyondFlagged: #2435
      setRes(kept);
      const contained = r.metalU * r.metalFactor;
      if (hideEarlier) surfaces.filter((s) => s.type === "pit_shell" && s.visible && s.id !== editingId).forEach((s) => onToggle?.(s.id)); // #1356 — one pit on view at a time
      if (editingId) { onRemove?.(editingId); setEditingId(null); } // #1498 — the edited pit is replaced by the new run
      const priceLabel = (prices.find(([k]) => k === priceUnit) || [])[1] || "";
      const pitId = onAdd({
        // #1356 — named by what usually changes between runs, so a list of pits can be told apart
        name: tr("Pit shell: {model} at {price} {unit}{by}, {slope}°{rf}{sec}{cells}", { model: model.name, price: inputs.price, unit: priceLabel, by: byInputs ? tr(" + {el} at {price} {unit}", { el: byLabel, price: byInputs.price, unit: byPriceLabel }) : "", slope: slopeName(inputs.slopeDeg, inputs.sectorSlopes ? null : r.walls), rf: rfText, sec: inputs.sectorSlopes ? tr(" (by sector)") : "", cells: cellText + (inputs.upperSlope ? tr(", {s}° above {rl} m", { s: inputs.upperSlope.slopeDeg, rl: inputs.upperSlope.rl }) : "") /* #2439 */ + (inputs.wasteDensity ? tr(", waste {w} t/m³", { w: inputs.wasteDensity }) : "") /* #2437 */ + (inputs.weathered ? tr(", weathered {w} t/m³", { w: inputs.weathered.density }) : "") /* #2597 */ }) /* by: #1917; slopeName: #2433 */, positions: r.positions, indices: r.indices, type: "pit_shell", closure: null, color: "#b5651d", tag: "pit",
        tip: tr("Conceptual pit shell: not a mine plan, a Reserve or a Resource"),
        params: { tool: "conceptual pit shell (maximum closure, exact)", ...(area ? { pitArea: area.name, blocksInArea: clip(model).cells.length } : {}) /* #2120 */, inputs: { ...inputs, priceUnit, modelId, unit: stated ? "" : unit }, blockModel: model.name, element: element || null /* #2434 */, gradeUnit: unit, oreTonnes: Math.round(r.oreT), wasteTonnes: Math.round(r.wasteT), stripRatio: r.stripRatio == null ? null : +r.stripRatio.toFixed(2), meanGrade: r.meanGrade == null ? null : +r.meanGrade.toPrecision(4), containedMetal: Math.round(contained), containedMetalUnit: r.metalUnit, cutoffGrade: +r.cutoff.toPrecision(3), undiscountedMargin: Math.round(r.money), maxDepthM: Math.round(r.maxDepth), wallAnglesDeg: [+r.walls.flattest.toFixed(1), +r.walls.steepest.toFixed(1)], drawnWallsDeg: r.parts?.drawnWalls ? [+r.parts.drawnWalls.flattest.toFixed(1), +r.parts.drawnWalls.steepest.toFixed(1)] : null, pitCount: r.parts?.pits?.length ?? null, largestPit: r.parts?.pits?.[0] ? { oreTonnes: Math.round(r.parts.pits[0].oreT), wasteTonnes: Math.round(r.parts.pits[0].wasteT), stripRatio: r.parts.pits[0].stripRatio == null ? null : +r.parts.pits[0].stripRatio.toFixed(2), meanGrade: r.parts.pits[0].meanGrade == null ? null : +r.parts.pits[0].meanGrade.toPrecision(4) } : null /* #1929 */, largestPitBoxM: r.parts?.pits?.[0]?.boxM ? r.parts.pits[0].boxM.map((v) => Math.round(v)) : null, largestPitOreShare: r.parts?.pits?.length ? +(r.parts.pits[0].oreT / Math.max(1e-9, r.oreT)).toFixed(3) : null, blocksDeep: r.parts?.blocksDeep ?? null, gridCellM: r.cell.map((v) => +v.toFixed(1)), rockOutsideBlockModelShare: +r.barrenShare.toFixed(3), oreAboveGroundTonnes: Math.round(r.oreAboveGroundT || 0), oreAboveGroundBlocks: r.oreAboveGroundBlocks || 0, noTerrainShare: +r.topAssumed.toFixed(3), groundFrom: r.groundSource, ...(support ? { oreSingleHoleShare: +r.oreSingleHoleShare.toFixed(3), oreExtrapolatedShare: +r.oreExtrapolatedShare.toFixed(3) } : {}), ...(beyondFlagged ? { oreBeyondSampleShare: +(r.oreBeyondSampleShare || 0).toFixed(3) } : {}) /* #2435 */, ...(nearUnsFlagged ? { oreNearUnsampledShare: +(r.oreNearUnsampledShare || 0).toFixed(3) } : {}) /* #2596 */, ...(logFilled ? { oreFromLogMetalShare: +(r.oreFromLogMetalShare || 0).toFixed(3) } : {}) /* #2748 */, ...(inputs.weathered ? { weatheredTonnes: Math.round(r.weatheredT || 0) } : {}) /* #2597 */, ...(outside ? { drilledOutsideModel: { samples: outside.samples, metres: Math.round(outside.metres), holes: outside.holes, atOrAboveCutoffMetres: Math.round(outside.oreMetres), atOrAboveCutoffHoles: outside.oreHoles } } : {}) /* #2593 */, reachesModelBase: r.touchesBase,
          // #1917 — the by-product: its inputs, what the pit holds of it, and its share of the revenue; the cut-off is then a revenue test
          ...(r.by && byInputs ? { byProduct: { blockModel: byModel.name, element: byLabel, gradeUnit: byUnit, price: byInputs.price, priceUnit: byInputs.priceUnit, recovery: byInputs.recovery, meanGrade: r.by.meanGrade == null ? null : +r.by.meanGrade.toPrecision(4), containedMetal: Math.round(r.by.metalU * r.by.metalFactor), containedMetalUnit: r.by.metalUnit, revenueShare: +r.by.revenueShare.toFixed(3), blocksWithGradeShare: +r.by.matchedShare.toFixed(3) }, cutoffBasis: "a block is ore when its revenue over both metals, at these prices and recoveries, is at or above the processing cost per tonne; cutoffGrade is the main metal's alone" } : {}),
          caution: "conceptual: undiscounted, no ramps, berms, dilution or scheduling; not a Mineral Reserve or Resource", generatedAt: new Date().toISOString() },
      });
      if (pitId) { kept = { ...kept, pitId }; setRes(kept); } // #1613 — the result knows its pit
    } catch (e) {
      setMsg(tr("The pit run failed: {v}", { v: e.message || e }));
    } finally {
      setBusy(null); job.current = null;
    }
  };
  const cancel = () => job.current?.cancel();
  const metalText = (r, el = element) => metalAmountText(r.metalU * r.metalFactor, r.metalUnit, el, big); // #1748 — and pounds; uranium as lb U3O8: #2434
  const line = (label, v, muted = false) => <div style={row}><span>{label}</span><b style={muted ? { color: "var(--color-text-muted)", fontWeight: 400 } : undefined}>{v}</b></div>;
  // TASKS.csv #2435 (review #2325, WA uranium) — ore in blocks above or below every sample informing them is unsampled ground, neither
  // barren nor ore: past a fifth of the ore, it is said above the tonnes and the strip ratio and margin are greyed
  const beyondP = res?.beyondFlagged ? res.oreBeyondSampleShare || 0 : 0, unsampledOre = beyondP > 0.2;
  // TASKS.csv #2596 (review #2486, WA lithium: 10.4 of 31.9 Mt) — ore in blocks whose nearest drilling was never sampled for the element:
  // selective sampling carried the sampled grade across unsampled core; said beside the beyond-the-samples share, warned past a fifth
  const nearUnsP = res?.nearUnsFlagged ? res.oreNearUnsampledShare || 0 : 0, nearUnsOre = nearUnsP > 0.2;
  const logP = res?.logFilled ? res.oreFromLogMetalShare || 0 : 0; // #2748
  const field = (k, label, extra = {}) => <label style={row}>{label}<input type="number" min={0} step="any" value={f[k]} onChange={set(k)} style={num} {...extra} /></label>;

  return (
    <div>
      <TaskPaneHeader title="Pit shell" icon={Pickaxe} tone="model" onClose={onClose} />
      <div style={note}>{tr("The pit that makes the most money at your prices and costs, solved exactly. It answers whether a body sits shallow enough for a pit. It has no discounting, ramps, berms or dilution, so it is not a mine plan, a Reserve or a Resource.")}</div>
      {!models.length && <div style={warn}>{tr("It needs a block model of grades. Estimate one (3D Modelling > Estimation) or import one.")}</div>}
      <NotOfferedGrades voxelModels={voxelModels} />{/* #1849 — why the project's models are not offered; #2436 — whenever one is left out, with its unit */}
      {models.length > 0 && (<>
        <label style={row}>{tr("Block model")}<select value={modelId} onChange={(e) => setModelId(e.target.value)} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Block model of the pit")}>
          {models.map((m) => <option key={m.id ?? m.name} value={m.id ?? m.name}>{m.name}</option>)}
        </select></label>
        {/* TASKS.csv #1749 — a calculated element (CuEq) estimated with the unit "index" is not a grade: say so, and what to do */}
        {voxelModels.some((m) => valueUnit(m) === "index") && <div style={note}>{tr("Not offered: {list}, whose unit is \"index\". Give the calculated element a grade unit (Geochem › Calc. element: % for a CuEq, g/t for an AuEq) and estimate it again.", { list: voxelModels.filter((m) => valueUnit(m) === "index").map((m) => `"${m.name}"`).join(", ") })}</div>}
        {model && !stated && <label style={row}>{tr("Its grades are in")}<select value={f.unit} onChange={set("unit")} style={num} aria-label={tr("Grade unit of the block model")}><option value="">{tr("— choose —")}</option>{GRADE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>}
        <label style={row}>{tr("Metal price")}<span style={{ display: "flex", gap: 4 }}><input type="number" min={0} step="any" value={priceStale ? "" : f.price} onChange={setPrice} style={num} aria-label={tr("Metal price")} />
          <select value={priceUnit || ""} onChange={setPriceUnit} disabled={!prices} style={{ ...smallSel, width: (prices || []).some(([, l]) => l.length > 6) ? 96 : 62 }} aria-label={tr("Price unit")}>{/* width: "$/lb U3O8", #2434 */}{(prices || []).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></span></label>
        {priceStale && <div style={warn}>{tr("The price was entered for another metal unit: enter it again for this block model.")}</div>}
        {field("recovery", tr("Metallurgical recovery (%)"))}
        {/* TASKS.csv #1917 (from #1615 / #1749) — a by-product metal: a second block model on the same grid, its own price and recovery */}
        {model && <label style={row}>{tr("By-product (optional)")}<select value={byModel ? f.byModelId : ""} onChange={(e) => { setF((p) => ({ ...p, byModelId: e.target.value })); setMsg(null); }} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("By-product block model")} title={tr("A second metal credited from its own block model, estimated on the same grid as the main one (the same cell size over the same area): Ag beside Au, Au beside Cu, Ta beside Li.")}>
          <option value="">{byCandidates.length ? tr("— none —") : tr("— none: estimate a second metal with the same cell over the same holes (Estimation › Grid: Fit to the checked holes) —") /* TASKS.csv #2598 — the route that gives the same lattice today */}</option>{byCandidates.map((m) => <option key={m.id ?? m.name} value={m.id ?? m.name}>{m.name}</option>)}
        </select></label>}
        {byModel && (<>
          <label style={row}>{tr("{el} price", { el: byLabel })}<span style={{ display: "flex", gap: 4 }}><input type="number" min={0} step="any" value={f.byPrice} onChange={set("byPrice")} style={num} aria-label={tr("By-product price")} />
            <select value={byPriceUnit || ""} onChange={set("byPriceUnit")} style={{ ...smallSel, width: (byPrices || []).some(([, l]) => l.length > 6) ? 96 : 62 }} /* #2595 — "$/lb Ta2O5" */ aria-label={tr("By-product price unit")}>{(byPrices || []).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></span></label>
          {field("byRecovery", tr("{el} recovery (%)", { el: byLabel }))}
          {byGridMiss && <div style={warn}>{tr("\"{by}\" is not on the same grid as \"{model}\": no block centre matches. Estimate the by-product with the same cell size over the same area (the same holes or area box) and run again.", { by: byModel.name, model: model.name })}</div>}{/* #2115 — the run's own message, said on pick */}
          <div style={note}>{tr("A block is ore when its revenue over both metals pays the processing cost; the pit, its ore and its strip ratio follow.")}</div>
        </>)}
        {field("miningCost", tr("Mining cost ($/t rock)"))}
        {field("processingCost", tr("Processing cost ($/t ore)"))}
        {field("density", tr("Density (t/m³)"), { title: tr("The density of the ore blocks; of all the rock when no waste density is entered.") })}
        {field("wasteDensity", tr("Waste density (t/m³)"), { placeholder: tr("optional"), title: tr("Optional: the density of the blocks below cut-off and of the rock outside the block model (cover, host rock). Blank: the density above for all rock.") })}{/* #2437 */}
        {codeLayers.length > 0 && <label style={row} title={tr("A density per code of a logged layer: each block takes the nearest logged interval within reach and that code's density, ore or waste; a block with no code, or a code with no density typed, takes the densities above.")}>{tr("Density by")}<select value={f.densityLayer} onChange={set("densityLayer")} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Density by")}><option value="">{tr("one value")}</option>{codeLayers.map((k) => <option key={k} value={k}>{k === "weath" ? tr("Weathering") : k === "litho" ? tr("Lithology") : tr("Alteration")}</option>)}</select></label>}{/* #2647 */}
        {f.densityLayer && layerCodes.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", marginTop: 4, fontSize: "var(--font-size-sm)" }}>{layerCodes.map((code) => <label key={code} style={{ display: "flex", alignItems: "center", gap: 4 }}>{code}<input type="number" min={0} step={0.01} value={f.densityByCode?.[code] ?? ""} placeholder={tr("blank")} onChange={(e) => { const v = e.target.value; setF((p) => ({ ...p, densityByCode: { ...(p.densityByCode || {}), [code]: v } })); setMsg(null); }} aria-label={tr("Density of {code} (t/m³)", { code })} style={{ ...smallSel, width: 60 }} /></label>)}</div>}
        {codeDensityBad && <div style={warn}>{tr("A code's density must be above 0, or blank.")}</div>}
        {/* TASKS.csv #2597 — an optional weathered zone with its own density */}
        <label style={row}>{tr("Weathered zone (optional)")}<select value={f.weathMode} onChange={set("weathMode")} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Weathered zone")}>
          <option value="">{tr("— none —")}</option><option value="thick">{tr("a thickness below the ground")}</option>{weathRows.length > 0 && <option value="log">{tr("from the Weathering log")}</option>}
        </select></label>
        {f.weathMode === "thick" && field("weathThick", tr("Weathered to (m below the ground)"))}
        {f.weathMode === "log" && <label style={row}>{tr("Fresh rock is logged as")}<select value={f.weathCode} onChange={set("weathCode")} style={num} aria-label={tr("Code of fresh rock in the Weathering log")}><option value="">{tr("— choose —")}</option>{weathCodes.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>}
        {f.weathMode === "log" && weathBase?.points.length > 0 && <div style={note}>{tr("Its top in {n} of the {l} logged holes: {a}–{b} m below the collar (median {m}); between the holes it is interpolated. {w} hole(s) never reach it.", { n: weathBase.points.length, l: weathBase.logged, a: Math.round(weathBase.min), b: Math.round(weathBase.max), m: Math.round(weathBase.median), w: weathBase.without })}</div>}
        {f.weathMode && field("weathDensity", tr("Weathered density (t/m³)"), { title: tr("Every tonne above the base of the weathered zone, ore or waste, at this density.") })}
        {sg && !f.density && <div style={{ ...note, marginTop: 2 }}><button onClick={() => setF((p) => ({ ...p, density: String(sg.mean) }))} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "1px 6px" }}>{tr("Use the logged mean, {v} (all {n} measurements, every hole)", { v: sg.mean, n: sg.n })}</button></div>}{/* every hole: #1755 */}
        {field("slopeDeg", tr("Overall slope (°)"))}
        {/* TASKS.csv #2439 — a slope for the ground above an RL (soft cover over the ore): both blank, the overall slope everywhere */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          {field("upperDeg", tr("Upper slope (°)"), { title: tr("Optional: the slope of the walls above the RL beside it (soft cover, weathered rock), from a geotechnical study. Blank: the overall slope everywhere."), placeholder: tr("optional") })}
          {field("upperRL", tr("above RL (m)"), { placeholder: "RL" })}
        </div>
        {field("limitM", tr("Keep within (m of the block model)"), { placeholder: tr("optional"), title: tr("Optional: the pit may not reach further than this, in plan, from the block model's columns; a block whose slope would need ground beyond it stays in the ground. Blank: no limit, the walls go where the slope takes them and the rock outside the model counts as barren.") })}{/* #2665 */}
        {limitBad && <div style={warn}>{tr("The distance must be 0 or more, or blank.")}</div>}
        {/* TASKS.csv #1881 — a slope per wall sector: the wall on that side of the pit; blank takes the overall slope */}
        <div style={{ ...note, marginTop: 2 }}><button onClick={() => setShowSectors((v) => !v)} style={linkBtn} aria-expanded={showSectors}>{showSectors ? tr("Hide the slope by wall sector") : tr("Slope by wall sector…")}</button></div>
        {showSectors && (
          <div style={{ marginTop: 4 }}>
            <div style={note}>{tr("The wall on each side of the pit: blank takes the overall slope. From a geotechnical study, not a guess.")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, marginTop: 4 }}>
              {SECTOR_GRID.flat().map((k, i) => (k
                ? <label key={k} style={{ ...note, display: "flex", alignItems: "center", gap: 3, minWidth: 0 }}><span style={{ width: 20, textAlign: "right", flexShrink: 0 }}>{k}</span><input type="number" min={1} max={89} step="any" value={f.sectorSlopes?.[k] ?? ""} onChange={(e) => setSector(k, e.target.value)} placeholder={f.slopeDeg || "°"} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Slope of the {k} wall", { k })} /></label>
                : <span key={`c${i}`} style={{ ...note, textAlign: "center", alignSelf: "center" }}>°</span>))}
            </div>
            {sectorBad && <div style={warn}>{tr("A sector slope must be between 0 and 90°.")}</div>}
          </div>
        )}
        {areas.length > 0 && <label style={row}>{tr("Pit area")}<select value={area ? f.areaId : ""} onChange={set("areaId")} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Pit area")} title={tr("Only the blocks whose centre lies inside this closed design string are priced: one prospect of a model that covers several gets its own grid.")}><option value="">{tr("— the whole model —")}</option>{areas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}{/* #2120 */}
        {field("revenueFactor", tr("Revenue factor"), { title: tr("Multiplies the price: below 1 gives a smaller pit, a quick test of how much it depends on price.") })}
        {field("size", tr("Pit block size (m)"), { placeholder: tr("auto"), title: tr("Blank: the block model's own size. A larger size runs faster and draws coarser walls; a block keeps its own ore or waste decision either way.") })}
        {cutoff != null && <div style={{ ...note, marginTop: 4 }}>{eco?.by
          ? tr("Cut-off at these inputs: a block is ore when its revenue over both metals is at least the ${p}/t processing cost; alone, {el} {c} {unit} or {el2} {c2} {unit2}.", { p: value("processingCost"), el: element || model.name, c: Number(cutoff.toPrecision(3)), unit: gradeUnitText(unit, element) + oxideSuffix(cutoff, unit, element) /* #2594; g/t: #2111 */, el2: byLabel, c2: Number(eco.by.cutoff.toPrecision(3)), unit2: gradeUnitText(byUnit, byElement) + oxideSuffix(eco.by.cutoff, byUnit, byElement) }) /* #1917 */
          : tr("Cut-off grade at these inputs: {c} {unit}.", { c: Number(cutoff.toPrecision(3)), unit: `${gradeUnitText(unit, element)}${element ? ` ${element}` : ""}${oxideSuffix(cutoff, unit, element)}` /* #2594 — '0.119 % Li (0.256 % Li2O)' */ })}</div>}
        {!terrain && <div style={warn}>{collars.some((c) => Number.isFinite(c.z))
          ? tr("No terrain is loaded, so the ground is interpolated between the {n} collar elevations. Load a terrain in Maps for the real surface.", { n: collars.filter((c) => Number.isFinite(c.z)).length })
          : tr("No terrain is loaded and no collar has an elevation, so the top of each column of the block model stands in for the ground, interpolated between columns: nothing above the highest block is costed. Load a terrain in Maps for the real surface.")}</div>}{/* #1850 */}
        {surfaces.some((s) => s.type === "pit_shell" && s.visible) && <label style={{ ...row, justifyContent: "flex-start" }}><input type="checkbox" checked={hideEarlier} onChange={(e) => setHideEarlier(e.target.checked)} />{tr("Hide the earlier pits when this one is made")}{/* #2119 — it acts on Run, not when ticked */}</label>}
        {busy == null
          ? <button onClick={run} disabled={missing} style={{ ...pBtn, marginTop: 8, opacity: missing ? 0.5 : 1 }}><Pickaxe size={14} /> {editing ? tr("Run and replace the pit") : tr("Run the pit shell")}</button>
          : <button onClick={cancel} style={{ ...pBtn, marginTop: 8 }}>{tr("Solving ({n}): cancel", { n: busy })}</button>}
        {missing && busy == null && (outOfRange
          ? <div style={warn}>{outOfRange}</div>
          : <div style={note}>{tr("Enter every number above: none has a default, because the result is only as good as they are.")}</div>)}{/* #1753 */}
        {editing && <div style={{ ...note, marginTop: 4 }}>{tr("Editing \"{name}\": its inputs are in the form; running replaces it.", { name: editing.name })} <button onClick={() => setEditingId(null)} style={linkBtn}>{tr("Stop editing")}</button></div>}
      </>)}
      {pits.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...row, marginTop: 0, fontWeight: 600, color: "var(--color-text)" }}>{tr("Pits ({n})", { n: pits.length })}</div>
          {pits.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, padding: "4px 6px", border: `1px solid ${s.id === editingId ? "var(--color-selected-border)" : "var(--color-border)"}`, borderRadius: 5, background: "var(--color-bg-subtle)", fontSize: "var(--font-size-sm)" }}>
              <button onClick={() => onToggle?.(s.id)} style={iconBtnStyle} aria-label={s.visible ? tr("Hide {name}", { name: s.name }) : tr("Show {name}", { name: s.name })} title={s.visible ? tr("Hide") : tr("Show")}>{s.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
              <span title={s.name} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: s.visible ? "var(--color-text)" : "var(--color-text-muted)" }}>{String(s.name).replace(/^Pit shell: /, "")}</span>
              {Number.isFinite(s.params?.oreTonnes) && <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", flexShrink: 0 }}>{`${big(s.params.oreTonnes)} t`}</span>}
              <button onClick={() => editPit(s)} style={iconBtnStyle} aria-label={tr("Edit {name}", { name: s.name })} title={tr("Put this pit's inputs in the form; the next run replaces it")}><Pencil size={13} /></button>
              <button onClick={() => removePit(s)} style={iconBtnStyle} aria-label={tr("Remove {name}", { name: s.name })} title={tr("Remove")}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
      {msg && <div style={warn}>{msg}</div>}
      {res && (
        <div style={{ marginTop: 8, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }}>
          {unsampledOre && <div style={{ ...warn, marginTop: 0, marginBottom: 4 }}>{tr("{p} % of this ore is in blocks above or below every sample that informs them: unsampled ground, neither barren nor ore. The strip ratio and the margin rest on it, so read them as not meaningful. Drilled metres with no sample can be estimated as barren: 3D Modelling › Estimation, \"Unsampled metres inside a sampled hole\".", { p: Math.round(beyondP * 100) })}</div>}
          {line(tr("Ore"), `${big(res.oreT)} t`)}
          {line(tr("Mean grade"), gradeWithElement(res.meanGrade, res.unit, res.element))}{/* #2594 */}
          {res.support && <div style={row}><span title={tr("One hole: the block's estimate used a single hole, or one hole carried at least 95 % of its weight (the estimate's own test). Extrapolated: the estimate classed the block as extrapolated or unsupported.")}>{tr("Ore from one hole / extrapolated")}</span><b>{`${Math.round(res.oreSingleHoleShare * 100)} % / ${Math.round(res.oreExtrapolatedShare * 100)} %`}</b></div>}{/* one hole incl. 95 %-weight blocks: #1617 */}
          {line(tr("Contained metal"), metalText(res))}
          {/* #1917 — the by-product's grade, metal and share of the revenue */}
          {res.by && line(tr("Mean {el} grade", { el: res.byLabel }), gradeWithElement(res.by.meanGrade, res.byUnit, res.byElement))}
          {res.by && line(tr("Contained {el}", { el: res.byLabel }), metalText(res.by, res.byElement))}{/* #2595 — in the by-product's own words (it read "t Li (... SC6 ...)" for Ta) */}
          {res.by && line(tr("Revenue from {el}", { el: res.byLabel }), `${Math.round(res.by.revenueShare * 100)} %`)}
          {res.by && res.by.matchedShare < 0.999 && <div style={warn}>{tr("{p} % of the main model's blocks have a {el} grade: the rest count no {el}.", { p: Math.round(res.by.matchedShare * 100), el: res.byLabel })}</div>}
          {line(tr("Waste"), `${big(res.wasteT)} t`)}
          {res.weathered && line(tr("Of the rock, weathered"), tr("{t} t at {d} t/m³", { t: big(res.weatheredT || 0), d: res.weathered.density }))}{/* #2597 */}
          {line(tr("Strip ratio"), res.stripRatio == null ? "—" : res.stripRatio.toFixed(2), unsampledOre)}
          {line(tr("Pit depth"), `${Math.round(res.maxDepth)} m`)}
          {line(tr("Undiscounted margin"), `$${big(res.money)}`, unsampledOre)}
          {res.beyondFlagged && beyondP > 0 && !unsampledOre && <div style={note}>{tr("{p} % of the ore is in blocks above or below every sample that informs them.", { p: Math.round(beyondP * 100) })}</div>}
          {res.logFilled && logP > 0 && <div style={logP > 0.2 ? warn : note}>{tr("About {p} % of the metal in this pit comes from the readings of the log \"{log}\" × {f} that filled the unsampled metres, not from assays.", { p: Math.round(logP * 100), log: res.logFilled.log || "?", f: res.logFilled.factor ?? "?" })}</div>}{/* #2748 */}
          {res.nearUnsFlagged && nearUnsP > 0 && <div style={nearUnsOre ? warn : note}>{nearUnsOre ? tr("{p} % of this ore is in blocks whose nearest drilling was never sampled: the estimate carried sampled grade across unsampled core, which is unknown, not ore. Drilled metres with no sample can be estimated as barren: 3D Modelling › Estimation, \"Unsampled metres inside a sampled hole\".", { p: Math.round(nearUnsP * 100) }) : tr("{p} % of the ore is in blocks whose nearest drilling was never sampled.", { p: Math.round(nearUnsP * 100) })}</div>}{/* #2596 */}
          {line(tr("Walls stand at"), `${res.walls.flattest.toFixed(0)}–${res.walls.steepest.toFixed(0)}°`)}
          {/* TASKS.csv #1608 — what the drawn pit's block steps make, beside the arc pattern's figure; the separate parts; the depth in blocks */}
          {res.parts?.drawnWalls && line(tr("Walls as drawn (block steps)"), `${res.parts.drawnWalls.flattest.toFixed(0)}–${res.parts.drawnWalls.steepest.toFixed(0)}°`)}
          {res.parts?.drawnWalls?.bySector && res.sectorSlopes && <div style={note}>{tr("By wall as drawn (asked → drawn): {list}.", { list: SECTORS.filter((k) => res.parts.drawnWalls.bySector[k] != null).map((k) => `${k} ${slopeForSector(res.slopeDeg, res.sectorSlopes, k)}→${res.parts.drawnWalls.bySector[k].toFixed(0)}°`).join(", ") })}</div>}
          {res.parts?.pits?.length > 1 && (<>
            {line(tr("Separate pits"), String(res.parts.pits.length))}
            <div style={note}>{tr("The largest holds {p} % of the ore. Ore / waste / strip / depth of each: {list}{more}", { p: Math.round((100 * res.parts.pits[0].oreT) / Math.max(1e-9, res.oreT)), list: res.parts.pits.slice(0, 6).map((p, i) => `${i + 1}: ${big(p.oreT)} t / ${big(p.wasteT)} t / ${p.stripRatio == null ? "—" : p.stripRatio.toFixed(2)} / ${Math.round(p.maxDepth)} m`).join("; "), more: res.parts.pits.length > 6 ? tr("; {n} more", { n: res.parts.pits.length - 6 }) : "" })}</div>
          </>)}
          {res.cell[0] > 20 && <div style={warn}>{tr("Blocks of {c} m are mined all-or-nothing: no selectivity or dilution at a 5–10 m mining unit, and the ore and strip ratio change with the grid alone. A smaller estimate grid over one prospect gives a pit that means something.", { c: Math.round(res.cell[0] * 10) / 10 })}</div>}
          {res.parts?.blocksDeep > 0 && res.parts.blocksDeep < 3 && <div style={warn}>{tr("The pit is {n} block(s) deep: the typed slope cannot be expressed on it, and its walls are block steps.", { n: res.parts.blocksDeep })}</div>}
          {!res.sectorSlopes && (res.walls.steepest - res.slopeDeg > 3 || res.slopeDeg - res.walls.flattest > 3) && <div style={warn}>{tr("The walls stand {f}–{s}° for a typed {a}°: on {c} m cells the arc pattern cannot draw {a}° exactly, so read the attained angles, and compare runs at the angles it can draw.", { f: res.walls.flattest.toFixed(0), s: res.walls.steepest.toFixed(0), a: res.slopeDeg, c: Math.round(res.cell[0] * 10) / 10 })}</div>}{/* #1896 */}
          {res.walls.bySector && res.sectorSlopes && <div style={note}>{tr("By wall: {list} (a wall a little off a sector's centre grades towards its neighbours).", { list: SECTORS.filter((k) => res.walls.bySector[k] != null).map((k) => `${k} ${res.walls.bySector[k].toFixed(0)}°`).join(", ") })}</div>}{/* #1881 */}
          {line(tr("Grid cell"), `${res.cell.map((v) => Math.round(v * 10) / 10).join(" × ")} m`)}
          {line(tr("Solved in"), `${res.seconds} s`)}
          {res.support && res.oreExtrapolatedShare > 0.5 && <div style={warn}>{tr("Most of this ore is in blocks the estimate classed as extrapolated: the pit rests on grades the drilling does not surround.")}</div>}
          <UndergroundOreNote model={model} cutoff={res.cutoff ?? cutoff} />
          {(res.slopeDeg > 65 || res.maxDepth > 500) && <div style={warn}>{tr("Steeper than 65° overall or deeper than 500 m is beyond most open pits: treat it as a sign the body is an underground question.")}</div>}
          {res.densityUsed && <div style={note}>{densityUsedText(res.densityUsed)}</div>}{/* #2647 */}
          {res.limitM != null && <div style={note}>{tr(res.limitedCols ? "Kept within {m} m of the block model: {n} columns of the grid beyond it were not mined." : "Kept within {m} m of the block model; the pit did not need to go beyond it.", { m: res.limitM, n: res.limitedCols })}</div>}{/* #2665 */}
          {res.groundSource === "collars" && <><div style={note}>{tr("The ground is interpolated between the collars, not a terrain.")}</div><CollarLevelsNote collars={collars} /></>}
          {res.groundSource === "model top" && <div style={note}>{tr("The ground is the top of the block model's columns, interpolated between them, not a terrain.")}</div>}{/* #1850 */}
          {res.oreAboveGroundBlocks > 0 && <div style={warn}>{tr("{t} t in {n} ore-grade block(s) sit wholly above the ground and were left out: the estimate was not clipped to the ground (3D Modelling › Estimation, \"Only blocks below the ground\").", { t: big(res.oreAboveGroundT), n: res.oreAboveGroundBlocks })}</div>}{/* #1616 */}
          {res.touchesBase && <div style={warn}>{tr("The pit reaches the bottom of the block model: it may go deeper if the body does.")}</div>}
          {res.touchesEdge && <div style={warn}>{tr("The pit reaches the edge of the grid, so it was cut off there.")}</div>}
          {res.barrenShare > 0.02 && (res.outside?.samples > 0
            ? <div style={warn}>{tr("{p} % of the rock in this pit is outside the block model and counted as barren, and it is drilled: {n} sample(s) ({m} m) in {h} hole(s) lie there, {om} m in {oh} hole(s) at or above the cut-off{list}. Estimate a model that covers the pit before reading its waste and margin.", { p: Math.round(res.barrenShare * 100), n: res.outside.samples.toLocaleString(), m: Math.round(res.outside.metres).toLocaleString(), h: res.outside.holes, om: Math.round(res.outside.oreMetres).toLocaleString(), oh: res.outside.oreHoles, list: res.outside.holeIds.length ? ` (${res.outside.holeIds.slice(0, 3).join(", ")}${res.outside.holeIds.length > 3 ? ", …" : ""})` : "" })}</div>
            : <div style={warn}>{tr("{p} % of the rock in this pit is outside the block model and counted as barren: undrilled rock could hold ore or need a different cost.", { p: Math.round(res.barrenShare * 100) })}</div>)}{/* #2593 — drilled, assayed rock is not 'undrilled' */}
          {res.hasTerrain && res.topAssumed > 0.02 && <div style={warn}>{tr("The terrain does not cover {p} % of the grid; the top of the block model stands in there.", { p: Math.round(res.topAssumed * 100) })}</div>}
          {/* #1610; TASKS.csv #2110 (review #2013, Woodjam) — all three sizes, and the one that changed: on a 10 m model only the bench grew (10 x 10 x 12.5 m)
              and the line said '10 m cells, finer than the block model's 10 m' */}
          {res.coarsened && (Math.abs(res.cell[0] - (res.askedSize || res.modelCellM || res.cell[0])) < 1e-6 && res.modelCellZM && res.cell[2] > res.modelCellZM + 1e-6
            ? <div style={warn}>{tr("The grid's blocks are {s} m: the benches were made taller than the block model's {h} m to stay within the cell limit; the plan cells keep {c} m.", { s: res.cell.map((v) => Math.round(v * 10) / 10).join(" × "), h: Math.round(res.modelCellZM * 10) / 10, c: Math.round(res.cell[0] * 10) / 10 })}</div>
            : <div style={warn}>{tr("The grid was made coarser than the {a} m asked, to stay within the cell limit: {c} m cells, {rel} the block model's {b} m.", { a: res.askedSize || res.modelCellM, c: res.cell.map((v) => Math.round(v * 10) / 10).join(" × "), rel: Math.abs(res.cell[0] - (res.modelCellM || 0)) < 1e-6 ? tr("the same as") : res.cell[0] > (res.modelCellM || 0) ? tr("coarser than") : tr("finer than"), b: res.modelCellM })}</div>)}
          {res.askedSize && !res.coarsened && res.askedSize !== res.cell[0] && <div style={note}>{tr("Cells of {c} m in plan for the {a} m asked; the benches keep the block model's {h} m.", { c: Math.round(res.cell[0] * 10) / 10, a: res.askedSize, h: Math.round(res.cell[2] * 10) / 10 })}</div>}{/* #1854 */}
          {Number(model?.params?.searchRadiusM) > 0 && <div style={note}>{tr("The estimate reaches {r} m from the holes: beyond that the model has no blocks and the pit counts barren rock, so the pit's extent follows the search radius.", { r: Math.round(model.params.searchRadiusM) })}</div>}{/* #1750 */}
          <div style={{ ...note, marginTop: 4 }}>{tr("Conceptual, from your inputs and this block model. It is not a Mineral Reserve or Resource, and the margin is not a value of the project.")}</div>
        </div>
      )}
    </div>
  );
}
const iconBtnStyle = { display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, padding: 0, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }; // #1498
const linkBtn = { background: "none", border: "none", padding: 0, color: "var(--color-accent)", cursor: "pointer", fontSize: "inherit", textDecoration: "underline" };
