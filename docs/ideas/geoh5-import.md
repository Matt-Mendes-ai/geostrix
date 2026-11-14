# geoh5 (Geoscience ANALYST) import (TASKS.csv #1993): design note

Written 2026-11-13. This is a plan, not a description of shipped behaviour. No code was written and no package was downloaded or installed.
Sizes come from the npm and PyPI registry metadata (checked 2026-11-12, recorded in TASKS.csv #1993). The background and the licence chain
are in `docs/ideas/open-geoscience-tools-review.md` section 3.5.

## What a `.geoh5` is

A `.geoh5` is an HDF5 file in Mira Geoscience's published layout (the geoh5 specification on readthedocs). In outline:

- **The root group** holds the Workspace: `Groups`, `Objects`, `Data` and `Types`. Every entry is keyed by a UUID.
- **Object types.** Each object names its type by a fixed GUID (Points, Curve, Surface, Grid2D, BlockModel, DrillHole and others).
  - Its geometry sits in datasets on the object: `Vertices` (x, y, z), `Cells` (triangles or segments), and cell delimiters for a block model.
- **Data entries** belong to an object and say where their values live: vertex, cell or object.
  - Each carries its values in a `Data` dataset, with a data type (float, integer, text or referenced).
  - Referenced data are codes with a value map, which suits lithology.
- **Drillholes.** Collar and survey sit on the DrillHole object, and interval data are grouped in property groups (From / To plus values).
- **No CRS in the file.** Coordinates are plain numbers. Any CRS hint is at most a free-text attribute, so an import has to ask, as the OMF
  import does.

The type GUIDs and attribute names must be taken from the specification itself when the reader is written. This note does not reproduce
them.

## A minimal read-only import: what it would cover

Phase 1 is read only. It goes through the same "drop a file, see what is in it, tick what to bring in" dialog as OMF (`src/lib/omfImport.js`
is the model), and every object lands in a GeoStrix collection that already exists:

| geoh5 object | Becomes | Notes |
|---|---|---|
| Points, with float / integer data | a point layer (geophysics points or surface samples), one value per data entry | the commonest delivery: soil, rock, ground geophysics |
| Curve | map layer lines, or design lines when 3D | segments from `Cells` |
| Surface | a generated surface (mesh) | triangles; vertex data as a colour later |
| Grid2D | a raster | origin, u / v sizes and rotation; the value data become the band |
| BlockModel | a block model (voxel model) | rectilinear: cell delimiters on u, v, z; the cell count goes through the existing `MAX_CELLS` coarsening |
| DrillHole (phase 1b) | collars, survey, and interval data as custom layers | property groups (From / To); the hardest part, and best tested on a real file |

Left out of phase 1: export, sub-blocked or octree block models, Geoscience ANALYST's own groups and views (colour maps, visibility,
containers beyond reading their children), and image or text attachments. Each of these is listed as "not read" in the import dialog, so
nothing is dropped silently.

## Library options

Every route adds a dependency (a download), so Matt's approval is needed before any of them.

| Option | What it gives | Size | Licence | Notes |
|---|---|---|---|---|
| **h5wasm 0.10.3** (npm, usnistgov) | the HDF5 C library compiled to WebAssembly: reads **and** writes | 14.7 MB unpacked (several builds of the same wasm); the app would load one ESM build, a few MB, only when a `.geoh5` is opened | "SEE LICENSE IN LICENSE.txt" (NIST terms plus HDF5's BSD-style licence expected; to be read before wiring) | the HDF5 reference implementation, so compressed and chunked datasets are read as written; allows export later |
| **jsfive 0.4.2** (npm, usnistgov) | a pure-JS port of pyfive: **read only** | 1.6 MB unpacked | "SEE LICENSE IN LICENSE.txt" (to be read) | the smallest; does not read every HDF5 layout (some chunked or compressed data), so whether it opens ANALYST's files must be checked on real files first |
| **h5py 3.16.0** in the Python sidecar (PyPI) | reads and writes | 3.2 MB cp311 win_amd64 wheel; the frozen sidecar's growth not measured | BSD-3-Clause | the sidecar is optional and starts on first use (#440), so opening a `.geoh5` would need the engine; constraints and the PyInstaller freeze to re-verify |
| geoh5py (Mira) | a full geoh5 API | plus numpy, h5py, Pillow, psutil, pydantic | LGPL-3.0-or-later | needs Python 3.12+ (the sidecar is 3.11): not recommended now |

**Recommendation: h5wasm.** It runs in the app with no engine, is loaded only on demand, reads every HDF5 layout, and leaves room for
export. The geoh5 reader on top of it is our own code, written from the public specification (no geoh5py). If export is never wanted and
jsfive opens real ANALYST files, jsfive is the lighter read-only choice.

## Size of the work

- **Reader** (`src/lib/geoh5Import.js`): walks the Workspace, lists the objects with their type, vertex count and data names, and converts
  the ticked ones into the shapes the existing importers take. About 500 to 800 lines with phase 1b. It loads lazily, so the startup bundle
  (`scripts/check-bundle-size.mjs`) does not change.
- **Dialog:** reuses the OMF import dialog's object list.
- **Tests:** two or three small `.geoh5` fixtures written by h5wasm in a test script (Points, Surface, BlockModel), plus one real file from
  a public source, if one with a clear licence can be found, kept outside the repo or only after its licence is checked.
- **Installer:** grows by the one wasm build that ships (a few MB). The rest of the package is not copied.

## Open questions before any code

1. Matt: which library, h5wasm (recommended), jsfive (import only) or h5py (needs the engine)? Or not now?
2. A real `.geoh5` to test against, with a licence that allows it. The fixtures above prove the reader, not ANALYST's own files.
3. Drillholes in phase 1 or 1b? They are the most useful object and the hardest one.
