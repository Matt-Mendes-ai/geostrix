import React, { useMemo, useState } from "react";
import { X, Download, Ruler } from "lucide-react";
import { buildMeshQuery, isMeshClosed, signedDistanceToMesh, intervalsInsideMesh, holeDistanceToMesh } from "../lib/meshQuery.js";
import { saveFile } from "../lib/desktop.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";

// TASKS.csv #146 — DISTANCE-TO-SURFACE / POINT-IN-DOMAIN QUERY AND REPORTING.
//
// Leapfrog-specialist audit finding: domain classification (#89) already existed INTERNALLY — it is
// what filterRowsByDomain/pointInDomain use to decide which control points feed an implicit surface —
// but a user could never ask it a question directly. There was no way to get "how far is this hole
// from surface X" or "how many metres of hole Y sit inside domain Z" out of the app, even though the
// geometry to answer both was already sitting in the scene. That is a QC gap first (a modelled shell
// that no hole actually intersects is usually a mistake, and you cannot see that by orbiting) and a
// reporting gap second (intercept metres per domain is the raw material of any
// resource-classification-style summary once #140's volumetrics exist).
//
// WHAT IT ANSWERS
//   * HOLES tab — every hole against one surface: closest approach (m) and the MD it occurs at, the
//     MDs where the hole pierces the surface, and, for a CLOSED surface, the downhole metres inside.
//   * POINT tab — one real-world XYZ against one surface: distance, and inside/outside with a sign.
//
// The geometry lives in src/lib/meshQuery.js, deliberately separate and dependency-free so it could be
// verified in Node against analytic ground truth (sphere/box) BEFORE any of this UI existed — see the
// TASKS.csv #146 notes for the numbers, including the two real bugs that verification caught.
//
// WATERTIGHTNESS IS NOT ASSUMED, IT IS CHECKED AND REPORTED. "Inside" is meaningless for an open
// surface — a draped stratigraphic contact, a fault plane, or a shell clipped against a modelling
// domain (runSurfaceStack drops triangles with vertices outside the domain, which punches holes in an
// otherwise-closed mesh). For those, this tool shows distance and pierce points and says plainly that
// metres-inside is not answerable, rather than printing a confident number from a parity test that has
// no defined answer. Same honesty principle as computeMeshVolume's openEdgeCount (#140).
//
// COORDINATES: meshes and hole traces are both taken in SCENE space, which this app keeps in real
// metres (see meshExport.js's header on why the scene<->world map is a rigid motion), so every distance
// printed here is already a real-world metre. Only the point-query input/output is converted to world
// coordinates, because that is what a user reads off a map.
export default function SurfaceQueryModal({ surfaces = [], traces = [], sceneToWorld, worldToScene, onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238

  const [surfaceId, setSurfaceId] = useState(() => surfaces[0]?.id || "");
  const [tab, setTab] = useState("holes");
  // Closest-approach is swept at this spacing along the trace. It bounds ONLY that number's precision;
  // pierce depths and metres-inside are exact intersections and do not depend on it at all. Default 2 m
  // because performance is priority #1 here and a whole-project sweep is step-proportional: 0.5 m is
  // four times the work for a QC number nobody reads to the centimetre.
  const [step, setStep] = useState(2);
  const [ptX, setPtX] = useState("");
  const [ptY, setPtY] = useState("");
  const [ptZ, setPtZ] = useState("");

  const surface = surfaces.find((s) => s.id === surfaceId) || surfaces[0] || null;

  // One BVH per surface, rebuilt only when the surface selection changes. Building over ~100k triangles
  // costs a few hundred ms; every query afterwards is a log-time tree descent, which is what makes the
  // whole-project sweep below finish instead of locking the UI.
  const mesh = useMemo(() => {
    if (!surface?.positions || !surface?.indices) return null;
    const q = buildMeshQuery(surface.positions, surface.indices);
    if (!q) return null;
    return { q, ...isMeshClosed(surface.positions, surface.indices) };
  }, [surface]);

  const rows = useMemo(() => {
    if (!mesh || tab !== "holes") return [];
    return traces
      .filter((t) => t.pts && t.pts.length > 1)
      .map((t) => {
        const hd = holeDistanceToMesh(mesh.q, t.pts, { step });
        const iv = mesh.closed ? intervalsInsideMesh(mesh.q, t.pts) : null;
        // A TANGENTIAL TOUCH is a real thing on real data and needs saying, not hiding: a hole can
        // clip the surface exactly along a triangle edge, entering and leaving at the same depth. It
        // is a genuine pierce point but encloses no downhole metres, so without a label the row reads
        // as a contradiction ("1 pierce point, 0 m inside") and looks like a bug. Verified live on the
        // Harry property QSP halo: 17HR-270 @ 369.20 m and 17HR-285 @ 174.76 m both do exactly this
        // (closest approach 0.18 m, two bit-identical intersections), while 17HR-272 and 17HR-292 have
        // genuinely distinct entry/exit pairs 0.24 m and 0.20 m apart and are correctly NOT labelled.
        // Detected exactly, not guessed: intervalsInsideMesh merges same-classification neighbours, so
        // a crossing that is not an interval boundary did not change the hole's inside/outside state.
        const bounds = iv ? iv.intervals.map((x) => x.to) : [];
        const intercepts = (hd ? hd.intercepts : []).map((c) => ({
          ...c, tangential: iv ? !bounds.some((b) => Math.abs(b - c.md) < 1e-6) : false,
        }));
        return {
          hole_id: t.hole_id,
          minDistance: hd ? hd.minDistance : null,
          atMd: hd ? hd.atMd : null,
          intercepts,
          insideLength: iv ? iv.insideLength : null,
          insideIntervals: iv ? iv.intervals.filter((x) => x.inside) : [],
          totalLength: t.pts[t.pts.length - 1].md,
        };
      })
      .sort((a, b) => (a.minDistance ?? Infinity) - (b.minDistance ?? Infinity));
  }, [mesh, traces, step, tab]);

  const totals = useMemo(() => ({
    holes: rows.length,
    piercing: rows.filter((r) => r.intercepts.length > 0).length,
    inside: rows.reduce((s, r) => s + (r.insideLength || 0), 0),
  }), [rows]);

  // POINT tab. Input is real-world easting/northing/elevation — the numbers on a collar sheet — and is
  // converted into scene space to be queried, so the user never has to know the internal frame exists.
  const pointResult = useMemo(() => {
    if (!mesh || tab !== "point") return null;
    const x = Number(ptX), y = Number(ptY), z = Number(ptZ);
    if (![x, y, z].every((v) => Number.isFinite(v))) return null;
    const sp = worldToScene ? worldToScene({ x, y, z }) : { x, y, z };
    const r = signedDistanceToMesh(mesh.q, sp, mesh.closed);
    if (!r) return null;
    return { ...r, worldNearest: sceneToWorld ? sceneToWorld(r.point) : r.point };
  }, [mesh, tab, ptX, ptY, ptZ, worldToScene, sceneToWorld]);

  const exportCsv = () => {
    const head = ["hole_id", "surface", "closest_approach_m", "closest_approach_md_m", "n_pierce_points", "pierce_mds_m", "metres_inside", "hole_length_m", "surface_watertight"];
    const lines = [head.join(",")];
    rows.forEach((r) => lines.push([
      r.hole_id,
      `"${(surface?.name || "").replace(/"/g, '""')}"`,
      r.minDistance != null ? r.minDistance.toFixed(3) : "",
      r.atMd != null ? r.atMd.toFixed(2) : "",
      r.intercepts.length,
      `"${r.intercepts.map((i) => i.md.toFixed(2)).join(" ")}"`,
      r.insideLength != null ? r.insideLength.toFixed(2) : "",
      r.totalLength != null ? r.totalLength.toFixed(2) : "",
      mesh?.closed ? "yes" : "no",
    ].join(",")));
    saveFile({
      suggestedName: `surface_query_${(surface?.name || "surface").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
      content: lines.join("\n"), encoding: "text",
    });
  };

  const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 7 }}>
            <Ruler size={15} /> Distance to surface / point-in-domain
          </div>
          <X size={16} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        {!surfaces.length ? (
          <div style={{ padding: "28px 8px", fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6, maxWidth: 520 }}>
            No generated surfaces to query yet. Build one with the implicit-modelling tools on the
            Modeling tab (a lithology contact, an alteration or grade shell, a fault) and it will appear
            in this list.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 10, flexWrap: "wrap" }}>
              <label style={rowLabel}>
                Surface
                <select value={surface?.id || ""} onChange={(e) => setSurfaceId(e.target.value)} style={{ ...sel, minWidth: 210 }}>
                  {surfaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <div style={{ display: "flex", gap: 0, border: "1px solid var(--color-border)", borderRadius: 6, overflow: "hidden" }}>
                {[["holes", "Holes"], ["point", "Point"]].map(([k, label]) => (
                  <button key={k} onClick={() => setTab(k)} style={{ ...tabBtn, background: tab === k ? "#e8eef8" : "transparent", color: tab === k ? "#1a4a9c" : "var(--color-text-secondary)" }}>{label}</button>
                ))}
              </div>
              {tab === "holes" && (
                <label style={rowLabel} title="Spacing of the closest-approach sweep along each trace. It bounds only that one number's precision — pierce depths and metres-inside are exact intersections and are unaffected. Coarser is faster.">
                  Sweep step
                  <select value={step} onChange={(e) => setStep(Number(e.target.value))} style={sel}>
                    {[0.5, 1, 2, 5].map((s) => <option key={s} value={s}>{s} m</option>)}
                  </select>
                </label>
              )}
              {tab === "holes" && rows.length > 0 && (
                <button onClick={exportCsv} style={{ ...exportBtn, marginLeft: "auto" }}><Download size={12} /> Export CSV</button>
              )}
            </div>

            {/* Watertightness is stated up front, because it decides which of the two questions this tool
                can actually answer for this surface. */}
            {mesh && (
              <div style={mesh.closed ? goodNote : warnNote}>
                {mesh.closed
                  ? `This surface is watertight (${mesh.edges.toLocaleString()} edges, none open), so "metres inside" is well defined.`
                  : `This surface is NOT closed — ${mesh.boundaryEdges.toLocaleString()} of its ${mesh.edges.toLocaleString()} edges are open, so it has no inside. Distances and pierce depths below are still exact; metres-inside is left blank rather than guessed. A draped contact or fault plane is open by nature; a shell that should be closed but isn't was probably clipped by a modelling domain or the grid boundary.`}
              </div>
            )}
            {!mesh && <div style={warnNote}>This surface's mesh is empty or degenerate — nothing to query.</div>}

            {tab === "holes" && mesh && (
              <>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "8px 0 6px" }}>
                  {totals.holes} hole{totals.holes === 1 ? "" : "s"} · {totals.piercing} pierce this surface
                  {mesh.closed ? ` · ${totals.inside.toFixed(1)} m total inside` : ""}
                  {totals.piercing === 0 && totals.holes > 0 && (
                    <span style={{ color: "#8a6d1f" }}> — no hole intersects this surface at all, which is usually worth a second look at the modelling inputs.</span>
                  )}
                </div>
                <div style={{ maxHeight: "48vh", overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 6 }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
                    <thead>
                      <tr>
                        {["Hole", "Closest (m)", "at MD (m)", "Pierce points (MD)", mesh.closed ? "Inside (m)" : "Inside", "Hole length (m)"].map((h) => (
                          <th key={h} style={th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.hole_id} style={{ background: r.intercepts.length ? "#f3f8f3" : "transparent" }}>
                          <td style={{ ...td, fontWeight: 600 }}>{r.hole_id}</td>
                          <td style={td}>{r.minDistance === 0 ? "0 (intersects)" : fmt(r.minDistance, 2)}</td>
                          <td style={td}>{fmt(r.atMd, 1)}</td>
                          <td style={{ ...td, color: "var(--color-text-secondary)" }} title={r.intercepts.some((i) => i.tangential) ? "A tangential intercept touches the surface and leaves at the same depth without entering it — a real contact point, but zero metres inside." : ""}>
                            {r.intercepts.length ? r.intercepts.map((i) => `${i.md.toFixed(1)}${i.tangential ? " (tangential)" : ""}`).join(", ") : "—"}
                          </td>
                          <td style={td} title={r.insideIntervals.map((x) => `${x.from.toFixed(1)}–${x.to.toFixed(1)} m`).join(", ")}>
                            {r.insideLength == null ? "n/a" : r.insideLength > 0 ? r.insideLength.toFixed(2) : "0"}
                          </td>
                          <td style={{ ...td, color: "var(--color-text-muted)" }}>{fmt(r.totalLength, 1)}</td>
                        </tr>
                      ))}
                      {!rows.length && <tr><td style={td} colSpan={6}>No desurveyed holes — import collars and survey data first.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div style={hint}>
                  Closest approach is the true point-to-triangle distance (nearest face, edge or vertex —
                  not just the nearest mesh vertex). Rows that intersect the surface are highlighted and
                  report 0. Hover an "Inside" cell for the individual intercept intervals.
                </div>
              </>
            )}

            {tab === "point" && mesh && (
              <div style={{ display: "flex", gap: 18, alignItems: "flex-start", marginTop: 6 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 220 }}>
                  <div style={{ fontSize: 10.5, color: "var(--color-text-secondary)" }}>Real-world coordinates (same frame as your collars)</div>
                  {[["Easting (X)", ptX, setPtX], ["Northing (Y)", ptY, setPtY], ["Elevation (Z)", ptZ, setPtZ]].map(([label, v, set]) => (
                    <label key={label} style={rowLabel}>
                      {label}
                      <input value={v} onChange={(e) => set(e.target.value)} style={{ ...sel, fontFamily: "monospace" }} placeholder="0" />
                    </label>
                  ))}
                </div>
                <div style={{ flex: 1, minWidth: 300 }}>
                  {!pointResult ? (
                    <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", padding: "20px 0", lineHeight: 1.6 }}>
                      Enter all three coordinates to query. The result is the exact distance to the nearest
                      point on the surface{mesh.closed ? ", signed negative when the point is inside it" : " (this surface is open, so there is no inside to report)"}.
                    </div>
                  ) : (
                    <div style={{ background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "10px 12px", fontSize: 12, lineHeight: 1.9, color: "var(--color-text)" }}>
                      <div><b>Distance to surface:</b> {pointResult.distance.toFixed(3)} m</div>
                      {mesh.closed ? (
                        <>
                          <div><b>Position:</b> {pointResult.inside ? <span style={{ color: "#1c7a3e" }}>INSIDE</span> : <span style={{ color: "#8a4b1f" }}>outside</span>}</div>
                          <div><b>Signed distance:</b> {pointResult.signed.toFixed(3)} m <span style={{ color: "var(--color-text-muted)", fontSize: 10.5 }}>(negative = inside)</span></div>
                        </>
                      ) : (
                        <div style={{ color: "#8a6d1f" }}>Inside/outside is not defined for an open surface.</div>
                      )}
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #e0e3e8", fontSize: 11, color: "var(--color-text-secondary)" }}>
                        Nearest point on surface: {pointResult.worldNearest.x.toFixed(1)}, {pointResult.worldNearest.y.toFixed(1)}, {pointResult.worldNearest.z.toFixed(1)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(20,24,30,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.3)", width: 820, maxWidth: "94vw", maxHeight: "94vh", overflow: "auto" };
const rowLabel = { fontSize: 10.5, color: "#55606e", display: "flex", flexDirection: "column", gap: 3 };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "#1a2028", fontSize: 11 };
const tabBtn = { padding: "6px 14px", border: "none", fontSize: 11.5, cursor: "pointer" };
const exportBtn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-border-light)", background: "transparent", color: "#55606e", fontSize: 11.5, cursor: "pointer" };
const th = { textAlign: "left", padding: "6px 8px", background: "var(--color-bg-subtle)", borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, fontSize: 10.5, color: "#55606e", fontWeight: 600 };
const td = { padding: "5px 8px", borderBottom: "1px solid #eef0f3", color: "#1a2028", whiteSpace: "nowrap" };
const goodNote = { background: "#f1f7f2", border: "1px solid #c6e0cb", borderRadius: 6, padding: "7px 9px", fontSize: 10.8, color: "#20512f", lineHeight: 1.5 };
const warnNote = { background: "#fdf6ec", border: "1px solid #e6d3b3", borderRadius: 6, padding: "7px 9px", fontSize: 10.8, color: "#6b4e20", lineHeight: 1.5 };
const hint = { fontSize: 10.2, color: "#94a1b0", marginTop: 7, lineHeight: 1.5 };
