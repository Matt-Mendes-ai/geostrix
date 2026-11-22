// TASKS.csv #3904 (platform redesign, P2) — the 3D Modelling, Mine Design and Targeting ribbons, moved out of ViewerModule.jsx unchanged (its
// #1084 size cap, to make room for the guided tools): the same buttons, order, labels, handlers and Simple / Advanced flags. One component for the
// three, since one mode shows at a time; the Geological Mapping ribbon is SurfaceRibbon (ViewerParts.jsx). Mine Design stays hidden by lib/features.js.
import React from "react";
import { Ribbon, RibbonGroup, RibbonButton } from "../../components/Ribbon.jsx"; // TASKS.csv #458
import { Pickaxe, Layers, Group, Droplets, Waves, Gem, Calculator, Settings, FileSpreadsheet, Globe, Spline, PenTool, Rows3, Crosshair, Target, Map as MapIcon, Mountain, Layers3, MapPin, Box, Compass, Activity, Ruler, Waypoints, GitCompare, Sparkles, SquareSplitVertical } from "../../components/icons.js";

export default function ModeRibbons({ mode, show, paneProps, simpleTools, project, plannedHoles, pickHoleMode, setPickHoleMode, setToolPane, exportPlannedHoles, setTadpoleOpen, setCoreOrientOpen, setVariogramOpen, setFenceOpen, setSurfaceQueryOpen, setStereonetOpen }) {
  return (<>
    {/* TASKS.csv #458 — 3D Modelling ribbon: each modelling tool opens as a pane at the top of the sidebar
        (the generated surfaces and domains stay below it); the analysis plots open directly. */}
    {mode === "modelling" && (
      <Ribbon show={show} label="3D Modelling tools">
        <RibbonGroup label="Setup">{/* #3153 — Model settings in Simple too: every modelling tool reads it */}
          <RibbonButton icon={Settings} label="Model settings" tone="model" title="Domain, intercept set, contact orientations, resolution, stiffness, search ellipsoid, anisotropy" {...paneProps("settings")} />
          <RibbonButton advanced={!simpleTools.strat} icon={Group} label="Litho groups" tone="model" title="Lump lithology codes into modelling units" {...paneProps("groups")} />
          <RibbonButton advanced={!simpleTools.strat} icon={Waypoints} label="Modelling codes" tone="model" title="Give intervals modelling codes (alternating flows), connect units between holes, set roles and pile order" {...paneProps("mcodes")} />
          <RibbonButton advanced icon={GitCompare} label="Correlation" tone="model" title="Section correlation" {...paneProps("correlation")} />
        </RibbonGroup>
        {/* TASKS.csv #3905 (redesign P3) — groups named for what is built: Setup · Surfaces · Volumes · Veins and dykes · Faults and structure · Grade
            · Check; the engine (GemPy, geoML) is named inside each pane (it replaces the GemPy / explicit / geoML groups of #750 and #811). The
            buttons, handlers and Simple / Advanced flags are as before: a split group's flag stays on the group that would be empty in Simple. */}
        <RibbonGroup label="Surfaces">
          <RibbonButton icon={Mountain} label="Implicit surface" tone="model" title="Model one unit's top surface (GemPy)" {...paneProps("implicit")} />
          <RibbonButton advanced={!simpleTools.strat} icon={Layers} label="Strat. stack" tone="model" title="Model a stratigraphic stack of units together (GemPy)" {...paneProps("stack")} />
          <RibbonButton advanced={!simpleTools.mapModel} icon={MapIcon} label="Model from map" tone="model" title="A 3D model from the geological map and outcrop measurements alone, no drillholes needed (GemPy)" {...paneProps("mapmodel")} />{/* TASKS.csv #817 */}
          <RibbonButton icon={PenTool} label="Explicit surface" tone="model" title="A surface exactly through your own picks in 3D and lines drawn on sections" {...paneProps("explicit")} />
        </RibbonGroup>
        <RibbonGroup advanced={!simpleTools.geoml} label="Volumes">
          <RibbonButton advanced icon={Droplets} label="Alteration" tone="model" title="Alteration modelling" {...paneProps("alteration")} />
          <RibbonButton icon={Sparkles} label="geoML models" tone="model" title="Rock-unit and grade models with uncertainty (geoML, Gaussian processes — optional add-on)" {...paneProps("geoml")} />
        </RibbonGroup>
        <RibbonGroup advanced label="Veins and dykes">
          <RibbonButton icon={Waves} label="Veins / dykes" tone="model" title="Vein / dyke modelling" {...paneProps("vein")} />
        </RibbonGroup>
        <RibbonGroup label="Faults and structure">{/* TASKS.csv #4006 — Faults, in Simple too, opens every fault tool in one pane; the group's old Simple flag (#2773) is now Stereonet's own */}
          <RibbonButton icon={SquareSplitVertical} label="Faults" tone="model" title="Every fault tool in one place: fault surfaces from picks, mapped faults and drawn lines, faults in a model, and the checks" {...paneProps("faults")} />
          <RibbonButton advanced icon={Compass} label="Structures" tone="model" title="Structural modelling from structure picks" {...paneProps("structural")} />
          <RibbonButton advanced={!simpleTools.stereonet} icon={Target} label="Stereonet" tone="analyse" title="Stereonet of structure picks (and outcrop measurements)" disabled={!simpleTools.stereonet} disabledReason="No structure picks with an orientation, nor outcrop measurements, yet." onClick={() => setStereonetOpen(true)} />{/* #2773 */}
          <RibbonButton advanced icon={Activity} label="Downhole plot" tone="analyse" title="Downhole structure (tadpole) plot" onClick={() => setTadpoleOpen(true)} />
          <RibbonButton advanced icon={Crosshair} label="Core orient." tone="analyse" title="Core orientation (alpha-beta) calculator for non-oriented core" onClick={() => setCoreOrientOpen(true)} />
        </RibbonGroup>
        <RibbonGroup label="Grade">
          <RibbonButton icon={Gem} label="Grade shell" tone="model" title="Numeric implicit model (grade shell)" {...paneProps("shell")} />
          <RibbonButton icon={Calculator} label="Estimation" tone="model" title="Grade estimation into block models" {...paneProps("gradeEst")} />
          <RibbonButton advanced icon={Spline} label="Variogram" tone="analyse" title="Variogram / spatial continuity" onClick={() => setVariogramOpen(true)} />
        </RibbonGroup>
        <RibbonGroup advanced label="Check">
          <RibbonButton icon={Rows3} label="Fence diagram" tone="analyse" title="Fence / panel correlation diagram" onClick={() => setFenceOpen(true)} />
          <RibbonButton icon={Ruler} label="Surface query" tone="analyse" title="Distance to surfaces / point-in-domain report" onClick={() => setSurfaceQueryOpen(true)} />
        </RibbonGroup>
      </Ribbon>
    )}
    {/* TASKS.csv #458 — Targeting ribbon */}
    {mode === "minedesign" && (
      <Ribbon show={show} label="Mine design tools">
        <RibbonGroup label="Open pit">{/* #3003 (5), Matt: Simple shows the open-pit flow — Pit shell, Pit design, Dump */}
          <RibbonButton icon={Pickaxe} label="Pit shell" tone="model" title="The pit that makes the most money at your prices and costs, from a block model" {...paneProps("pit")} />
          <RibbonButton advanced icon={Layers} label="Nested pits" tone="model" title="The shell at a series of revenue factors, valued at the entered price, with a schedule and an NPV per shell" {...paneProps("nested")} />{/* TASKS.csv #1875 */}
          <RibbonButton icon={Layers3} label="Pit design" tone="model" title="Benches, berms and faces on a pit shell: crest and toe strings and a bench-by-bench table" {...paneProps("pitdesign")} />{/* TASKS.csv #1874 */}
          <RibbonButton icon={Mountain} label="Dump / stockpile" tone="model" title="A footprint string, a crest and an angle of repose: the dump's shape on the ground and what it holds, against a pit's waste" {...paneProps("dump")} />{/* TASKS.csv #1880 */}
        </RibbonGroup>
        <RibbonGroup label="Underground">{/* #3003 (5): Drifts and ramps stay Advanced; TASKS.csv #3798 (Matt, 2026-11-16): Stope outlines and Strings show in Simple, always */}
          <RibbonButton advanced icon={Spline} label="Drifts and ramps" tone="model" title="Draw drifts, tunnels, ramps and declines at set grades, with curves of a chosen radius" {...paneProps("lines")} />
          <RibbonButton icon={Layers3} label="Stope outlines" tone="model" title="A block model at a cut-off, level by level: stope outlines and solids no thinner than a mining width, with a dilution skin" {...paneProps("stopes")} />{/* TASKS.csv #1879 */}
        </RibbonGroup>
        <RibbonGroup label="CAD">{/* TASKS.csv #1876 / #1877; Simple: #3798 (Dump needs Strings) */}
          <RibbonButton icon={PenTool} label="Strings" tone="model" title="Free polylines and polygons in 3D: draw, type, offset, join and split them; extrude or loft closed ones into solids; DXF in and out" {...paneProps("strings")} />
        </RibbonGroup>
      </Ribbon>
    )}
    {mode === "targeting" && (
      <Ribbon show={show} label="Targeting tools">
        <RibbonGroup label="Targets">
          <RibbonButton advanced icon={Box} label="Voxel ranges" tone="view" title="Isolate a value band of a geophysical / block model" {...paneProps("ranges")} />
          <RibbonButton icon={Layers} label="Evidence overlay" tone="model" title="Where the evidence agrees: fuzzy overlay of rasters, map-layer distances and geochemistry; weights of evidence against known occurrences" {...paneProps("overlay")} />{/* TASKS.csv #851 */}
          <RibbonButton icon={Crosshair} label="Undrilled zones" tone="model" title="The parts of a modelled unit farther than a chosen distance from every drillhole" {...paneProps("undrilled")} />
          <RibbonButton icon={Target} label="Planned holes" tone="model" title="Design planned drillholes and check them" {...paneProps("plan")} />
          <RibbonButton icon={MapPin} label="Pick collar" tone="model" active={pickHoleMode} title="Click the 3D view to place a planned hole's collar" onClick={() => { setToolPane("plan"); setPickHoleMode((v) => !v); }} />
        </RibbonGroup>
        <RibbonGroup label="Export planned holes">
          <RibbonButton icon={FileSpreadsheet} label="CSV" tone="output" disabled={!plannedHoles.length} disabledReason="Plan a hole first" title="Collar and toe in project coordinates and lat/lon, azimuth against grid, true and magnetic north" onClick={() => exportPlannedHoles("csv")} />
          <RibbonButton advanced={project?.crsSet === false} /* #2705 — Simple mode too with a real CRS */ icon={Globe} label="KML" tone="output" disabled={!plannedHoles.length} disabledReason="Plan a hole first" title="Google Earth / phone maps" onClick={() => exportPlannedHoles("kml")} />
          <RibbonButton advanced={project?.crsSet === false} icon={MapPin} label="GPX" tone="output" disabled={!plannedHoles.length} disabledReason="Plan a hole first" title="Handheld GPS: collar waypoints" onClick={() => exportPlannedHoles("gpx")} />
        </RibbonGroup>
      </Ribbon>
    )}
  </>);
}
