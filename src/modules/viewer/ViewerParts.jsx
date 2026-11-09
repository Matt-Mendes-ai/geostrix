// TASKS.csv #1084 — the 3D View's toolbar and sidebar rows, moved out of ViewerModule.jsx when it reached its size cap
// (test/viewerModuleSize1084.test.mjs). Unchanged code: ViewToolbar, ContextItem, HoleRow, LayerRow, LayerQuickPanel,
// VoxelRangeRow, distToSegment and the shared sidebar styles, plus the two lazy modals only they use.
import React, { useState, useRef, useEffect, useMemo } from "react";
import { Bookmark, BookmarkPlus, Camera, ChevronDown, ChevronUp, Database, Download, RefreshCw, Eye, EyeOff, FileBarChart2, Grid3x3, Info, LayoutTemplate, ListFilter, Maximize2, Milestone, PenTool, Pencil, Ruler, Scissors, ShieldAlert, TerminalSquare, Trash2, Upload, X, SquareSplitVertical, Rows3, Layers3, Crosshair, Map as MapIcon, Compass, Target, Mountain, Shapes, Palette } from "../../components/icons.js";
import { Ribbon, RibbonGroup, RibbonButton, RIBBON_TONES } from "../../components/Ribbon.jsx";
import HoverToolInfo from "../../components/HoverToolInfo.jsx";
import VoxelRangeNumber from "../../components/VoxelRangeNumber.jsx"; // TASKS.csv #1208
import { iconAction, activateOnKey } from "../../lib/a11y.js";
import { voxelCellSupported } from "../../lib/viewer/geomath.js";
import { coincidentModels } from "../../lib/voxelOverlap.js"; // TASKS.csv #1808
import { isTargetModel } from "../../lib/plannedHoleChecks.js"; // TASKS.csv #1832
import { pBtn } from "../../lib/sidebarStyles.js";
import { distinctValues } from "../../lib/layers.js";
import { confirmDestructive } from "../../lib/confirmDestructive.js";
import { chipLook } from "../../lib/viewer/modelHelpers.js";
import { lazyModal } from "../../lib/lazyModal.jsx";
import { t as tr } from "../../lib/i18n.js";
import { orphanHoleIds } from "../../lib/noCollars.js"; // TASKS.csv #1809

export const MeasureResults = lazyModal(() => import("../../components/MeasureResults.jsx"));
const NumericSymbologyEditor = lazyModal(() => import("../../components/NumericSymbologyEditor.jsx"));
export function ViewToolbar({
  openPopover, setOpenPopover, gridConfig, setGridConfig,
  figureOverlay, setFigureOverlay, projectName, legendCount, legendShown, // TASKS.csv #311
  themes, themeNameDraft, setThemeNameDraft, captureCurrentTheme, applyTheme,
  renamingThemeId, setRenamingThemeId, renameDraft, setRenameDraft, renameTheme, deleteTheme,
  onDbConnect, onQc, qcDisabled, onBoundaryIntercepts, boundaryDisabled, boundaryWhy = null /* #1810 */, onSqlWorkspace, sqlDisabled,
  onReloadDb = null, reloadDbCount = 0, reloadDbTitle = "", // TASKS.csv #1963
  onSnapshot, snapshotDisabled, exportDisabled = snapshotDisabled, onExportHoles, sectionMode, onToggleSection, sectionCorridor, setSectionCorridor,
  identifyOn, onToggleIdentify, measureMode, onToggleMeasure, onSwitchMeasureMode, measurePts, clearMeasure,
  interpretOpen, onInterpret, // TASKS.csv #1152
  show, paneProps, // TASKS.csv #458
  onLevelPlan, // TASKS.csv #525
}) {
  const toggle = (name) => setOpenPopover((p) => (p === name ? null : name));
  return (
    <Ribbon show={show} label="3D View tools">
      <RibbonGroup label="View">
        <div className="ge-ribbon-cell ge-adv">
          <HoverToolInfo title={tr("Grid")} text={tr("Toggles the ground reference grid on or off, and lets you resize it, change its division spacing/colour, or add two vertical wall grids for a full 3D reference box. Turn it off if it's cluttering a dense model or a figure you're about to snapshot.")} suppress={openPopover === "grid"}>
            <button className={`ge-ribbon-btn ${openPopover === "grid" ? "active" : ""}`} aria-expanded={openPopover === "grid"} aria-haspopup="dialog" onClick={() => toggle("grid")}><Grid3x3 size={22} strokeWidth={1.7} color={RIBBON_TONES.view} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Grid")}</span></button>
          </HoverToolInfo>
          {openPopover === "grid" && (
            <div style={popoverStyle}>
              <div style={popoverHeader}>{tr("Grid")}<X size={14} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => setOpenPopover(null), tr("Close the grid settings popover"))} /></div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setGridConfig((g) => ({ ...g, visible: !g.visible }))} style={{ cursor: "pointer", color: gridConfig.visible ? "var(--color-accent)" : "var(--color-text-disabled)" }}>
                  {gridConfig.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </div>
                <div style={{ flex: 1, fontSize: "var(--font-size-base)", color: gridConfig.visible ? "var(--color-text)" : "var(--color-text-faint)" }}>{tr("Show grid")}</div>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer" }} title={tr("Add two vertical wall grids to the ground grid, forming a 3D reference box")}>
                  <input type="checkbox" checked={gridConfig.mode === "3d"} onChange={(e) => setGridConfig((g) => ({ ...g, mode: e.target.checked ? "3d" : "ground" }))} /> 3D
                </label>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="number" title={tr("Grid size (m)")} value={gridConfig.size} onChange={(e) => setGridConfig((g) => ({ ...g, size: Math.max(10, Number(e.target.value) || g.size) }))} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)", fontFamily: "inherit" }} />
                <input type="number" title={tr("Divisions")} value={gridConfig.divisions} onChange={(e) => setGridConfig((g) => ({ ...g, divisions: Math.max(1, Number(e.target.value) || g.divisions) }))} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)", fontFamily: "inherit" }} />
                <input type="color" title={tr("Grid colour")} value={gridConfig.color} onChange={(e) => setGridConfig((g) => ({ ...g, color: e.target.value }))} style={{ width: 30, height: 28, padding: 0, border: "1px solid var(--color-border)", borderRadius: 5, background: "none", cursor: "pointer" }} />
              </div>
              {/* TASKS.csv #311 — the world-origin axis lines, grouped here because they are the same
                  kind of reference-furniture decision as the grid. Off by default now (they sit at the
                  arbitrary project origin and are the most debug-view-looking thing in a screenshot);
                  switching them on still gives colours that agree with the corner gizmo, per #189. */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginTop: 8, cursor: "pointer" }} title={tr("Draw the red/green/blue X/Y/Z axis lines at the project origin. Off by default — the corner gizmo already shows orientation, and these sit at an arbitrary point relative to your data.")}>
                <input type="checkbox" checked={!!gridConfig.axes} onChange={(e) => setGridConfig((g) => ({ ...g, axes: e.target.checked }))} />{" "}{tr("Origin axis lines")}</label>
            </div>
          )}
        </div>
        <div className="ge-ribbon-cell ge-adv">
          <HoverToolInfo title={tr("Figure overlay")} text={tr("Draws a title, a legend of the categories currently switched on, and a scale bar over the 3D view, so a screenshot of this view can go straight into a report or a deck without being re-annotated. On by default; the setting is saved with the project. For a full report figure — page, north arrow, true-scale capture, PDF — use the Layout tab.")} suppress={openPopover === "figure"}>
            <button className={`ge-ribbon-btn ${openPopover === "figure" ? "active" : ""}`} aria-expanded={openPopover === "figure"} aria-haspopup="dialog" onClick={() => toggle("figure")}><LayoutTemplate size={22} strokeWidth={1.7} color={RIBBON_TONES.view} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Figure")}</span></button>
          </HoverToolInfo>
          {openPopover === "figure" && (
            <div style={{ ...popoverStyle, width: 268 }}>
              <div style={popoverHeader}>{tr("Figure overlay")}<X size={14} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => setOpenPopover(null), tr("Close the figure overlay popover"))} /></div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 8 }}>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setFigureOverlay((f) => ({ ...f, enabled: !f.enabled }))} style={{ cursor: "pointer", color: figureOverlay.enabled ? "var(--color-accent)" : "var(--color-text-disabled)" }} {...iconAction(() => setFigureOverlay((f) => ({ ...f, enabled: !f.enabled })), tr("Toggle the figure overlay"))}>
                  {figureOverlay.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                </div>
                <div style={{ flex: 1, fontSize: "var(--font-size-base)", color: figureOverlay.enabled ? "var(--color-text)" : "var(--color-text-faint)" }}>{tr("Show overlay")}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8, opacity: figureOverlay.enabled ? 1 : 0.45 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
                  <input type="checkbox" disabled={!figureOverlay.enabled} checked={!!figureOverlay.title} onChange={(e) => setFigureOverlay((f) => ({ ...f, title: e.target.checked }))} />{" "}{tr("Title")}</label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
                  <input type="checkbox" disabled={!figureOverlay.enabled} checked={!!figureOverlay.legend} onChange={(e) => setFigureOverlay((f) => ({ ...f, legend: e.target.checked }))} />{" "}{tr("Legend{v}", { v: legendCount ? (legendShown != null && legendShown < legendCount ? ` (${tr("{n} of {m} shown", { n: legendShown, m: legendCount })})` : ` (${legendCount} shown)`) : tr(" (nothing switched on)") })}
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
                  <input type="checkbox" disabled={!figureOverlay.enabled} checked={!!figureOverlay.scale} onChange={(e) => setFigureOverlay((f) => ({ ...f, scale: e.target.checked }))} />{" "}{tr("Scale bar")}</label>
              </div>
              <input
                type="text" disabled={!figureOverlay.enabled}
                placeholder={projectName || tr("Figure title…")}
                value={figureOverlay.titleText || ""}
                onChange={(e) => setFigureOverlay((f) => ({ ...f, titleText: e.target.value }))}
                title={tr("Overrides the project name in the overlay title. Leave blank to use the project name.")}
                style={{ width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit", marginBottom: 8, opacity: figureOverlay.enabled ? 1 : 0.45 }}
              />
              {/* The scale-bar honesty statement. A perspective camera has no single scale — the bar is
                  exact only in the plane through the point you are orbiting around. Saying so here (and
                  on the bar itself, "at view centre") is the whole reason this is a popover: an
                  authoritative-looking bar that is quietly wrong at the depth the reader cares about
                  would be worse than no bar at all. */}
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-caption)", lineHeight: 1.5 }}>{tr("The scale bar is exact at the")}{" "}<b>{tr("view centre")}</b>{" "}{tr("— the point you orbit around. This is a perspective view, so anything nearer the camera reads larger than the bar says and anything farther reads smaller. For a figure where the scale must hold everywhere, add a Viewport on the")}{" "}<b>{tr("Layout")}</b>{" "}{tr("tab and tick")}{" "}<b>{tr("True scale (orthographic)")}</b>{" "}{tr("there.")}<br />{tr("The legend lists the categories currently switched on in this view — not everything in the project, and not filtered by what happens to be on screen.")}</div>
            </div>
          )}
        </div>
        <div className="ge-ribbon-cell ge-adv">
          <HoverToolInfo title={tr("Themes")} text={tr("Saves the current view — visible layers, active filters, grid settings, and camera position — as a named theme you can reload later with one click, or bind to a Viewport element on a Layout page so a report figure re-frames itself automatically.")} suppress={openPopover === "themes"}>
            <button className={`ge-ribbon-btn ${openPopover === "themes" ? "active" : ""}`} aria-expanded={openPopover === "themes"} aria-haspopup="dialog" onClick={() => toggle("themes")}><Bookmark size={22} strokeWidth={1.7} color={RIBBON_TONES.view} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Themes")}</span></button>
          </HoverToolInfo>
          {openPopover === "themes" && (
            <div style={{ ...popoverStyle, width: 260 }}>
              <div style={popoverHeader}>{tr("Themes")}<X size={14} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => setOpenPopover(null), tr("Close the themes popover"))} /></div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input
                  type="text" placeholder={tr("Theme name…")} value={themeNameDraft}
                  onChange={(e) => setThemeNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && themeNameDraft.trim()) { captureCurrentTheme(themeNameDraft.trim()); setThemeNameDraft(""); } }}
                  style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}
                />
                <button
                  onClick={() => { if (themeNameDraft.trim()) { captureCurrentTheme(themeNameDraft.trim()); setThemeNameDraft(""); } }}
                  disabled={!themeNameDraft.trim()}
                  title={tr("Save the current view (layers, filters, grid, camera, and which generated surfaces are shown) as a named theme")}
                  style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "6px 9px", opacity: themeNameDraft.trim() ? 1 : 0.5, cursor: themeNameDraft.trim() ? "pointer" : "default" }}
                ><BookmarkPlus size={14} /></button>
              </div>
              {themes.length === 0 && (
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4, lineHeight: 1.4 }}>{tr("Save the current view as a theme to reload it later, or bind it to a Viewport element on the Layout page.")}</div>
              )}
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {themes.map((t) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
                    {renamingThemeId === t.id ? (
                      <input
                        autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => { if (renameDraft.trim()) renameTheme(t.id, renameDraft.trim()); setRenamingThemeId(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenamingThemeId(null); }}
                        style={{ flex: 1, minWidth: 0, background: "var(--color-bg)", border: "1px solid #3a4658", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}
                      />
                    ) : (
                      <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => applyTheme(t)} title={tr("Apply this theme's layers, filters, grid, camera position, and the generated surfaces it was saved with")} style={{ cursor: "pointer", flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                        <Bookmark size={14} style={{ flexShrink: 0, color: "var(--color-text-secondary)" }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                      </div>
                    )}
                    <Pencil size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { setRenamingThemeId(t.id); setRenameDraft(t.name); }, tr("Rename theme \"{name}\"", { name: t.name }))} />
                    <X size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => { if (confirmDestructive(tr("Delete theme \"{name}\"?", { name: t.name }))) deleteTheme(t.id); }, tr("Delete theme \"{name}\"", { name: t.name }))} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <RibbonButton advanced icon={SquareSplitVertical} label="3D slice" tone="section" title="Cut the view with a moving vertical or horizontal slab" {...paneProps("slice3d")} />
      </RibbonGroup>
      <RibbonGroup label="Sections">
        <div className="ge-ribbon-cell">
          <HoverToolInfo title={tr("Draw cross-section")} text={sectionMode ? tr("Active — click 2 points on the plan view to draw the section, or click the button again to cancel. Drillholes, layers, and voxels all get projected onto it, opening in its own window. Every currently visible layer gets carried into the section; the Buffer setting controls how far off the line a hole/point can be and still be included.") : tr("Click two points on the plan view to slice a vertical section through the model along that line — drillholes, layers, and voxels all get projected onto it, opening in its own window. Every currently visible layer gets carried into the section; the Buffer setting controls how far off the line a hole/point can be and still be included.")}>
            <button className={`ge-ribbon-btn ${sectionMode ? "active" : ""}`} aria-pressed={!!(sectionMode)} onClick={onToggleSection}><Scissors size={22} strokeWidth={1.7} color={RIBBON_TONES.section} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Draw section")}</span></button>
          </HoverToolInfo>
        </div>
        {sectionMode && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginLeft: 4 }} title={tr("Every currently visible layer (litho, alteration, assays, structure, custom…) gets carried into the section")}>{tr("Buffer (m)")}<input type="number" value={sectionCorridor} onChange={(e) => setSectionCorridor(Math.max(1, Number(e.target.value) || 100))} style={{ width: 60, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)", fontFamily: "inherit" }} />
          </label>
        )}
        <RibbonButton advanced icon={Crosshair} label="By coordinates" tone="section" title="Open a section from a centre, azimuth and length — or through a hole (scissors in the Holes list)" {...paneProps("sectionCoords")} />
        <RibbonButton advanced icon={Rows3} label="Fence series" tone="section" title="Parallel sections at a set azimuth and spacing, on round grid lines" {...paneProps("fence")} />
        <RibbonButton advanced icon={Layers3} label="Level plan" tone="section" title="Horizontal section (level plan) at an RL: pierce points, logs and assays in a slab, block-model cells and surfaces cut at that elevation" onClick={onLevelPlan} />
      </RibbonGroup>
      <RibbonGroup label="Measure & check">
        <div className="ge-ribbon-cell">
          <HoverToolInfo title={tr("Identify")} text={tr("Click anything in the 3D view to see which layer it belongs to and its details, including what lies behind it. Esc stops.")}>
            <button className={`ge-ribbon-btn ${identifyOn ? "active" : ""}`} aria-pressed={identifyOn} onClick={onToggleIdentify}><Info size={22} strokeWidth={1.7} color={RIBBON_TONES.analyse} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Identify")}</span></button>
          </HoverToolInfo>
        </div>
        <div className="ge-ribbon-cell">
          <HoverToolInfo title={tr("Measure")} text={measureMode ? tr("Active — click points on the model to measure, or click the button again to stop. Distance mode chains a running line — each click extends it, showing the total path length, the straight-line start-to-end distance, and the last segment's own length/bearing/elevation change. Area mode builds a polygon — the closing edge back to your first point is drawn dashed automatically, and the readout shows the plan-view (horizontal) area and perimeter. Switch between the two with the Distance/Area pills in the readout.") : tr("Click points on the model (plan or 3D) to measure. Distance mode chains a running line — each click extends it, showing the total path length, the straight-line start-to-end distance, and the last segment's own length/bearing/elevation change. Area mode builds a polygon — the closing edge back to your first point is drawn dashed automatically, and the readout shows the plan-view (horizontal) area and perimeter. Switch between the two with the Distance/Area pills that appear once measuring is on.")}>
            <button className={`ge-ribbon-btn ${measureMode ? "active" : ""}`} aria-pressed={!!(measureMode)} onClick={onToggleMeasure}><Ruler size={22} strokeWidth={1.7} color={RIBBON_TONES.analyse} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Measure")}</span></button>
          </HoverToolInfo>
        </div>
        {measureMode && <MeasureResults mode={measureMode} pts={measurePts} onClear={clearMeasure} onSwitchMode={onSwitchMeasureMode} />}
        <div className="ge-ribbon-cell">{/* TASKS.csv #1152 */}
          <HoverToolInfo title={tr("Interpretation lines")} text={tr("Draw faults, contacts and lineaments over a geophysics survey. Each set of lines is a map layer: it drapes on the terrain, exports as Shapefile, GeoPackage, KML or DXF, and prints in the Layout legend.")}>
            <button className={`ge-ribbon-btn ${interpretOpen ? "active" : ""}`} aria-pressed={!!interpretOpen} onClick={onInterpret}><PenTool size={22} strokeWidth={1.7} color={RIBBON_TONES.analyse} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Interpret")}</span></button>
          </HoverToolInfo>
        </div>
        <div className="ge-ribbon-cell">
          <HoverToolInfo title={tr("Run data QC")} text={qcDisabled ? tr("Load some drillhole data (collars, intervals or assays) first. Scans the currently loaded collars, survey, and interval data for common drilling-data mistakes — duplicate hole IDs, out-of-order or overlapping depths, survey stations beyond a hole's stated length, and similar — and lists everything it finds so you can fix it before modelling.") : tr("Scans the currently loaded collars, survey, and interval data for common drilling-data mistakes — duplicate hole IDs, out-of-order or overlapping depths, survey stations beyond a hole's stated length, and similar — and lists everything it finds so you can fix it before modelling.")}>
            <button className={`ge-ribbon-btn${qcDisabled ? " is-disabled" : ""}`} onClick={qcDisabled ? undefined : onQc} aria-disabled={qcDisabled || undefined}><ShieldAlert size={22} strokeWidth={1.7} color={RIBBON_TONES.analyse} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Data QC")}</span></button>
          </HoverToolInfo>
        </div>
        <div className="ge-ribbon-cell">
          <HoverToolInfo title={tr("Boundary intercepts")} text={boundaryDisabled ? `${boundaryWhy || tr("Load some lithology/alteration interval data first.")} ` + tr("Lists every geological unit boundary (top of each litho/alteration interval) resolved to a real 3D position along each hole — the same control points the implicit-modelling tools use — so you can review, exclude, or mark individual points \"soft\" before running a surface.") : tr("Lists every geological unit boundary (top of each litho/alteration interval) resolved to a real 3D position along each hole — the same control points the implicit-modelling tools use — so you can review, exclude, or mark individual points \"soft\" before running a surface.")}>
            <button className={`ge-ribbon-btn${boundaryDisabled ? " is-disabled" : ""}`} onClick={boundaryDisabled ? undefined : onBoundaryIntercepts} aria-disabled={boundaryDisabled || undefined}><Milestone size={22} strokeWidth={1.7} color={RIBBON_TONES.analyse} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Intercepts")}</span></button>
          </HoverToolInfo>
        </div>
      </RibbonGroup>
      <RibbonGroup advanced label="Database">
        <div className="ge-ribbon-cell">
          <HoverToolInfo title={tr("Connect database")} text={tr("Connects directly to a PostgreSQL database and pulls collars, survey, or other tables straight in — no CSV export/import round trip needed if your data already lives in a database.")}>
            <button className="ge-ribbon-btn" onClick={onDbConnect}><Database size={22} strokeWidth={1.7} color={RIBBON_TONES.data} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Database")}</span></button>
          </HoverToolInfo>
        </div>
        <div className="ge-ribbon-cell">{/* TASKS.csv #1963 — Matt: "a reload data button. That way I don't have to search for the schema in the database and load it again" */}
          <HoverToolInfo title={tr("Reload from database")} text={reloadDbCount ? tr("Pulls every table this project imported from a database again, through the same connection, schema, table and column choices, and replaces those layers' rows. {n} table(s): {list}", { n: reloadDbCount, list: reloadDbTitle.split("\n").join("; ") }) : tr("Nothing to reload yet: import a table from the Browser panel or Database first, and it is remembered here with its schema, table and column choices.")}>
            <button className={`ge-ribbon-btn${reloadDbCount ? "" : " is-disabled"}`} onClick={reloadDbCount ? onReloadDb : undefined} aria-disabled={!reloadDbCount || undefined} title={reloadDbTitle || undefined}><RefreshCw size={22} strokeWidth={1.7} color={RIBBON_TONES.data} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Reload data")}</span></button>
          </HoverToolInfo>
        </div>
        <div className="ge-ribbon-cell">
          <HoverToolInfo title={tr("SQL workspace")} text={sqlDisabled ? tr("Load some data first. Ad hoc SQL queries against whatever's currently loaded (collars, survey, layers, assays, boundaries) — no Postgres connection needed. Also reachable from the Geochem module's toolbar.") : tr("Ad hoc SQL queries against whatever's currently loaded (collars, survey, layers, assays, boundaries) — no Postgres connection needed. Also reachable from the Geochem module's toolbar.")}>
            <button className={`ge-ribbon-btn${sqlDisabled ? " is-disabled" : ""}`} onClick={sqlDisabled ? undefined : onSqlWorkspace} aria-disabled={sqlDisabled || undefined}><TerminalSquare size={22} strokeWidth={1.7} color={RIBBON_TONES.data} aria-hidden="true" /><span className="ge-ribbon-label">{tr("SQL")}</span></button>
          </HoverToolInfo>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Output">
        <div className="ge-ribbon-cell">
          <HoverToolInfo title={tr("Snapshot to Layout")} text={snapshotDisabled ? tr("Load some data first. Captures the current 3D view exactly as it's framed right now and drops it onto the Layout page as a fixed image — good for a report figure that shouldn't change if you keep exploring the model afterward. For a figure that stays live and re-frames itself, use a Theme + Viewport instead.") : tr("Captures the current 3D view exactly as it's framed right now and drops it onto the Layout page as a fixed image — good for a report figure that shouldn't change if you keep exploring the model afterward. For a figure that stays live and re-frames itself, use a Theme + Viewport instead.")}>
            <button className={`ge-ribbon-btn${snapshotDisabled ? " is-disabled" : ""}`} onClick={snapshotDisabled ? undefined : onSnapshot} aria-disabled={snapshotDisabled || undefined}><Camera size={22} strokeWidth={1.7} color={RIBBON_TONES.output} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Snapshot")}</span></button>
          </HoverToolInfo>
        </div>
        {/* TASKS.csv #1085 — the drillhole exports, which lived only on right-click of the import buttons */}
        <div className="ge-ribbon-cell">
          <HoverToolInfo title={tr("Export drillholes")} text={exportDisabled ? tr("No drillholes to export: load collars first.") : tr("Collars as points and hole traces as 3D lines (Shapefile, GeoPackage, DXF), or every drillhole table as CSV. Traces are exported whether they come from a survey file or from the collar azimuth, dip and length.")}>
            <button className={`ge-ribbon-btn${exportDisabled ? " is-disabled" : ""}`} onClick={exportDisabled ? undefined : onExportHoles} aria-disabled={exportDisabled || undefined} aria-haspopup="menu"><Download size={22} strokeWidth={1.7} color={RIBBON_TONES.output} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Export")}</span></button>
          </HoverToolInfo>
        </div>
      </RibbonGroup>
    </Ribbon>
  );
}
const popoverStyle = { position: "absolute", top: "calc(100% + 4px)", left: 0, width: 230, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.12)", padding: 10, zIndex: 50 };
const popoverHeader = { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" };

// TASKS.csv #1439 (review #1352, Silvertip) — the Surface Geology ribbon (moved here from ViewerModule, at its size cap): the
// field data's tools beside the map and the outcrop measurements - Identify, the rock chips' style, interpretation lines and
// unit polygons drawn in the app, so a geology map can be made here and Model it can use it.
export function SurfaceRibbon({ show, paneProps, onStereonet, onModelIt, mapPolygons = true, identifyOn, onToggleIdentify, interpretOpen, onInterpret, onPolygons, onStyleSamples, sampleCount = 0 }) {
  return (
    <Ribbon show={show} label="Surface geology tools">
      <RibbonGroup label="Geological mapping">
        <RibbonButton icon={MapIcon} label="Geology map" tone="data" title="Geology map layers (GeoPackage / shapefile / MapInfo TAB): import, colour by unit, drape on the terrain" {...paneProps("sgMaps")} />
        <RibbonButton icon={Compass} label="Outcrop structures" tone="data" title="Outcrop structure measurements (CSV / MapInfo points): bedding, foliation, faults, veins" {...paneProps("sgStructs")} />
        <RibbonButton icon={Target} label="Stereonet" tone="analyse" title="Stereonet of the outcrop measurements (and any downhole structure picks)" onClick={onStereonet} />
      </RibbonGroup>
      <RibbonGroup label="Draw">
        <RibbonButton icon={Shapes} label="Unit polygons" tone="data" active={interpretOpen === "polygon"} title="Draw the outline of a map unit by clicking in the 3D view: a geology map layer with a unit field, which Model it can use" onClick={onPolygons} />
        <RibbonButton icon={PenTool} label="Interpret" tone="analyse" active={interpretOpen === true} title="Draw faults, contacts and lineaments by clicking in the 3D view; each set of lines is a map layer" onClick={onInterpret} />
      </RibbonGroup>
      <RibbonGroup label="Field data">
        <RibbonButton icon={Info} label="Identify" tone="analyse" active={identifyOn} title="Click anything in the 3D view to see which layer it belongs to and its details. Esc stops." onClick={onToggleIdentify} />
        <RibbonButton icon={Palette} label="Rock chips" tone="view" disabled={!sampleCount} disabledReason="Import surface samples (rock chips, soils) on the Geochem tab first" title="Style the surface samples: colour, size, shape, labels; colour by element is in the sidebar" onClick={onStyleSamples} />
      </RibbonGroup>
      <RibbonGroup label="Next step">
        <RibbonButton icon={Mountain} label="Model it" tone="model" title="Build a 3D model from this map and these measurements: opens 3D Modelling > Model from map" onClick={onModelIt}
          disabled={!mapPolygons} disabledReason="Import a geology map (Geology map) or draw its units (Unit polygons) first: Model it builds from map polygons with a unit field" />{/* #1447 */}
      </RibbonGroup>
    </Ribbon>
  );
}

export function ContextItem({ label, onClick, disabled, title }) {
  if (disabled) {
    return <div role="menuitem" aria-disabled="true" title={title} style={{ padding: "7px 10px", borderRadius: 5, cursor: "default", color: "var(--color-text-disabled)" }}>{label}</div>;
  }
  // TASKS.csv #730 — menuitem (was button); tabIndex 0 stays, #575's menuItemsOf finds items by it
  return <div role="menuitem" tabIndex={0} onKeyDown={activateOnKey} onClick={onClick} title={title} onMouseEnter={(e) => (e.currentTarget.style.background = "#242e3c")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")} style={{ padding: "7px 10px", borderRadius: 5, cursor: "pointer", color: "var(--color-text)" }}>{label}</div>;
}
// TASKS.csv #222 (QGIS-specialist audit finding: 38ms blocking per single hole-visibility toggle at
// 200 holes) — collars.map(...) recreated every hole row's JSX on every render, so toggling ONE hole's
// eye icon forced React to reconcile all 200 sibling rows too, not just the one that actually changed.
// React.memo here + toggleHole/onOpenStripLog both being useCallback-stable (see their own definitions)
// means an unrelated row's props are referentially unchanged across that render, so React skips it
// entirely. A full windowed-scroll virtualization (like DataQCModal/AttributeTableModal got) wasn't
// used here because the Holes list isn't its own isolated scroll region — it's one section inline
// within the whole sidebar's single mixed-content scroll container (Geometry/Layers/Slice-series/Holes/
// notices all together), and windowing a sub-range of a larger shared scroll needs real layout
// restructuring this pass didn't attempt; memoization fixes the actual measured symptom (the toggle
// cost) without that risk.
export const typedSectionInput = { width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }; // #393
// TASKS.csv #1809 (review #1646, Kodiak) — holes known only from their logs and assays (no collar): listed with a strip-log button, as
// the strip log needs only depths. With 0 collars, Kodiak's 33 holes (904 lithology, 782 alteration, 6,239 assay intervals) had no
// downhole view anywhere. The ids are those of the interval layers and assays that match no collar.
export function OrphanHoles({ layers, assays, collars, onOpenStripLog }) {
  const ids = React.useMemo(() => orphanHoleIds(layers, assays, collars), [layers, assays, collars]);
  if (!ids.length) return null;
  return (
    <>
      <div className="ge-section-label" style={{ marginTop: 16 }} title={tr("Holes in the logs or assays with no collar: not drawn in 3D, but their strip logs open from their depths")}>{tr("Holes without collars ({n})", { n: ids.length })}</div>
      {ids.map((id) => (
        <div key={id} role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onOpenStripLog(id)} title={tr("Strip log — {hole_id}", { hole_id: id })}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 5, cursor: "pointer", fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>
          <span style={{ flex: 1 }}>{id}</span>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("no collar")}</span>
          <FileBarChart2 size={12} />
        </div>
      ))}
    </>
  );
}

export const HoleRow = React.memo(function HoleRow({ hole_id, visible, onToggle, onOpenStripLog, onSection, onZoom }) {
  return (
    <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onToggle(hole_id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 5, cursor: "pointer", fontSize: "var(--font-size-base)", color: visible === false ? "var(--color-text-disabled)" : "var(--color-text)" }}>
      {visible === false ? <EyeOff size={12} /> : <Eye size={12} />}
      <span style={{ flex: 1 }}>{hole_id}</span>
      {onZoom && ( /* TASKS.csv #393 — zoom the 3D view to this hole */
        <span role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Zoom to {hole_id}", { hole_id })}
          onClick={(e) => { e.stopPropagation(); onZoom(hole_id); }}
          title={tr("Zoom to {hole_id}", { hole_id })}
          style={{ display: "flex", alignItems: "center", color: "var(--color-text-muted)", padding: 2, borderRadius: 4 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#1a2028")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#65717e")}
        >
          <Maximize2 size={12} />
        </span>
      )}
      {onSection && ( /* TASKS.csv #393 — section in the plane of this hole */
        <span role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Section through {hole_id}", { hole_id })}
          onClick={(e) => { e.stopPropagation(); onSection(hole_id); }}
          title={tr("Section through {hole_id} — along the hole's own bearing, Buffer from the section tool", { hole_id })}
          style={{ display: "flex", alignItems: "center", color: "var(--color-text-muted)", padding: 2, borderRadius: 4 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#1a2028")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#65717e")}
        >
          <Scissors size={12} />
        </span>
      )}
      <span role="button" tabIndex={0} onKeyDown={activateOnKey}
        onClick={(e) => { e.stopPropagation(); onOpenStripLog(hole_id); }}
        title={tr("Strip log — {hole_id}", { hole_id })}
        style={{ display: "flex", alignItems: "center", color: "var(--color-text-muted)", padding: 2, borderRadius: 4 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#1a2028")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#65717e")}
      >
        <FileBarChart2 size={12} />
      </span>
    </div>
  );
});

export function LayerRow({ label, count, visible, onToggle, onUpload, onInspect, onZoom, onClear, onContextMenu, input, expanded, onToggleExpand, children }) {
  return (
    <div style={{ background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }} onContextMenu={onContextMenu}>
      {/* #386 — gap 9 (was 6): the zoom / filter / clear icons sat exactly on the WCAG 2.5.8 24 px spacing limit */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px" }}>
        {/* TASKS.csv #66 — inline expand (category chips + sources) without opening the full
            LayerInspector modal. Only offered once there's something to expand. */}
        {count > 0 && onToggleExpand ? (
          <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={onToggleExpand} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} title={expanded ? tr("Collapse") : tr("Expand")} aria-label={`${expanded ? tr("Collapse") : tr("Expand")} ${label}`} aria-expanded={!!expanded}>{/* #596 */}
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        ) : <div style={{ width: 13, flexShrink: 0 }} />}
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={onToggle} style={{ cursor: "pointer", color: visible ? "var(--color-accent)" : "var(--color-text-disabled)" }} title={visible ? tr("Hide layer") : tr("Show layer")} aria-label={`${visible ? tr("Hide") : tr("Show")} ${label}`}>{visible ? <Eye size={14} /> : <EyeOff size={14} />}</div>
        <div style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: visible ? "var(--color-text)" : "var(--color-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        {count > 0 && <Maximize2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(onZoom, tr("Zoom to the {label} layer", { label }))} />}
        {count > 0 && <ListFilter size={14} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(onInspect, tr("Filter / legend / sources for the {label} layer (full view)", { label }))} />}
        {/* TASKS.csv #63 — "unload" this layer's data entirely. Separate from the per-source removal
            inside the inspector (ListFilter above) — this is the "I don't want this tab's data at all
            anymore" case, the inspector handles "just pull out one of several CSVs I merged in". */}
        {count > 0 && onClear && <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(onClear, tr("Remove all data from the {label} layer", { label }))} />}
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={onUpload} style={{ cursor: "pointer", fontSize: "var(--font-size-sm)", color: count ? "var(--color-accent)" : "var(--color-text-muted)", flexShrink: 0 }} title={tr("Import CSV")} aria-label={count ? tr("Import CSV into {label} ({count} rows)", { label, count }) : tr("Import CSV into {label}", { label })}>{count ? `${count}` : <Upload size={12} />}</div>
        {input}
      </div>
      {expanded && children && (
        <div style={{ padding: "0 10px 9px 32px", borderTop: "1px solid var(--color-divider)" }}>{children}</div>
      )}
    </div>
  );
}
// TASKS.csv #66 — the inline-expand content: category chips (click to toggle, shift-click to
// isolate) for non-numeric layers, plus a compact sources list, both reusing the same
// categoryFilter/legendOverride/_src data #63 already introduced for the full LayerInspector modal.
// Deliberately terser than that modal (chips instead of rows with color pickers/labels/counts) since
// the point of this view is a quick glance + quick toggle, not the full editing surface.

export function LayerQuickPanel({ rows, meta, layerKey, categoryFilter, onToggleCategory, onIsolate, onRemoveSource, numericSym, onNumericSymChange, colorOf, labelOf }) {
  const categories = meta.numeric ? [] : distinctValues(rows);
  const sources = (() => {
    const counts = new Map();
    rows.forEach((r) => { const s = r._src || "(unlabeled)"; counts.set(s, (counts.get(s) || 0) + 1); });
    return Array.from(counts.entries());
  })();
  return (
    <div style={{ paddingTop: 8 }}>
      {meta.numeric && onNumericSymChange && (
        <NumericSymbologyEditor layerKey={layerKey} rows={rows} sym={numericSym} onChange={onNumericSymChange} />
      )}
      {!meta.numeric && categories.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: sources.length > 1 ? 8 : 0 }}>
          {categories.map(([value, count]) => {
            const hidden = categoryFilter.has(value);
            // TASKS.csv #1252 — the legend editor's colour and label, as the 3D view and the sections draw them
            const { color, label: lbl } = chipLook(value, meta, layerKey, colorOf, labelOf);
            return (
              <span role="button" tabIndex={0} onKeyDown={activateOnKey}
                key={value}
                onClick={(e) => (e.shiftKey ? onIsolate(value) : onToggleCategory(value))}
                title={tr("{lbl} ({count}) — click to toggle, shift-click to show only this one", { lbl, count })}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 10,
                  fontSize: "var(--font-size-xs)", cursor: "pointer", border: `1px solid ${hidden ? "var(--color-border-light)" : color}`,
                  color: hidden ? "var(--color-text-disabled)" : "var(--color-text)", background: hidden ? "transparent" : "var(--color-divider)",
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, opacity: hidden ? 0.35 : 1 }} />
                {lbl} <span style={{ color: "var(--color-text-muted)" }}>{count}</span>
              </span>
            );
          })}
        </div>
      )}
      {sources.length > 1 && (
        <div>
          {sources.map(([src, count]) => (
            <div key={src} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", marginBottom: 3 }}>
              <div style={{ flex: 1, minWidth: 0, color: "var(--color-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={src}>{src}</div>
              <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>{count}</span>
              <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-faint)", flexShrink: 0 }} {...iconAction(() => onRemoveSource(src), tr("Remove the {count} row(s) imported from \"{src}\"", { count, src }))} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}


// TASKS.csv #188 — Targeting module: min/max range control per voxel/block model, debounced the
// same way as GeophysicsModule's own VoxelModelRow ("Cutoff" slider) — a plain useState for the
// displayed values, only pushed to the store (which triggers ViewerModule's full InstancedMesh
// rebuild) after 150ms of no further dragging, so a slider drag doesn't rebuild a model that can be
// tens of thousands of instances on every pixel of movement. `threshold` is the pre-existing lower
// bound (GeophysicsModule's Cutoff); `rangeMax` is the new upper bound this task added — together
// they isolate a BAND (e.g. "just my IP high", "just my mag low"), not just a single cutoff.
// TASKS.csv #1780 (review #1646, Kodiak) — `compact` leaves out the name / eye line (the Geophysics card has its own); `onShell`
// adds "Shell at this range" (a closed solid of the cells in the band, lib/voxelShell.js); a model imported with log colours
// (model.logScale) gets log-stepped sliders: a linear step over 15-15,000 ohm.m put 2-3 positions in the 100-600 ohm.m range.
export function VoxelRangeRow({ model, onUpdate, compact = false, onShell = null, others = null }) {
  const sameCells = others ? coincidentModels(model, others) : []; // TASKS.csv #1808 — drawn into each other
  // TASKS.csv #2073 (review #2013, Geophysics) — a model whose colour range is narrower than its cells (an inversion voxel stretched over the
  // 2nd-98th percentile) showed three maxima: the Max box 8,801 (rangeMax = the largest cell, set by addVoxelModel), the slider's end 1,385
  // and 'Range' 1,385. The boxes now show the band inside the model's range; at the ends the stored bound is the cells' own extent, so no
  // cell beyond the colour range is hidden.
  const ext = useMemo(() => { let lo = Infinity, hi = -Infinity; for (const c of model.cells || []) { if (c.value < lo) lo = c.value; if (c.value > hi) hi = c.value; } return { lo: Math.min(lo, model.min), hi: Math.max(hi, model.max) }; }, [model.cells, model.min, model.max]);
  const shown = (v, fallback) => Math.min(Math.max(Number.isFinite(v) ? v : fallback, model.min), model.max);
  const storeMin = (v) => (v <= model.min ? ext.lo : v), storeMax = (v) => (v >= model.max ? ext.hi : v);
  const [dispMin, setDispMin] = useState(shown(model.threshold, model.min));
  const [dispMax, setDispMax] = useState(shown(model.rangeMax, model.max));
  const useLog = !!model.logScale && model.min > 0 && model.max > model.min;
  const toS = (v) => (useLog ? Math.log10(Math.max(model.min, v)) : v), fromS = (s) => (useLog ? 10 ** s : s);
  const sMin = toS(model.min), sMax = toS(model.max), sStep = (sMax - sMin) / 200 || 0.01;
  const debounceRef = useRef(null);
  const push = (patch) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { debounceRef.current = null; onUpdate(model.id, patch); }, 150);
  };
  // TASKS.csv #1283 — the sliders follow the store when the band is changed elsewhere (the Geophysics Cutoff slider, a
  // project load, Undo): ViewerModule never unmounts, so the mount-time copy went stale and the pane counted cells the 3D
  // view was not drawing. Not while this row's own 150 ms push is pending, or the thumb would jump back under the mouse.
  useEffect(() => {
    if (debounceRef.current) return;
    setDispMin(shown(model.threshold, model.min));
    setDispMax(shown(model.rangeMax, model.max));
  }, [model.threshold, model.rangeMax, model.min, model.max]);
  const onMinInput = (v) => { setDispMin(v); push({ threshold: storeMin(v) }); };
  const onMaxInput = (v) => { setDispMax(v); push({ rangeMax: storeMax(v) }); };
  const reset = () => { setDispMin(model.min); setDispMax(model.max); onUpdate(model.id, { threshold: ext.lo, rangeMax: ext.hi }); };
  const bandLo = storeMin(dispMin), bandHi = storeMax(dispMax); // what the 3D view applies
  const visibleCount = model.cells.filter((c) => c.value >= bandLo && c.value <= bandHi && voxelCellSupported(model, c)).length;
  const isFiltered = dispMin > model.min || dispMax < model.max;
  const isBand = isFiltered && isTargetModel({ ...model, threshold: bandLo, rangeMax: bandHi }); // #1832 — a cutoff that only hides air is no band
  const [largestOnly, setLargestOnly] = useState(false); // TASKS.csv #1840 — one target body, not every speck in the range
  return (
    <div style={compact ? { marginTop: 6, fontSize: "var(--font-size-base)" } : { marginTop: 8, padding: "8px 9px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)" }}>
      {!compact && <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onUpdate(model.id, { visible: model.visible === false })} style={{ cursor: "pointer", color: model.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }} title={model.visible !== false ? tr("Hide") : tr("Show")}>
          {model.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
        </div>
        <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{model.name}</div>
        {isBand && <span style={{ color: "var(--color-info)", fontSize: "var(--font-size-xs)", flexShrink: 0 }} title={tr("A range filter is active on this model")}>{tr("band")}</span>}
      </div>}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
        <span style={{ color: "var(--color-text-faint)", width: 30, flexShrink: 0 }}>{tr("Min")}</span>
        <input type="range" min={sMin} max={sMax} step={sStep} value={toS(dispMin)} onChange={(e) => onMinInput(Math.min(fromS(Number(e.target.value)), dispMax))} style={{ flex: 1, minWidth: 0 }} title={useLog ? tr("Log-stepped: the model's values span decades") : undefined} />
        <VoxelRangeNumber value={dispMin} label={tr("Lowest value shown of \"{name}\"", { name: model.name })} onCommit={(v) => { const x = Math.min(Math.max(v, model.min), dispMax); setDispMin(x); onUpdate(model.id, { threshold: storeMin(x) }); }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
        <span style={{ color: "var(--color-text-faint)", width: 30, flexShrink: 0 }}>{tr("Max")}</span>
        <input type="range" min={sMin} max={sMax} step={sStep} value={toS(dispMax)} onChange={(e) => onMaxInput(Math.max(fromS(Number(e.target.value)), dispMin))} style={{ flex: 1, minWidth: 0 }} title={useLog ? tr("Log-stepped: the model's values span decades") : undefined} />
        <VoxelRangeNumber value={dispMax} label={tr("Highest value shown of \"{name}\"", { name: model.name })} onCommit={(v) => { const x = Math.max(Math.min(v, model.max), dispMin); setDispMax(x); onUpdate(model.id, { rangeMax: storeMax(x) }); }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
        <span>{tr("Showing {visibleCount} of {cells} cell(s)", { visibleCount: visibleCount.toLocaleString(), cells: model.cells.length.toLocaleString() })}</span>
        {isFiltered && <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={reset} style={{ cursor: "pointer", color: "var(--color-info)" }}>{tr("Reset")}</span>}
      </div>
      {sameCells.length > 0 && ( // TASKS.csv #1808 (review #1646, Kodiak) — two inversions on one mesh drew a mosaic of two palettes
        <div style={{ marginTop: 4, fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", lineHeight: 1.35 }}>
          {tr("Drawn in the same cells as {names}: the two colour each other's blocks. Show one at a time to read it.", { names: sameCells.map((m) => `"${m.name}${m.property ? ` (${m.property})` : ""}"`).join(", ") })}{" "}
          <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onUpdate(model.id, { visible: false })} style={{ cursor: "pointer", color: "var(--color-info)", textDecoration: "underline" }}>{tr("Hide this one")}</span>
        </div>
      )}
      {onShell && isFiltered && visibleCount > 0 && ( // TASKS.csv #1780 — the band as a closed solid for targeting and sections
        <>
        <label style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer" }} title={tr("Keep only the biggest connected body of this range; smaller, separate bodies are left out of the solid.")}>
          <input type="checkbox" checked={largestOnly} onChange={(e) => setLargestOnly(e.target.checked)} />{tr("Largest body only")}
        </label>
        <button type="button" onClick={() => onShell(model, { largestOnly })} style={{ ...miniBtn, marginTop: 5, width: "100%", justifyContent: "center" }} title={tr("A closed solid around the cells in this range (marching cubes on the model's grid), added to the generated surfaces: the chargeability high or the resistivity low as a body to section, query and target.")}>{tr("Shell at this range → generated surfaces")}</button>
        </>
      )}
    </div>
  );
}


export const miniBtn = { width: 60, padding: "5px 0", borderRadius: 6, fontSize: "var(--font-size-sm)", cursor: "pointer", border: "1px solid var(--color-border-light)", background: "var(--color-bg-subtle)", color: "var(--color-text-secondary)" };
export const iconBtn = { width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", cursor: "pointer" };
export const miniField = { flex: 1, display: "flex", flexDirection: "column", gap: 3, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
