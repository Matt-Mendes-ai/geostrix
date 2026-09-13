// TASKS.csv #318 — "use [surface mapping data] to project surface geology underground" (Matt).
//
// 3D Modeling sidebar section with two ways to take a mapped contact below the ground:
//   1. Dip projection — sweep the draped contact trace down-dip to a chosen depth as a surface, the dip
//      at each point along the trace taken from the nearest outcrop measurements of chosen types (or a
//      typed dip/dip direction where there are none). No sidecar needed; works before any drilling.
//   2. Implicit-model constraint — hand the same draped trace (as interface points) and the nearby
//      outcrop measurements (as orientations) to the existing GemPy "Top of unit" run alongside the
//      drillhole contacts. ViewerModule's gatherLithoSurfaceSpec does the feeding; this component only
//      owns the choice of layer/contact/measurement types, passed up as `mapConstraint`.
//
// Which mapped contact corresponds to which drillhole surface is the geologist's call (a map unit's
// polygon boundary is both its top and its base), so the user picks one unit PAIR explicitly — nothing is
// matched by name.
import React, { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import InfoButton from "./InfoButton.jsx";
import { extractMapContacts, STRUCTURE_CLASS_LABELS } from "../lib/mapLayers.js";

const DEFAULT_CLASSES = ["bedding", "foliation", "contact", "cleavage"];

export default function SurfaceGeologyProjection({ mapLayers, surfaceStructures, terrain, pBtn, onProject, mapConstraint, setMapConstraint, busy }) {
  const polygonLayers = mapLayers.filter((l) => l.geomType === "polygon" && l.styleField);
  const [layerId, setLayerId] = useState("");
  const [contactKey, setContactKey] = useState("");
  const [classes, setClasses] = useState(DEFAULT_CLASSES);
  const [radius, setRadius] = useState(500);
  const [depth, setDepth] = useState(300);
  const [manualDip, setManualDip] = useState(60);
  const [manualDipDir, setManualDipDir] = useState(90);
  const [tolerance, setTolerance] = useState(2);

  const layer = polygonLayers.find((l) => l.id === layerId) || polygonLayers[0] || null;
  // Contacts depend on geometry + colour-by field only, not on colours or visibility — keyed so a
  // legend colour edit doesn't re-run the extraction (~0.1 s on a 100-polygon map).
  const contactsResult = useMemo(() => {
    if (!layer) return null;
    return extractMapContacts(layer, layer.styleField, { tolerance, spacing: 5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer?.id, layer?.features, layer?.styleField, tolerance]);
  const contacts = contactsResult?.contacts || [];
  const contact = contacts.find((c) => c.key === contactKey) || contacts[0] || null;
  const labelFor = (v) => layer?.categories?.find((c) => c.value === v)?.label || (v == null ? "(no value)" : v);

  const allRows = surfaceStructures.flatMap((s) => s.rows || []);
  const classCounts = {};
  allRows.forEach((r) => { classCounts[r.cls] = (classCounts[r.cls] || 0) + 1; });
  const chosenRows = allRows.filter((r) => classes.includes(r.cls));

  const settings = () => ({
    layerId: layer?.id, contactKey: contact?.key, units: contact?.units, classes, radius: Number(radius) || 500,
    depth: Number(depth) || 300, manualDip: Number(manualDip), manualDipDir: Number(manualDipDir), tolerance: Number(tolerance) || 2,
  });
  const constraintOn = !!mapConstraint && mapConstraint.layerId === layer?.id && mapConstraint.contactKey === contact?.key;
  // While this contact is the active implicit-model constraint, keep it in step with the controls — a
  // ticked box that silently kept the measurement types/radius from when it was ticked would be a trap.
  useEffect(() => {
    if (constraintOn) setMapConstraint(settings());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [constraintOn, classes, radius, tolerance, manualDip, manualDipDir]);

  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
  const sel = { width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 7px", color: "var(--color-text)", fontSize: "var(--font-size-sm)", marginBottom: 6 };
  const num = { width: 64, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" };
  const row = { display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };

  return (
    <>
      <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 5 }}>
        Project surface geology
        <InfoButton title="Project surface geology" width={400} text={"Takes a mapped contact between two units on an imported geology map (Geophysics → Map layers) below the ground.\n\nProject to depth: the contact trace is draped on the terrain and swept down-dip to the depth you set. Along the trace, the dip comes from the outcrop measurements (Surface structures) of the types ticked below within the search radius, inverse-distance weighted; where none are in range the typed dip/dip direction is used. Depth is vertical depth below the outcrop, so a shallow dip reaches further sideways.\n\nUse in implicit model: adds the draped trace as interface points, and the nearby measurements as orientations, to the next \"Implicit model\" run below — so a surface fitted to drillhole contacts also honours where the contact crops out.\n\nContacts are found where two different units' boundaries lie within the snap tolerance of each other (or one polygon lies inside another, e.g. a dyke drawn over its host). The edge of the mapped area is never treated as a contact."} />
      </div>
      {!polygonLayers.length ? (
        <div style={{ ...small, marginBottom: 10 }}>Import a polygon geology map in Geophysics → Map layers to project its contacts underground.</div>
      ) : (
        <>
          <select value={layer?.id || ""} onChange={(e) => { setLayerId(e.target.value); setContactKey(""); }} style={sel}>
            {polygonLayers.map((l) => <option key={l.id} value={l.id}>{l.name} (by {l.styleField})</option>)}
          </select>
          <select value={contact?.key || ""} onChange={(e) => setContactKey(e.target.value)} style={sel} disabled={!contacts.length}>
            {!contacts.length && <option value="">No contacts found between different units</option>}
            {contacts.map((c) => (
              <option key={c.key} value={c.key}>{labelFor(c.units[0])} | {labelFor(c.units[1])} — {c.lengthM >= 1000 ? `${(c.lengthM / 1000).toFixed(1)} km` : `${Math.round(c.lengthM)} m`}</option>
            ))}
          </select>
          <div style={row} title="How close two units' boundaries must be to count as touching. Hand-digitized maps rarely share vertices exactly.">
            Snap tolerance <input type="number" min={0.1} step={0.5} value={tolerance} onChange={(e) => setTolerance(e.target.value)} style={num} /> m
          </div>

          <div style={{ ...small, marginBottom: 4 }}>Dip from outcrop measurements of type:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {Object.keys(STRUCTURE_CLASS_LABELS).filter((k) => classCounts[k]).map((k) => {
              const on = classes.includes(k);
              return (
                <span key={k} onClick={() => setClasses((p) => (on ? p.filter((x) => x !== k) : [...p, k]))}
                  style={{ fontSize: "var(--font-size-sm)", padding: "2px 7px", borderRadius: 10, cursor: "pointer", userSelect: "none", background: on ? "var(--color-success-bg)" : "var(--color-bg)", color: on ? "var(--color-success-text)" : "var(--color-text-secondary)", border: `1px solid ${on ? "var(--color-success-border)" : "var(--color-border)"}` }}>
                  {STRUCTURE_CLASS_LABELS[k]} {classCounts[k]}
                </span>
              );
            })}
            {!allRows.length && <span style={small}>No surface structures imported — the typed dip below is used everywhere.</span>}
          </div>
          <div style={row}>
            Search radius <input type="number" min={10} step={50} value={radius} onChange={(e) => setRadius(e.target.value)} style={num} /> m
          </div>
          <div style={row} title="Used wherever no chosen measurement lies within the search radius">
            Otherwise dip <input type="number" min={10} max={90} value={manualDip} onChange={(e) => setManualDip(e.target.value)} style={{ ...num, width: 46 }} />° toward <input type="number" min={0} max={359} value={manualDipDir} onChange={(e) => setManualDipDir(e.target.value)} style={{ ...num, width: 52 }} />°
          </div>
          <div style={row}>
            Depth below surface <input type="number" min={10} step={50} value={depth} onChange={(e) => setDepth(e.target.value)} style={num} /> m
          </div>
          <button
            onClick={() => onProject(settings(), contact, layer, chosenRows)}
            disabled={!contact || !terrain || busy}
            style={{ ...pBtn, marginBottom: 6, opacity: contact && terrain && !busy ? 1 : 0.5, cursor: contact && terrain && !busy ? "pointer" : "default" }}
            title={terrain ? "Build a surface by sweeping this contact down-dip" : "Needs a terrain surface to drape the contact trace on (Geophysics → Terrain)"}
          ><ArrowDownToLine size={14} /> Project contact to depth</button>
          <label style={{ ...row, cursor: contact && terrain ? "pointer" : "default", opacity: contact && terrain ? 1 : 0.5 }}
            title="Adds this contact's draped trace as interface points and the chosen nearby measurements as orientations to the next single-unit Implicit model run below">
            <input type="checkbox" checked={constraintOn} disabled={!contact || !terrain}
              onChange={(e) => setMapConstraint(e.target.checked ? settings() : null)} />
            Use this contact in the next implicit model run
          </label>
          {mapConstraint && !constraintOn && (
            <div style={{ ...small, marginBottom: 6 }}>A different mapped contact ({mapConstraint.units?.map(labelFor).join(" | ")}) is currently set for the implicit model.</div>
          )}
          {!terrain && <div style={{ ...small, marginBottom: 8 }}>Load a terrain surface first — the contact's elevation comes from draping it on the DTM.</div>}
        </>
      )}
    </>
  );
}
