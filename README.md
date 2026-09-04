# GeoStrix

Desktop 3D drillhole & geochemistry explorer (Electron + React + three.js). Formerly developed
under the working name "GeoExplorer" — some file/type names (`.geox.json`, internal module names)
still reflect that and are not worth churning just for the rename.

## What GeoStrix is not

GeoStrix is an exploration visualisation and targeting tool. It is **not** resource-estimation
software, and nothing it produces is a Mineral Resource under NI 43-101, JORC or any comparable code.

Specifically, the grade-estimation and grade-shell tools:

- interpolate with **nearest-neighbour or inverse-distance weighting only** — there is no kriging, no
  fitted variogram, and no anisotropy or trend: the search is a plain isotropic sphere;
- apply **no classification** (Measured/Indicated/Inferred is a Qualified Person's professional
  judgement, not something derivable from a search radius — GeoStrix deliberately does not offer it);
- apply **no dilution, no mining or metallurgical recovery, and no moisture**: tonnages are in-situ,
  dry and undiluted, at a bulk density *you* assume rather than one measured by domain;
- optionally close a grade shell **artificially at the search-radius boundary** — when you do that,
  part of the resulting solid's boundary is your search radius, not a grade boundary, and its volume
  scales roughly with the cube of that radius;
- honour a geological domain only if you explicitly ask them to, and cap high grades only if you
  enter a cap.

Every one of those is a parameter choice, not a property of your data. Treat the outputs as a way to
see where mineralisation might extend and where to drill next. Public disclosure of any tonnage or
grade figure requires an estimate prepared by a Qualified Person. (See TASKS.csv #257–#270 for the
NI 43-101 QP specialist review these caveats came out of.)

## Branding

`build/icon.png` is the 1024px master app icon — a flat, minimal Strix owl-head mark (PostgreSQL-
blue #336791, amber eyes, transparent background — the body color was deliberately lightened from
an earlier dark-navy version to match Postgres's own elephant-mascot blue), replacing an even
earlier, more photorealistic owl-over-cross-section design. The `.ico`/`.icns` next to it are
generated from it (`png2icons`, multi-resolution)
and wired into `package.json`'s electron-builder config for the Windows/Mac installers, plus set as
the `BrowserWindow` icon in `electron/main.js` so a plain `npm run dev` run shows it too.
`assets/GeoStrix_Logo.png` is the same image at full resolution for any other branding use (splash
screens, marketing, etc.); `assets/geostrix-mark-64.png` is a small pre-shrunk copy for anywhere a
tiny mark is more useful than resizing the full master on the fly; `public/favicon.png` (256px) is
the browser-tab icon for the plain-browser/dev-preview path. The UI's single most-visible accent
color (visibility toggles, active states, the drag-drop highlight, the progress bar) is the same
gold/amber family as the icon's eyes — the rest of the dark-navy palette was already close enough to
leave alone.

## Running in development

```bash
npm install
npm run dev
```

This starts Vite and launches the Electron window with hot-reload. The app also runs in a plain
browser at http://localhost:5173 (file-save falls back to browser downloads; the cross-section
pop-out falls back to a new tab).

### Optional: Python sidecar

Some geoprocessing features (currently: a generic RBF/IDW interpolation endpoint, a stepping stone
toward implicit lithology modelling) run through a local Python server instead of JS, since Python's
scientific stack (scipy, and eventually GemPy for implicit modelling — see TASKS.csv) is a better fit
for that math than hand-rolling it in JS. It's optional — the app works fully without it, those
specific features just won't be available.

```bash
cd python-sidecar
pip install -r requirements.txt
```

Electron spawns/kills it automatically alongside the app (`electron/main.js`) — you don't need to
run it manually, just have the dependencies installed and `python3` (or `python` on Windows) on
your PATH. See `python-sidecar/README.md` for details, including running it standalone for testing.

## Building an installer

```bash
npm run build          # full installer for your OS (NSIS on Windows, dmg on Mac, AppImage on Linux)
npm run build:dir      # unpacked app folder, faster, no installer
```

Output lands in `release/`. On Windows this gives you a `GeoStrix Setup 0.1.0.exe` you can run.
Note: the Python sidecar isn't bundled into the installer yet (TASKS.csv) — a packaged build runs
without it until that's done, same graceful degradation as not having Python installed in dev.

The web bundle is code-split by vendor package (`vite.config.js`, TASKS.csv #35): `three`,
`geotiff`, `papaparse`, `lucide-react`, and `react`/`react-dom` each land in their own chunk,
separate from app code and from each other. This keeps slow-changing third-party code cacheable
across app updates and keeps any single chunk well under Rollup's 500 kB warning threshold — the
3D viewer's `three` dependency is the largest chunk at ~485 kB, since it's the one genuinely heavy
piece and nothing else in the app needs it.

## Architecture

- `electron/main.js` — main process: windows, menus, PDF export, file dialogs, cross-section
  pop-out, section→Layout snapshot relay, Python sidecar process lifecycle
- `electron/preload.js` — safe IPC bridge exposed as `window.desktop`
- `python-sidecar/` — optional local FastAPI server for Python-side geoprocessing (see above)
- `src/lib/store.jsx` — shared project state (holes, layers, assays, EPSG, viewer UI state, Layout
  snapshot queue) across modules
- `src/lib/desktop.js` — desktop capability shim (browser fallbacks when not in Electron)
- `src/lib/geochem.js` — element detection, oxide conversion, diagram projections, classifications
- `src/lib/desurvey.js` — minimum-curvature desurvey (shared viewer + section)
- `src/modules/` — the four modules: Viewer, Geochem, Geophysics, Layout
- `src/components/` — plot renderer, import modal, cross-section window, compass rose, error boundary

## Modules

**3D View** — the sidebar is split into two Excel-ribbon-style tabs, Home and Modeling. Home:
import collars/survey/lithology CSVs or connect directly to a database (drag-and-drop multiple CSVs
at once — each auto-detects its target layer, only asking when it's not confident), orbit/pan/zoom
(middle-mouse pan, right-click "zoom to selected area" rectangle-drag), a 3D-aware compass rose for
one-click cardinal views, an adjustable ground or 3D reference grid, draw a cross-section on plan
view (carries every visible layer across, with an adjustable buffer) → opens a separate window,
"Snapshot to Layout" to capture the current view onto a Layout page, and saved "themes" (named
bundles of layer/filter/grid/camera state you can reapply or bind to a Layout Viewport element —
TASKS.csv #45). Each layer row can be cleared entirely, and its inspector (the filter icon) can show
all/hide all/isolate a single category in one click plus break a layer down by which imported CSV
each row came from, with per-file removal (#63) — right-click a layer row for a quick menu (zoom to
layer, show/hide, clear, sort into a named group — #72/#76). Layers can be folded into user-named,
collapsible groups (a "+ Group" button above the Layers section, sorted via that same right-click
menu) for projects with a lot of imported layers — bulk show/hide per group too (#76). A "Run data
QC…" button checks collars/survey/every layer for the kinds of problems that quietly distort a
modelled surface — orphaned hole references, invalid or out-of-range azimuth/dip, overlapping or
duplicate intervals, an interval extending past a hole's own recorded length, an implausible
survey-station-to-station trajectory jump, and more — severity-tagged and filterable, before you get
as far as modelling (#82; see "Geological modelling architecture" below for where this fits). A
"Boundary intercepts…" button next to it opens a filterable table of every litho/alteration interval's
top — the same control points the Modeling tab's tools already read — resolved to a real 3D position
along each hole's desurveyed trace, with a checkbox to exclude/re-include individual ones from feeding
a modelling run (without touching the imported data itself) and a CSV export (#84). A "Search ellipsoid"
control on the Modeling tab lets you declare a structural trend (azimuth/dip + major/semi-major/minor
ranges) and a minimum neighbor count — control points too isolated along that trend get dropped before
a run instead of silently averaged in; GemPy fits one global surface rather than per-query local
kriging, so this filters which points are trusted going in rather than steering the interpolator's own
search (#85). An "Anisotropy" control (same azimuth/dip + ranges idea, with a "Copy from search
ellipsoid" shortcut) warps every coordinate into a normalized space where the declared ellipsoid becomes
a sphere before a surface is fit, then warps the result back — the standard way to get a vein or other
directionally-continuous feature to behave differently along strike than across it, out of an
interpolator that's otherwise isotropic (#86). A "Clip result to domain boundary" checkbox next to the
Domain selector removes any generated triangle that pokes outside the selected domain, since #89 only
restricts which control points feed a run — GemPy still fits/extrapolates across the whole extent
regardless (#88's boundary constraint). And a "soft" toggle per row in the Boundary intercepts table
sets a real GemPy nugget tolerance instead of excluding the point outright — a pick you trust less gets
approximately honoured rather than forced through exactly (#88's soft constraint). Modeling:
four first-pass implicit-modelling tools
via GemPy in the Python sidecar (which now pre-imports gempy in the background as soon as it starts,
instead of paying that cost on your first modelling click — #62),
all sharing one core (which caps the modelling extent at 500m past the actual drillhole data on every
axis, however widely spread the property is, so GemPy isn't asked to extrapolate far enough past real
data to fold a surface back on itself into a spurious self-wrapping shape) and listing their output
together — top-of-unit contacts from lithology (#29),
a stratigraphic stack of several units modelled together with guaranteed non-crossing surfaces
(#61), a fault/shear surface from one structure-plane type using each pick's own dip/azimuth (#30),
and an alteration-halo surface from one assemblage (#55). A status-bar progress indicator and a
floating toast over the viewport show a run's progress/result regardless of sidebar scroll position.
Each generated surface can be given a geological type (stratigraphic contact / fault / mineralization
envelope / alteration envelope / unconformity / intrusive contact) and declared relationships to other
surfaces (below/above/within/truncates/terminates against/cuts/must-not-cross) via an expandable
section on its row — metadata for now (#83; see "Geological modelling architecture" below), not yet
enforced or persisted. Any surface typed "Fault" can back one or more named **domains** — an AND of
fault-side constraints, so a domain can be bounded between two faults rather than only splitting the
property in two — built and edited in their own "Domains" section; a shared "Domain" selector at the
top of the Modeling tab then restricts all four modelling tools to just that domain's control points
(fault side determined by nearest-vertex classification against the fault's own generated mesh) — #89.

**Geochem** — import assays or pXRF, plot on TAS / Winchester-Floyd / AFM / Alteration Box Plot /
Jensen / Th-Nb-Yb / Pearce Ti-Zr-Y / Th-Hf-Ta / two PER (Pearce Element Ratio) mass-change diagrams
(#20, #22), or as a chondrite-normalized REE or primitive-mantle-normalized multi-element spider plot
(every sample drawn as its own line, capped at 250 for readability — #20). Colour by hole or element,
generate lithology/alteration layers from geochemistry, export plots (PNG/SVG) and data (CSV). An
"Isocon / mass-change calculator" (#23) implements Grant (1986)'s isocon method: average a precursor
and an altered interval group, pick immobile elements, and it computes the isocon slope and a
per-element %mass-change table (exportable to CSV) — the numeric counterpart to the PER diagrams above.
A "Correlation matrix" tool (#21) computes Pearson r between a chosen subset of elements (pairwise
deletion for missing data) as a red-white-blue heatmap, exportable to CSV. Assays/pXRF also import by
dragging a CSV onto the module (#78 — filename heuristic picks assay vs pXRF), matching the Viewer and
Geophysics modules' existing drag-drop.

**Geophysics** — CSV point-cloud import (x/y/z/value — mag, IP, gravity, radiometrics, whatever) and
GeoTIFF raster drape (single-band grids colour-mapped, or RGB orthophotos, up to 2048px on the longest
side before downsampling — #71), both co-visualized in the same 3D scene as drillholes (#25, #24) —
each raster gets an adjustable elevation and opacity. Also imports a georeferenced elevation GeoTIFF
(SRTM or any other DEM) as real terrain geometry instead of a flat ground plane (#77 — one terrain
surface per project, downsampled to a modest mesh resolution regardless of source size); any raster
drape can then optionally conform to that terrain instead of sitting at a fixed elevation ("Drape on
terrain" per raster — #81). Also imports Geosoft .gxf grids as a raster drape (#26 — the plain-text
Geosoft interchange format, publicly documented unlike the proprietary binary .grd, which stays
unsupported; handles #SENSE 1/-1 row ordering and rejects rotated grids explicitly rather than
misplacing them). A "Spatial analysis" panel (#51) builds a Delaunay/Voronoi tessellation of the
loaded point cloud and reports polygonal declustering statistics (naive vs. area-weighted mean and
std dev — the standard correction for clustered-sample bias, Isaaks & Srivastava's polygonal
method), with a colour-mapped cell map and per-cell CSV export. Voxel/block models (#27/#28) — a
publicly-documented UBC-GIF tensor mesh + model (.msh/.mod), or a block-model CSV export (the
common Datamine/Micromine/Surpac/Vulcan/Leapfrog interchange format, since Geosoft's own voxel
format is proprietary with no public spec) — render as coloured 3D blocks with an adjustable value
cutoff and opacity, sharing one InstancedMesh-based renderer regardless of which importer produced
the cells. Shapefile/GeoPackage import is next.

**Layout** — an icon-only "Add element" toolbar (name on hover — #65) for drag-and-drop page furniture
(title, legend, scale, north, logo) plus 3D-viewport and cross-section snapshots, a "Viewport" element
bound to a saved theme (customizable frame/rotation, with an auto-computed scale — supports any number
of viewport elements per page, each independently refreshed/rebound — #74), an optional alignment
grid with snap-to-grid dragging plus simple mm-tick rulers along the page edges, a "Sync north arrow"
button that rotates the north arrow to match a bound viewport's actual camera heading (#67), and a
legend element whose rows (color/name/order) are fully editable from the sidebar (#73) → export PDF
(print-isolated to just the Layout page). **Multiple pages per project** (#69) — a page-tab bar above
the canvas to add/switch/rename/delete pages, each with its own independent set of elements; older
project files with a single page open unchanged (wrapped as "Page 1"). A viewport's scale defaults to
an approximate perspective-camera estimate (exact only at the camera's focus distance); checking
"True scale" on a viewport switches its capture to an orthographic camera instead (#69 — reuses the
same framing as the perspective preview, but with no depth-dependent foreshortening), making the
reported scale exact across the whole image rather than an estimate. The page's contents live in the
shared project store, not the module's own local state, so they survive switching tabs (including the
Viewer round-trip a Viewport add/refresh itself triggers) and round-trip through project save/load
(#68) — the pending-request bookkeeping for that round-trip also lives in the store rather than a
component ref, fixing a follow-on bug where adding or refreshing a viewport could silently do nothing
(#70). Shapes/annotation tools (#19) add rectangle, arrow, callout, and a one-shot freehand pen (drag
on the page to draw, mirroring the cross-section contact-drawing interaction) to the palette — all
just more page elements, so they drag/save/export for free alongside everything else. "Save page as
template" / "Load template" (#18) lets a page layout be saved under a name and reused as a starting
point for a later page (project-scoped, like themes). Dragging an image file onto the page (#78) adds
it as a normal image element, sized to its real aspect ratio at the actual drop point.

**Cross-sections** are drawn from the Viewer's "Draw cross-section" plan-view tool and open in their own
window, carrying every currently-visible layer across with an adjustable buffer. Every drawn section is
auto-saved to the project (a "Cross-sections" list in the Viewer's Home sidebar to reopen/rename/delete
one later) so a "Draw contact" tool in the section window can build interpreted lithological (or other)
contact polylines by clicking points along the section — stored in real-world coordinates so they redraw
correctly on reopen regardless of which holes/layers happen to be visible at the time, and persisted
through project save/load. Feeding those drawn contacts into 3D surface generation as extra control
points is a planned follow-up, not built yet. The pop-out also exports directly to PNG/SVG/PDF (#14)
— PDF reuses the same generic printToPDF handler as the Layout page's export, just aimed at whichever
window is focused — so a section doesn't need a Snapshot-to-Layout round trip just to get a file out.
Multiple sections can be open simultaneously, each its own window (#13 — reopening the same section
twice now focuses the existing window instead of silently spawning a duplicate that could drift out of
sync). A "VE" field controls vertical exaggeration (#15) — VE=1 is genuine 1:1 scale (vertical and
horizontal axes read at the same real-world-units-per-pixel rate); the page's height follows from that
rather than a fixed box quietly picking whatever ratio fit, so how exaggerated a view is is now always
knowable from the number in the box, and exports (PNG/PDF/SVG/Snapshot) all match whatever VE is set.

## Database connector

File → Connect database (or the button in the 3D View sidebar). Connects directly to a Postgres
database — the same one a tool like DBeaver would point at — rather than going through DBeaver
itself. Test the connection, browse tables, run a query, then "Import these rows" routes straight
into the same column-mapping dialog every CSV import uses. Passwords are used for that session only;
never written to disk or into a saved project file — only host/port/database/user are remembered.

## Save / Open / New Project

File menu or the toolbar. Saves to a `.geox.json` file (version 6): project settings, collars,
survey, every layer, assays, custom layers, per-layer visibility/filter/legend-color/grid choices,
saved themes, GeoTIFF raster drapes, the terrain surface, named layer groups, and the Layout page's
contents (older pre-v6 saves still open fine and just fall back to defaults for whichever of these
they predate).

**Autosave / crash recovery** (#33) runs alongside the real Save — every 60s, while there's actually
something to lose, the current project is silently written to a fixed recovery file (no save dialog,
and not the same as a real Save). If GeoStrix is ever closed uncleanly — a crash, force-quit, or power
loss before hitting Save — the next launch shows a dismissable banner offering to restore that snapshot
or discard it; nothing is ever swapped in without the user choosing to. A real Save, Open, or New
Project all clear the recovery snapshot, since at that point it's either redundant or stale.

**Workspace tabs** (#34) — New Project and Open Project each open into their own tab (shown in the bar
just below the toolbar) instead of replacing whatever's already open, so several projects can stay
loaded side by side and switching between them is one click. A dot on a tab marks unsaved changes;
closing a dirty tab (or quitting with one open) asks for confirmation first.

## Keyboard shortcuts

Help > Keyboard Shortcuts (or Ctrl/Cmd+/) lists the real, current set — File (Ctrl/Cmd+N/O/S/I/P),
module navigation (Ctrl/Cmd+1-4 for 3D View/Geochem/Geophysics/Layout), Ctrl/Cmd+Shift+C for a
cross-section pop-out, Ctrl/Cmd+Z/Shift+Z for undo/redo, and standard zoom controls (#32). Kept next
to electron/main.js's own Menu template so the reference can't silently drift from what's actually
wired up.

## Undo / redo

Toolbar buttons or Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z (#31) step back/forward through content changes —
imports, deletes, moves, edits — across collars, survey, every layer, assays, custom layers, the
Layout page, cross-sections, raster drapes, terrain, and layer groups. Snapshot-based (up to 60 steps,
debounced so a drag gesture is one undo step, not one per pixel) rather than a hand-tracked action log,
so it doesn't need every mutation site instrumented individually. Deliberately has no global keyboard
accelerator at the Electron menu level — that would hijack Ctrl+Z away from every plain text field's
own native undo; the real shortcut is a renderer-side listener that checks what's focused first and
steps aside for text-field undo when appropriate.

## Sample data

`sample_data/` has a small synthetic 6-hole dataset (collars through assays, every import type) for
trying out the app without your own data — see `sample_data/README.md`.

## Geological modelling architecture (roadmap)

Today's implicit modelling (#29/#30/#55/#61) treats each surface as an independent GemPy run, though
it can now declare its own geological meaning and relationships to other surfaces, and can optionally
be restricted to one fault-bounded domain — see below. TASKS.csv #82–#94 records a 12-layer target
architecture (plus one exploratory follow-on) for turning that into a real geological modelling
system, in priority order: (1) drillhole data QA/QC — **done**, see the Viewer's "Run data QC…"
button — (2) explicit surface/domain semantics and declared relationships between surfaces — **done**
as metadata (type + relationship declarations on each generated surface) — (3) drillhole → geological-
boundary intercepts as an inspectable, excludable intermediate layer, with a per-point "soft" toggle
added by #88 below — **done**, see the Viewer's "Boundary intercepts…" button — (4) spatial search (search ellipsoid, not just nearest-N) — **done** as
a point-support filter (see the Modeling tab's "Search ellipsoid" control) rather than true per-query
local kriging, since GemPy's own interpolator doesn't work that way — (5) geological anisotropy —
**done** via a coordinate-warp technique (see the Modeling tab's "Anisotropy" control) rather than a
literal per-domain kriging parameter — (6) multiple interpolation methods chosen per
geological situation, (7) surface constraints (hard/soft/structural/boundary/intersection/fault) —
**done** for hard (already true by construction), soft (a real per-point GemPy nugget tolerance, see
Boundary intercepts' "soft" toggle above), boundary (the "Clip result to domain boundary" checkbox
above), and structural (covered by #86's anisotropy) — intersection deferred to #90 (it's really the
same feature: detecting a declared relationship's violation) and fault deferred pending the surface-
persistence work #52/#84 already flag as a prerequisite (GemPy's own native fault-offset support was
confirmed to exist and work, just not wired up yet) — see #88's TASKS.csv note for the full breakdown,
(8) faults as
first-class objects that partition the model into domains — **done**: any generated surface typed
"Fault" can back one or more fault-side constraints, domains are an AND of those constraints (so a
domain can sit between two faults, not just split the property in two), and a shared "Domain" selector
on the Modeling tab restricts all four modelling tools (litho/stack/structural/alteration) to one
domain's control points — not yet persisted or enforced inside GemPy itself, see #89's TASKS.csv note
for the full limitations list — (9) automatic topological-contradiction detection, (10)
interpolated/extrapolated/unsupported classification per region, (11) a continuous per-region
confidence/uncertainty surface, (12) an iterative model-version-compare-accept workflow. See each
entry's own TASKS.csv note for the full detail — they're written to be actionable on their own,
not just a summary. #94 (AI-assisted interpretation) is logged as a low-priority exploratory follow-on
once this foundation is further along, not part of the 12-layer plan itself.

## Remaining work

See `TASKS.csv` for the full backlog, prioritized, with notes on what's tractable vs. a bigger
undertaking. Implicit-surface modelling (#29 lithology, #30 structural, #55 alteration) has a
working first pass via GemPy through the Python sidecar — one surface at a time per tool; multi-
surface stacks, persistence, and uncertainty output are follow-ups (#52), which #93 above also
depends on. Geosoft voxel rendering is still its own future phase.

## Downloads, code signing and privacy

Installers are published on the [Releases page](https://github.com/Matt-Mendes-ai/geostrix/releases).
Every release is built by GitHub Actions from the tagged commit — never from a developer machine — and
each release carries a `latest.yml` with the installer's SHA-512 and size so you can verify a download.

- **[CODE_SIGNING.md](CODE_SIGNING.md)** — how releases are built, approved and signed, and how to
  verify one.
- **[PRIVACY.md](PRIVACY.md)** — GeoStrix has no accounts, analytics or telemetry; this documents every
  network connection it makes and why.

Current releases are **unsigned**, so Windows SmartScreen will warn on first run — choose *More info*
then *Run anyway*. Signing is in progress; see `CODE_SIGNING.md` for status.

## License

MIT — see `LICENSE`. The goal is to make this freely available, particularly for smaller
exploration companies and independent consultants who can't justify Leapfrog/Micromine licensing.
