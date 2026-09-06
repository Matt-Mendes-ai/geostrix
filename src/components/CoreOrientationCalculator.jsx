import React, { useMemo, useState } from "react";
import { X, Plus, Trash2, Save } from "lucide-react";
import { holeDirection, referenceLine, solveUnoriented } from "../lib/coreOrientation.js";
import { surveyAzimuthDipAt } from "../lib/desurvey.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";

// User request: "we need to find a way to calculate the beta angle for non-oriented drilling based on
// field structural measurements." Core-logging reality: alpha (the acute angle between the core axis
// and a structure) is directly measurable on non-oriented core, but beta (the structure's rotational
// position around the core) is only measurable against an arbitrary scribed line — with no true
// reference, the structure's real dip/dip-direction can't be recovered on its own. The standard fix
// (the "alpha-beta method"): if a structure with an INDEPENDENTLY KNOWN true attitude (a field/outcrop
// reading) is also measured (alpha+beta, against that same arbitrary line) on the same core run, that
// pair solves for the core's unknown rotational offset, which then applies to any other structure
// measured on that run. All math lives in coreOrientation.js (derived + numerically verified there —
// round-trip forward/inverse, degenerate cases, and a full simulated calibration workflow all pass);
// this component is purely the form around it. Modeled on StereonetModal.jsx's own shape.
export default function CoreOrientationCalculator({ collars, survey, fieldStructuralRefs, addFieldRef, removeFieldRef, onSaveStructurePick, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();

  const [holeId, setHoleId] = useState("");
  const [depth, setDepth] = useState("");
  const [azimuth, setAzimuth] = useState("");
  const [dip, setDip] = useState("");
  const [useTop, setUseTop] = useState(false); // Matt: bottom-of-hole is the default reference line, not top

  const [selectedRefId, setSelectedRefId] = useState("");
  const [knownDipDir, setKnownDipDir] = useState("");
  const [knownDip, setKnownDip] = useState("");
  const [refAlpha, setRefAlpha] = useState("");
  const [refBeta, setRefBeta] = useState("");
  const [unkAlpha, setUnkAlpha] = useState("");
  const [unkBeta, setUnkBeta] = useState("");
  const [unkLabel, setUnkLabel] = useState("");

  const [newRefLabel, setNewRefLabel] = useState("");
  const [newRefDipDir, setNewRefDipDir] = useState("");
  const [newRefDip, setNewRefDip] = useState("");

  // Auto-fill hole azimuth/dip at the chosen depth from the survey, but leave the fields editable
  // (a planned hole, or one with no survey data yet, still needs manual entry to work at all).
  const autoFillFromHole = (hId, d) => {
    const c = collars.find((c) => c.hole_id === hId);
    if (!c || d === "" || isNaN(Number(d))) return;
    const hs = (survey || []).filter((s) => s.hole_id === hId && !isNaN(s.depth));
    const r = surveyAzimuthDipAt(c, hs, Number(d));
    if (r) { setAzimuth(String(r.azimuth.toFixed(1))); setDip(String(r.dip.toFixed(1))); }
  };

  const pickRef = (id) => {
    setSelectedRefId(id);
    const ref = fieldStructuralRefs.find((r) => r.id === id);
    if (ref) { setKnownDipDir(String(ref.dipDirDeg)); setKnownDip(String(ref.dipDeg)); }
  };

  const result = useMemo(() => {
    // Bug caught in live testing: checking the NUMBER-converted values for "" is always false
    // (Number("") === 0, not ""), so an untouched blank field silently read as 0 instead of blocking
    // the calculation — the raw string inputs must be checked for emptiness before converting.
    const raw = [azimuth, dip, knownDipDir, knownDip, refAlpha, refBeta, unkAlpha, unkBeta];
    if (raw.some((v) => v === "")) return null;
    const azN = Number(azimuth), dipN = Number(dip);
    const kddN = Number(knownDipDir), kdN = Number(knownDip);
    const raN = Number(refAlpha), rbN = Number(refBeta);
    const uaN = Number(unkAlpha), ubN = Number(unkBeta);
    if ([azN, dipN, kddN, kdN, raN, rbN, uaN, ubN].some((v) => isNaN(v))) return null;
    const d = holeDirection(azN, dipN);
    const r = referenceLine(d, useTop);
    if (!r) return { error: "This hole is within ~2.6° of vertical — a bottom-of-hole/top-of-hole reference line isn't physically defined (the same real-world limit an actual core-orientation tool would hit)." };
    const res = solveUnoriented({ holeDir: d, refLine: r, knownDipDirDeg: kddN, knownDipDeg: kdN, refAlphaDeg: raN, refBetaDeg: rbN, unkAlphaDeg: uaN, unkBetaDeg: ubN });
    if (!res.ok) return { error: res.reason };
    return res;
  }, [azimuth, dip, useTop, knownDipDir, knownDip, refAlpha, refBeta, unkAlpha, unkBeta]);

  const canSave = result && !result.error && holeId && depth !== "" && !isNaN(Number(depth));
  const save = () => {
    if (!canSave) return;
    onSaveStructurePick({
      hole_id: holeId, depth: Number(depth), value: unkLabel || "(unnamed)",
      dip: Number(result.dipDeg.toFixed(2)), azimuth: Number(result.dipDirDeg.toFixed(2)),
      _src: "Core orientation calculator",
    });
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)" }}>Core orientation calculator (alpha-beta method)</div>
          <X size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.5, marginBottom: 12 }}>
          Recovers a non-oriented structure's true dip/dip-direction by calibrating against a second
          structure on the same core run whose true attitude you already know from a field/outcrop
          reading — alpha and beta for both are measured on the core against the SAME arbitrary scribed
          line, exactly as logged.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div className="ge-section-label">Hole & reference line</div>
            <div style={row}>
              <select value={holeId} onChange={(e) => { setHoleId(e.target.value); autoFillFromHole(e.target.value, depth); }} style={sel}>
                <option value="">Manual entry (no hole)</option>
                {collars.map((c) => <option key={c.hole_id} value={c.hole_id}>{c.hole_id}</option>)}
              </select>
              <input type="number" placeholder="Depth (m)" value={depth} onChange={(e) => { setDepth(e.target.value); if (holeId) autoFillFromHole(holeId, e.target.value); }} style={{ ...num, width: 90 }} />
            </div>
            <div style={row}>
              <input type="number" placeholder="Hole azimuth (°)" value={azimuth} onChange={(e) => setAzimuth(e.target.value)} style={num} />
              <input type="number" placeholder="Hole dip below horiz. (0-90°)" value={dip} onChange={(e) => setDip(e.target.value)} style={num} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginTop: 4 }}>
              <input type="checkbox" checked={useTop} onChange={(e) => setUseTop(e.target.checked)} />
              Use top-of-hole reference line (default: bottom-of-hole)
            </label>

            <div className="ge-section-label" style={{ marginTop: 14 }}>Reference structure (known true attitude)</div>
            <div style={row}>
              <select value={selectedRefId} onChange={(e) => pickRef(e.target.value)} style={sel}>
                <option value="">Ad hoc (enter below)</option>
                {fieldStructuralRefs.map((r) => <option key={r.id} value={r.id}>{r.label || "(unlabeled)"} — {r.dipDirDeg}°/{r.dipDeg}°</option>)}
              </select>
            </div>
            <div style={row}>
              <input type="number" placeholder="Known dip-dir (°)" value={knownDipDir} onChange={(e) => { setKnownDipDir(e.target.value); setSelectedRefId(""); }} style={num} />
              <input type="number" placeholder="Known dip (°)" value={knownDip} onChange={(e) => { setKnownDip(e.target.value); setSelectedRefId(""); }} style={num} />
            </div>
            <div style={row}>
              <input type="number" placeholder="Measured alpha (°)" value={refAlpha} onChange={(e) => setRefAlpha(e.target.value)} style={num} />
              <input type="number" placeholder="Measured beta (°)" value={refBeta} onChange={(e) => setRefBeta(e.target.value)} style={num} />
            </div>

            <div className="ge-section-label" style={{ marginTop: 14 }}>Unknown structure</div>
            <div style={row}>
              <input placeholder="Label (e.g. Vein, Fault)" value={unkLabel} onChange={(e) => setUnkLabel(e.target.value)} style={sel} />
            </div>
            <div style={row}>
              <input type="number" placeholder="Measured alpha (°)" value={unkAlpha} onChange={(e) => setUnkAlpha(e.target.value)} style={num} />
              <input type="number" placeholder="Measured beta (°)" value={unkBeta} onChange={(e) => setUnkBeta(e.target.value)} style={num} />
            </div>
          </div>

          <div>
            <div className="ge-section-label">Result</div>
            {!result && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>Fill in every field on the left to solve.</div>}
            {result?.error && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-danger-solid)", lineHeight: 1.5 }}>{result.error}</div>}
            {result && !result.error && (
              <div style={{ background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "9px 10px", fontSize: "var(--font-size-base)", color: "var(--color-text)", lineHeight: 1.6 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{unkLabel || "Unknown structure"}: true dip {result.dipDeg.toFixed(1)}° / dip-dir {result.dipDirDeg.toFixed(1)}°</div>
                <div style={{ color: result.alphaDiscrepancyDeg > 5 ? "var(--color-danger-solid)" : "var(--color-text-secondary)" }}>
                  Alpha check: reference structure's on-core alpha vs. what its known attitude implies —
                  off by {result.alphaDiscrepancyDeg.toFixed(1)}°{result.alphaDiscrepancyDeg > 5 ? " (large — is this really the same structure logged in the field?)" : ""}
                </div>
                {(result.refNearPerpendicular || result.unkNearPerpendicular) && (
                  <div style={{ color: "#c9962b", marginTop: 4 }}>
                    One structure is within ~5° of perpendicular to the hole axis — beta (and therefore
                    this result) is only weakly constrained here.
                  </div>
                )}
                <button onClick={save} disabled={!canSave} style={{ ...saveBtn, marginTop: 8, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "default" }}
                  title={canSave ? "" : "Pick a hole and depth (not manual entry) to save"}>
                  <Save size={12} /> Save as Structure pick
                </button>
              </div>
            )}

            <div className="ge-section-label" style={{ marginTop: 16 }}>Field reference library</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 110, overflowY: "auto", marginBottom: 6 }}>
              {fieldStructuralRefs.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label || "(unlabeled)"} — {r.dipDirDeg}°/{r.dipDeg}°{r.notes ? ` · ${r.notes}` : ""}</span>
                  <Trash2 size={12} style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => removeFieldRef(r.id)} />
                </div>
              ))}
              {!fieldStructuralRefs.length && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>No saved field measurements yet.</div>}
            </div>
            <div style={row}>
              <input placeholder="Label (e.g. Regional bedding)" value={newRefLabel} onChange={(e) => setNewRefLabel(e.target.value)} style={sel} />
            </div>
            <div style={row}>
              <input type="number" placeholder="Dip-dir (°)" value={newRefDipDir} onChange={(e) => setNewRefDipDir(e.target.value)} style={num} />
              <input type="number" placeholder="Dip (°)" value={newRefDip} onChange={(e) => setNewRefDip(e.target.value)} style={num} />
              <button
                onClick={() => {
                  if (newRefDipDir === "" || newRefDip === "" || isNaN(Number(newRefDipDir)) || isNaN(Number(newRefDip))) return;
                  addFieldRef({ label: newRefLabel, dipDirDeg: Number(newRefDipDir), dipDeg: Number(newRefDip) });
                  setNewRefLabel(""); setNewRefDipDir(""); setNewRefDip("");
                }}
                style={{ ...saveBtn, padding: "6px 8px" }}
              ><Plus size={12} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(20,24,30,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { width: 720, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.3)", maxHeight: "85vh", overflowY: "auto" };
const row = { display: "flex", gap: 6, marginBottom: 6 };
const sel = { flex: 1, minWidth: 0, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" };
const num = { flex: 1, minWidth: 0, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" };
const saveBtn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: "1px solid var(--color-selected-border)", background: "var(--color-selected-bg)", color: "var(--color-primary)", borderRadius: 5, fontSize: "var(--font-size-sm)", padding: "6px 10px" };
