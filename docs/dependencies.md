# Third-party tools GeoStrix relies on

TASKS.csv #3975. GeoStrix has not modified any of these tools: no patched or vendored copy of GemPy, SimPEG or the others. Its
own work is a layer around them (`python-sidecar/app`, `addons/geoml`, `src`), so an update cannot overwrite it. The risk is an
update that changes a behaviour the layer assumes: a default, a sign convention, an ordering. **One exception reaches inside:**
`python-sidecar/app/gempy_threads.py` (#4027) runs gempy_engine's field evaluation on several threads by replacing its private
evaluation step and its module-wide distance buffer at run time. Check it first on any gempy_engine update. The
"Assumptions" column lists those; the code comments that record them are in `python-sidecar/app/main.py` and
`python-sidecar/app/geophys/*.py`.

Check what is behind with `node scripts/check-updates.mjs` (`--json`, `--all` for the whole frozen Python tree). It is read-only:
metadata from PyPI, the npm registry and GitHub, no install or download.

## The review rule

- **Update for a reason:** a security fix, a bug that affects GeoStrix, a feature we want, or a pin too old to install. Being
  behind is not a reason on its own.
- **One tool at a time, in a scratch environment** (a scratch venv for the sidecar, a scratch worktree for npm), never the dev
  venv or the shipped app first.
- **Tests first, then the reference models:** the tool's guarding tests below, then the stored reference models (next
  section), before and after the update.
- **Results that moved go in the release notes:** what moved, by how much, and why. Then store the new reference on purpose
  (`--store`) and regenerate `constraints.txt` (`pip freeze`) from the verified scratch venv.
- **When:** Electron at every release (it carries the browser engine's security fixes). The science tools every three months,
  and before a significant release.

## Reference models

Stored results that show whether an update moved the numbers. Synthetic data only.

| Model | Stored in | Tolerance | Run |
|---|---|---|---|
| GemPy surface positions: a 2-unit plunging anticline, Conformable (onlap) and Erosional, heights at 25 probes | `python-sidecar/tests/reference/gempy_two_units.json` | 0.1 m per probe; GemPy's default range within 1e-6 relative; input scale 1 : 1 : 1. Noise measured ≤ 0.001 m; GemPy's range doubled moves the surfaces 0.54 m | `tests/test_reference_gempy.py` (CI) |
| Potential-field inversion: a recovered block, gravity sign, closed-form spheres | in the test (`test_potential.py`) | per assertion | CI |
| geoML: one grade run (a smooth Cu field) and one rock run (SED over VOLC), 12 synthetic holes, the app's "Fast" settings, a fixed 6 x 4 x 3 block grid | `python-sidecar/tests/reference/geoml_grade_rock.json` | grade within 1 % of the mean grade, P10 / P90 within 2 %, the unit's probability within 0.005. A repeat run moves 0; iterations 150 to 120 moves the grade 9 % and the probability 0.027, the rock's train spacing 10 to 8 m moves the probability 0.017 | `addons/geoml/tests/test_reference_geoml.py`, by hand with the add-on's own Python (`GEOSTRIX_GEOML_PYTHON`; ~75 s). **Not in CI: CI does not install geoML** (the add-on workflow only builds and publishes it); without geoML the test says SKIPPED |

## Science tools (python-sidecar, Python 3.11)

Pinned exactly in `python-sidecar/requirements.txt` (17 tools). The whole tree (74 packages) is in `constraints.txt` (#363).
"CI" = `.github/workflows/sidecar.yml` runs it on every push that touches the sidecar; "by hand" = run it with the venv's Python.

| Tool | Pinned | Latest (2026-11-23) | GeoStrix relies on it for | Assumptions the code makes | Guarded by | Checked |
|---|---|---|---|---|---|---|
| gempy | 2026.0.3 | 2026.0.3 | implicit models: Model from map, stratigraphic stacks, faults, unit blocks | pure-numpy backend (no compile step); default range 1.7 in its rescaled space (sent as a multiplier); default nugget ~2e-5; ERODE / ONLAP identical inside one group, so the relation is set by groups; lithologies numbered in request order; the input rescale is NOT isotropic as built (#655, redone isotropic); mesh vertices come back in its internal space | test_implicit_faults, test_implicit_dedupe, test_implicit_transform, test_reference_gempy (CI); test_implicit_surface_detail (by hand) | 2026-11-23 |
| gempy_engine | 2026.0.3.post1 | 2026.0.3.post1 | GemPy's solver | as gempy; its dual contouring gives the surface meshes (octree level = surface detail, #766); **private parts (#4027):** `_interp_scalar_field`, `generic_evaluator._eval_on` evaluated chunk by chunk on threads, and `_kernels_assembler.DistancesBuffer` made per thread (shared, a gradient takes another chunk's distances) | as gempy, and test_gempy_threads (one thread and four bit for bit; CI) | 2026-11-23 |
| numpy | 2.4.6 | 2.5.5 | every sidecar computation | float64 by default; GemPy runs float32 unless asked (#767) | every sidecar test | 2026-11-23 |
| scipy | 1.17.1 | 1.18.1 | interpolation, the sparse solvers of the 3D DC/IP inversion | — | test_dcip3d, test_pfields (by hand); test_potential (CI) | 2026-11-23 |
| simpeg | 0.25.2 | 0.26.0 | magnetic / gravity forward and inversion, 2D and 3D DC resistivity and IP | gz positive UP, so user gravity is negated in and out; sensitivity float32 by default (memory planned at 4 bytes a cell); pole electrode is B = A, N = M; readings grouped by source in its own order and mapped back; 2.5D threshold 1e-2 as in its tutorials | test_potential, test_dcip2d (CI); test_dcip3d (by hand) | 2026-11-23 |
| discretize | 0.12.0 | 0.13.0 | tensor and octree meshes for the inversions | cell order x fastest, then y, then z | as simpeg; test_structfit (by hand) | 2026-11-23 |
| geoana | 0.8.1 | 0.9.0 | SimPEG's analytic sources | — | as simpeg | 2026-11-23 |
| choclo | 0.3.2 | 0.4.0 | the potential-field kernels under SimPEG (numba) | — | test_potential (CI) | 2026-11-23 |
| pymatsolver | 0.4.0 | 0.5.1 | SimPEG's linear solvers | — | test_dcip2d (CI) | 2026-11-23 |
| libdlf | 0.3.0 | 0.3.0 | Key's 2012 Hankel / Fourier filters for FDEM and TEM 1D | the 101-point J0 / J1 and 201-point sine filters | test_em1d, test_tem1d (CI) | 2026-11-23 |
| empymod | 2.6.1 | 2.6.1 | the reference the fast FDEM kernel is held against; TEM's lagged convolution | displacement currents off (epermH = epermV = 0) | test_em1d (equal to the 5th decimal), test_tem1d (CI) | 2026-11-23 |
| harmonica | 0.7.0 | 0.7.0 | Euler deconvolution, equivalent sources, terrain prisms | its default source depth is replaced (1.2 x the cell); its default Euler window is replaced (#2834) | test_pfields (by hand) | 2026-11-23 |
| verde | 1.9.0 | 1.9.0 | gridding (biharmonic spline, block reductions, cross-validation) | — | test_pfields (by hand) | 2026-11-23 |
| boule | 0.7.0 | 0.7.0 | normal gravity for free-air and Bouguer anomalies | — | test_pfields (by hand) | 2026-11-23 |
| fastapi | 0.141.1 | 0.165.0 | the sidecar's local HTTP API | — | test_jobs_api, smoke_jobs (CI, live server) | 2026-11-23 |
| uvicorn | 0.52.3 | 0.54.0 | the sidecar's HTTP server | — | as fastapi | 2026-11-23 |
| pydantic | 2.13.4 | 2.14.4 | request and response validation | field defaults stand for "the tool's own default" (e.g. range multiplier None) | as fastapi | 2026-11-23 |

## geoML add-on (addons/geoml, GPL-3.0, optional)

| Tool | Pinned | Latest (2026-11-23) | GeoStrix relies on it for | Assumptions the code makes | Guarded by | Checked |
|---|---|---|---|---|---|---|
| geoML | commit 4eb7121c (0.9.3) | v0.10.15 (142 commits ahead) | Gaussian-process domain (rock) and grade models with uncertainty | the add-on reads the fields geoML writes by name (`UNIT/Target/probability`, `indicator_predicted` contoured at 0, `prediction`, `dispersion`, `simulations`) and sets GPOptions (jitter 1e-6, training batch 500); later releases change what `CategoricalGaussianIndicator.predict` reports (0.10.0), turn XLA on by default (0.9.11) and move numbers (0.9.4, 0.9.13, 0.10.6, 0.10.8) | addons/geoml/tests/test_api.py; test_reference_geoml (by hand) | 2026-11-23 |
| tensorflow, tensorflow-probability, tf-keras | 2.21.0, 0.25.0, 2.21.0 | 2.21.0, 0.25.0, 2.21.0 | geoML's engine | — | as geoML | 2026-11-23 |

An update of the add-on is a new add-on release: about a 550 MB download for each user.

The add-on has no constraints file: `addons/geoml/requirements.txt` pins its six direct requirements and the rest of the tree resolves
at install time. A source environment for the reference test is built with
`python -m venv <folder>` and `<folder>\Scripts\python -m pip install -r addons/geoml/requirements.txt` (Python 3.11; about
2.6 GB installed, outside OneDrive). The grade model is not reproducible from run to run as the add-on calls it: `run_grade`
calls geoML's `from_kmeans` without a seed (geoML keeps that seed apart from `set_seed`), so the inducing points change. The
reference test passes the add-on's seed to it.

## Desktop packages (package.json at the package-lock.json version)

| Package | Locked | Latest (2026-11-23) | GeoStrix relies on it for | Guarded by | Checked |
|---|---|---|---|---|---|
| electron | 44.9.3 | 45.4.1 | the desktop app and its browser engine: **review at every release** | npm test; launch the built app before a release | 2026-11-23 |
| electron-builder | 26.15.3 | 26.18.0 | the installer | the release workflow | 2026-11-23 |
| electron-updater | 6.8.9 | 6.8.11 | update checks and downloads | the release smoke test's update path (docs/release-smoke-test.md) | 2026-11-23 |
| three | 0.160.1 | 0.187.0 | every 3D view | npm test (many tests read three's output) | 2026-11-23 |
| react, react-dom | 18.3.1 | 19.3.1 | the whole interface | npm test (react-test-renderer) | 2026-11-23 |
| vite, @vitejs/plugin-react | 5.4.21, 4.7.0 | 8.3.8, 6.3.0 | the build and its startup budget | check-bundle-size, the CI build | 2026-11-23 |
| undici | 7.30.1 | 8.13.1 | the network guard in the main process (electron/netGuard.js) | netGuardPin1264 | 2026-11-23 |
| pg, mysql2 | 8.23.0, 3.24.2 | 8.23.1, 3.24.6 | database connections | the database tests | 2026-11-23 |
| papaparse | 5.6.0 | 5.7.1 | CSV import | the import tests | 2026-11-23 |
| geotiff | 3.0.5 | 3.0.5 | GeoTIFF rasters in and out | the raster tests | 2026-11-23 |
| proj4 | 2.21.0 | 2.23.0 | reprojection | the reprojection tests | 2026-11-23 |
| sql.js | 1.14.2 | 1.17.0 | GeoPackage and the SQL workspace | the GeoPackage tests | 2026-11-23 |
| h5wasm | 0.10.3 | 0.10.3 | geoh5 import and export | the geoh5 tests | 2026-11-23 |
| laz-perf | 0.0.7 | 0.0.7 | LAZ point clouds | the lidar tests | 2026-11-23 |
| pdfjs-dist | 6.3.289 | 6.5.438 | a report's PDF pages as images for the section-image georeferencer; drawing only, its scripting engine not shipped | — | 2026-11-23 |
| meshoptimizer | 1.2.0 | 1.3.0 | mesh levels of detail | its mesh test | 2026-11-23 |
| d3-delaunay | 6.0.4 | 6.0.6 | triangulation, natural neighbour gridding | the surface tests | 2026-11-23 |
| lucide-react | 0.383.0 | 1.78.0 | icons | — | 2026-11-23 |
| @fontsource/exo-2 | 5.3.0 | 5.3.0 | the app's typeface (Exo 2), also baked into the 3D view's lettering tables | regenerate src/lib/fonts/exo2Tables.js (scripts/fonts) after an update | 2026-11-23 |
| eslint and its plugins, globals | 9.39.5 | 10.15.0 | lint before each commit and in CI | — | 2026-11-23 |
| concurrently, cross-env, wait-on | 8.2.2, 7.0.3, 7.2.0 | 10.0.7, 10.1.0, 9.5.1 | the dev scripts only | — | 2026-11-23 |
