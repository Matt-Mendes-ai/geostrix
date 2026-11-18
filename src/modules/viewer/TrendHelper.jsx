// TASKS.csv #3910 (platform redesign P8, design.md section 5) — the trend helper in Model settings: "What should follow the trend?", the candidates
// the project's own data gives (lib/trendCandidates.js: one card each, best first, with its strength, what it rests on and any warning; pointing at a
// card shows it in the 3D view as a see-through disc), "How strongly?" (three stretched balls) and "I know my trend" (the user types the direction
// and the tilt). "Use this trend" writes ONE trend into Model settings' trend store (structuralTrends) and points the chosen tools at it; experts
// keep the trends table below as it is. Every candidate is a suggestion with its reason, never a fact (#264).
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { trendCandidates, trendFromCandidate, withHelperTrend, describeCandidate, candidateNumbers, strengthWord, STRENGTH_RATIOS, planeFromThreePoints, surfaceTrend } from "../../lib/trendCandidates.js"; // planeFromThreePoints, surfaceTrend: #3917
import { trendBasis } from "../../lib/trend.js";
import { gatherTrendData } from "../../lib/trendHelperData.js";
import { colors } from "../../lib/theme.js";
import { t as tr } from "../../lib/i18n.js";
import { useStore } from "../../lib/store.jsx"; // TASKS.csv #3911 — the collars and the CRS, for the regional area
import { fetchAreaBox } from "../../lib/dataExtent.js";
import { regionalArea, regionalGrain, regionalCandidate, regionalNoneText } from "../../lib/regionalGrain.js"; // TASKS.csv #3911

const FOLLOW = [["grade", "The grade model"], ["rock", "One rock or vein"], ["everything", "Everything"]];
const USED = { grade: "The grade shell and the block estimate now use it.", rock: "The geology models, alteration halos and explicit surfaces now use it.", everything: "Every model except faults now uses it." };
const STRENGTHS = [["gentle", "Gentle"], ["medium", "Medium"], ["strong", "Strong"]];

// a stretched ball, drawn (Step 3): 2 to 1, 3 to 1, 5 to 1
const Ball = ({ k, on }) => (
  <svg width="44" height="22" viewBox="0 0 44 22" aria-hidden="true" style={{ display: "block", margin: "0 auto 2px" }}>
    <ellipse cx="22" cy="11" rx="20" ry={20 / k} fill={on ? colors.info : "none"} fillOpacity={on ? 0.35 : 0} stroke={on ? colors.info : colors.textMuted} strokeWidth="1.5" />
  </svg>
);

export default function TrendHelper({ structuralTrends, setStructuralTrends, sceneRef, camState, sampleElements = [], btnStyle, inputStyle, small, explicitClickRef, setExplicitPickFor, worldPointFromHits, ...sources }) { // the click route: #3917
  const [follow, setFollow] = useState("everything");
  const [gradeElement, setGradeElement] = useState(sampleElements[0] || "");
  const [result, setResult] = useState(null); // { candidates, suggestedId, none, noneText }
  const [selId, setSelId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [strength, setStrength] = useState("medium");
  const [typed, setTyped] = useState({ open: false, dipDir: "", dip: "" });
  const [done, setDone] = useState(null);
  const discRef = useRef(null);

  // TASKS.csv #3917 — "I know my trend" three ways: typed, three points clicked in the 3D view (the explicit surface's click route: the view
  // hands its hits to explicitClickRef while explicitPickFor is set), or a modelled or imported surface's best-fit plane
  const [how, setHow] = useState("type"); // "type" | "points" | "surface"
  const [known, setKnown] = useState(null); // the points' or the surface's candidate, or { error }
  const [picks, setPicks] = useState([]);
  const [picking, setPicking] = useState(false);
  const picksRef = useRef([]);
  const stopPicking = () => { if (explicitClickRef) explicitClickRef.current = null; setExplicitPickFor?.(null); setPicking(false); };
  const startPicking = () => {
    if (!explicitClickRef || !worldPointFromHits) return;
    picksRef.current = []; setPicks([]); setKnown(null); setPicking(true);
    setExplicitPickFor?.("trend-helper");
    explicitClickRef.current = (hits, raycaster) => {
      const w = worldPointFromHits(raycaster, hits);
      if (!w) return;
      const next = [...picksRef.current, { x: w.x, y: w.y, z: w.z }];
      picksRef.current = next; setPicks(next);
      if (next.length < 3) return;
      const res = planeFromThreePoints(next);
      setKnown(res); setSelId("typed"); stopPicking();
    };
  };
  useEffect(() => () => stopPicking(), []); // closing the helper stops the picking
  const pickSurface = (id) => {
    const s = (sources.surfaces || []).find((x) => x.id === id);
    if (!s) { setKnown(null); return; }
    setKnown(surfaceTrend(s.name, sources.surfacePoints?.(s.id) || [])); setSelId("typed");
  };
  const typedCand = !typed.open ? null : how !== "type" ? (known && !known.error ? known : null)
    : Number.isFinite(Number(typed.dip)) && Number.isFinite(Number(typed.dipDir)) && typed.dip !== "" && typed.dipDir !== ""
      ? { id: "typed", source: "typed", dip: Math.max(0, Math.min(90, Number(typed.dip))), dipAzimuth: ((Number(typed.dipDir) % 360) + 360) % 360 } : null;
  // TASKS.csv #3911 (redesign P8b) — the regional direction: Macrostrat's published geology around the project, fetched on a click only
  // (the existing tiles.macrostrat.org vector tiles), one more card, direction only, never pre-selected
  const { collars = [], surfaceSamples = [], project } = useStore() || {};
  const [regional, setRegional] = useState(null); // { busy } | { card } | { note, warn }
  const lookRegional = async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setRegional({ note: regionalNoneText(null, { offline: true }), warn: true }); return; }
    const box = fetchAreaBox(collars, surfaceSamples), epsg = project?.epsg;
    if (!box || !epsg) { setRegional({ note: tr("The regional geology needs drill holes and a coordinate system to know where the project is."), warn: true }); return; }
    setRegional({ busy: true });
    try {
      const { toLonLat } = await import("../../lib/reproject.js");
      const ll = await Promise.all([[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].map(([x, y]) => toLonLat(x, y, epsg)));
      if (ll.some((p) => !p)) throw new Error(tr("the project's coordinate system could not be turned into latitude and longitude"));
      const area = regionalArea(ll.reduce((b, p) => [Math.min(b[0], p.lon), Math.min(b[1], p.lat), Math.max(b[2], p.lon), Math.max(b[3], p.lat)], [Infinity, Infinity, -Infinity, -Infinity]));
      const { fetchMacrostratUnitPolygons } = await import("../../lib/macrostratFetch.js");
      const got = await fetchMacrostratUnitPolygons({ bboxLonLat: area });
      const grain = regionalGrain(got.features), card = regionalCandidate(grain);
      setRegional(card ? { card } : { note: regionalNoneText(grain) });
    } catch (e) {
      setRegional({ note: typeof navigator !== "undefined" && navigator.onLine === false ? regionalNoneText(null, { offline: true }) : tr("The regional geology could not be fetched ({error}).", { error: String(e?.message || e) }), warn: true });
    }
  };
  const cands = [...(result?.candidates || []), ...(regional?.card ? [regional.card] : [])];
  const byId = (id) => (id === "typed" ? typedCand : cands.find((c) => c.id === id) || null);
  const chosen = byId(selId);
  const shown = byId(hoverId) || chosen;

  const look = () => {
    const r = trendCandidates(gatherTrendData({ ...sources, gradeElement }));
    setResult(r); setSelId(r.suggestedId); setDone(null);
  };
  const use = () => {
    const t = trendFromCandidate(chosen, strength);
    if (!t) return;
    setStructuralTrends((s) => withHelperTrend(s, t, follow));
    setDone(tr("Trend set: {words}", { words: describeCandidate(chosen) }) + " " + tr(USED[follow]) + " " + tr("Change it or turn it off in the trends list below."));
  };

  // the disc in the 3D view: the candidate pointed at (or the one chosen), see-through, at the centre of the view, a third of the camera distance across
  useEffect(() => {
    const scene = sceneRef?.current; if (!scene) return undefined;
    const clear = () => { if (discRef.current) { scene.remove(discRef.current); discRef.current.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); discRef.current = null; } };
    clear();
    const t = shown ? trendFromCandidate(shown, strength) : null, cs = camState?.current;
    if (!t || !cs?.target) return clear;
    const size = Math.max(10, 0.3 * (cs.radius || 300)), b = trendBasis(t);
    const toScene = (v) => new THREE.Vector3(v.x, v.z, -v.y); // (east, north, up) -> scene
    const basis = new THREE.Matrix4().makeBasis(toScene(b.major), toScene(b.semiMajor), toScene(b.minor));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: colors.info, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    disc.matrixAutoUpdate = false;
    disc.matrix.copy(basis).multiply(new THREE.Matrix4().makeScale(size, size * t.ratios.int / t.ratios.max, 1));
    const rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 64 }, (_, i) => new THREE.Vector3(Math.cos((i / 64) * 2 * Math.PI), Math.sin((i / 64) * 2 * Math.PI), 0))), new THREE.LineBasicMaterial({ color: colors.info }));
    rim.matrixAutoUpdate = false; rim.matrix.copy(disc.matrix);
    const g = new THREE.Group(); g.add(disc, rim); g.position.copy(cs.target);
    g.userData = { tip: `${describeCandidate(shown)}\n${candidateNumbers(shown)}`, trendHelperDisc: true };
    scene.add(g); discRef.current = g;
    return clear;
  }, [shown?.id, shown?.dip, shown?.dipAzimuth, strength, sceneRef, camState]);

  const card = (c) => {
    const on = c.id === selId;
    return (
      <button key={c.id} type="button" data-trend-candidate={c.id} onClick={() => setSelId(c.id)} onMouseEnter={() => setHoverId(c.id)} onMouseLeave={() => setHoverId(null)} onFocus={() => setHoverId(c.id)} onBlur={() => setHoverId(null)}
        aria-pressed={on} style={{ display: "block", width: "100%", textAlign: "start", margin: "4px 0", padding: "6px 8px", borderRadius: 4, cursor: "pointer", background: on ? "var(--color-selected-bg)" : "transparent", border: `1px solid ${on ? "var(--color-info)" : "var(--color-border)"}`, color: "inherit", font: "inherit" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
          <strong>{c.words}</strong>
          {c.suggested && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-info)" }}>{tr("Suggested")}</span>}
        </div>
        <div style={small}>{tr("Strength: {s}", { s: strengthWord(c.strength) })} · {c.numbers}</div>
        <div style={small}>{c.reason}</div>
        {c.agreeText && <div style={{ ...small, color: "var(--color-success-text)" }}>{c.agreeText}</div>}
        {c.warnings.map((w) => <div key={w} style={{ ...small, color: "var(--color-warn-text)" }}>{w}</div>)}
      </button>
    );
  };

  return (
    <div data-trend-helper="" style={{ border: "1px solid var(--color-border)", borderRadius: 4, padding: 8, margin: "6px 0 10px" }}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{tr("Trend helper")}</div>
      <div style={small}>{tr("A trend tells GeoStrix which way the rocks or the grade run, so it joins things along that direction and not into round blobs.")}</div>

      <div style={{ marginTop: 8 }}>{tr("What should follow the trend?")}</div>
      <div role="radiogroup" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {FOLLOW.map(([k, label]) => <label key={k} style={small}><input type="radio" name="trendFollow" checked={follow === k} onChange={() => setFollow(k)} /> {tr(label)}</label>)}
      </div>
      {sampleElements.length > 1 && (
        <label style={{ ...small, display: "block", marginTop: 4 }}>{tr("Grade to look at")} <select value={gradeElement} onChange={(e) => setGradeElement(e.target.value)} style={inputStyle}>{sampleElements.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      )}
      <button type="button" style={{ ...btnStyle, marginTop: 6 }} onClick={look}>{result ? tr("Look again") : tr("Look at my data")}</button>

      {result && (<>
        <div style={{ marginTop: 8 }}>{tr("Here is what your data says.")}</div>
        {result.none && <div style={{ ...small, margin: "4px 0" }}>{result.noneText}</div>}
        {cands.map(card)}
        {!regional?.card && (
          <div data-trend-regional="" style={{ margin: "6px 0" }}>
            <button type="button" style={btnStyle} disabled={!!regional?.busy} onClick={lookRegional}>{regional?.busy ? tr("Looking…") : tr("Look at the regional geology")}</button>
            <div style={small}>{tr("Sends the area around the project to Macrostrat (macrostrat.org) for its published geology map, and reads the direction the mapped contacts run: a regional direction only, not a dip.")}</div>
            {regional?.note && <div role="status" style={{ ...small, color: regional.warn ? "var(--color-warn-text)" : undefined }}>{regional.note}</div>}
          </div>
        )}
        {cands.length > 0 && <div style={small}>{tr("Point at a card to see it as a disc in the 3D view. These are suggestions from your data, not facts: check them against what you know.")}</div>}
      </>)}

      <details open={typed.open} onToggle={(e) => { const open = e.currentTarget.open; setTyped((p) => ({ ...p, open })); if (open) setSelId("typed"); else stopPicking(); }} style={{ marginTop: 6 }}>
        <summary style={{ cursor: "pointer" }}>{tr("I know my trend")}</summary>
        <div role="radiogroup" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
          {[["type", "Type it"], ["points", "Click three points in the 3D view"], ["surface", "Pick a surface"]].map(([k, label]) => (
            <label key={k} style={small}><input type="radio" name="trendKnownHow" checked={how === k} onChange={() => { setHow(k); setKnown(null); stopPicking(); setSelId("typed"); }} /> {tr(label)}</label>
          ))}
        </div>
        {how === "points" && (
          <div data-trend-points="" style={{ marginTop: 4 }}>
            {picking
              ? <div style={small}>{tr("Click point {n} of 3 on the drilling, a surface or the ground.", { n: picks.length + 1 })} <button type="button" style={btnStyle} onClick={stopPicking}>{tr("Cancel")}</button></div>
              : <button type="button" style={btnStyle} disabled={!explicitClickRef || !worldPointFromHits} onClick={startPicking}>{picks.length ? tr("Click three new points") : tr("Click three points")}</button>}
          </div>
        )}
        {how === "surface" && (
          <label style={{ ...small, display: "block", marginTop: 4 }}>{tr("Surface")} <select data-trend-surface="" defaultValue="" onChange={(e) => pickSurface(e.target.value)} style={inputStyle}>
            <option value="">{(sources.surfaces || []).length ? tr("Choose one…") : tr("No surfaces in the project yet")}</option>
            {(sources.surfaces || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></label>
        )}
        {how !== "type" && known?.error && <div role="status" style={{ ...small, color: "var(--color-warn-text)" }}>{known.error}</div>}
        {how !== "type" && typedCand && (
          <div role="status" style={small} onMouseEnter={() => setHoverId("typed")} onMouseLeave={() => setHoverId(null)}>
            {typedCand.words} · {typedCand.numbers}{typedCand.strength ? ` · ${tr("Strength: {s}", { s: strengthWord(typedCand.strength) })}` : ""}
            {typedCand.spread && <div>{typedCand.reason} {typedCand.spread}</div>}
            {typedCand.note && <div>{typedCand.note}</div>}
          </div>
        )}
        {how === "type" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          <label style={small}>{tr("Tilts towards (°, dip direction)")} <input type="number" min="0" max="360" value={typed.dipDir} onChange={(e) => { setTyped((p) => ({ ...p, dipDir: e.target.value })); setSelId("typed"); }} style={{ ...inputStyle, width: 64 }} /></label>
          <label style={small}>{tr("Tilt (°, dip)")} <input type="number" min="0" max="90" value={typed.dip} onChange={(e) => { setTyped((p) => ({ ...p, dip: e.target.value })); setSelId("typed"); }} style={{ ...inputStyle, width: 56 }} /></label>
        </div>}
        {how === "type" && typedCand && <div style={small} onMouseEnter={() => setHoverId("typed")} onMouseLeave={() => setHoverId(null)}>{describeCandidate(typedCand)} · {candidateNumbers(typedCand)}</div>}
      </details>

      {chosen && (<>
        <div style={{ marginTop: 8 }}>{tr("How strongly?")}</div>
        <div role="radiogroup" style={{ display: "flex", gap: 6 }}>
          {STRENGTHS.map(([k, label]) => (
            <label key={k} style={{ ...small, flex: 1, textAlign: "center", cursor: "pointer", padding: 2, border: `1px solid ${strength === k ? "var(--color-info)" : "var(--color-border)"}`, borderRadius: 4 }}>
              <input type="radio" name="trendStrength" checked={strength === k} onChange={() => setStrength(k)} style={{ position: "absolute", opacity: 0, pointerEvents: "none" }} />
              <Ball k={STRENGTH_RATIOS[k]} on={strength === k} />
              {tr(label)} ({tr("{k} to 1", { k: STRENGTH_RATIOS[k] })})
            </label>
          ))}
        </div>
        <button type="button" style={{ ...btnStyle, marginTop: 6 }} onClick={use} data-trend-use="">{tr("Use this trend")}</button>
      </>)}
      {done && <div role="status" style={{ ...small, marginTop: 4 }}>{done}</div>}
    </div>
  );
}
