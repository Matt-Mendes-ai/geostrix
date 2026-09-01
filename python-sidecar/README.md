# GeoStrix Python sidecar

Optional local FastAPI server for geoprocessing that's a better fit for Python's scientific stack
(scipy now; GemPy later for implicit modelling, see `TASKS.csv` item #29) than reimplementing in
JS. The main app works fully without this — features that depend on it just report as unavailable.

## Running

Electron spawns this automatically (`electron/main.js` `startPythonSidecar`) using `python3` (or
`python` on Windows) found on your PATH, on `127.0.0.1:8765`. Install dependencies once:

```bash
pip install -r requirements.txt
```

To run it standalone for testing (not through Electron):

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload
```

Then e.g. `curl http://127.0.0.1:8765/health`.

Set `GEOSTRIX_PYTHON` in the environment before `npm run dev`/`npm start` if `python3`/`python` on
your PATH isn't the interpreter with these dependencies installed (e.g. a venv's interpreter path).

## Why a sidecar instead of Pyodide (Python-in-the-browser via WASM)?

Considered and rejected for now: Pyodide can't easily use compiled scientific packages with native
extensions the way a real Python interpreter can, and GemPy's dependency chain (pytensor, etc.) is
exactly that kind of package. A sidecar keeps the door open for genuinely heavy compute — kriging
over large point sets, GPU-accelerated implicit modelling — without being constrained by what runs
in a browser sandbox. The tradeoff (matching the approach seen in GeoLibre, an open-source GIS app
this project drew a few ideas from — see the project handoff doc) is that end users need Python
available. Packaging a frozen interpreter into the installer removes that requirement but hasn't
been done yet (see `TASKS.csv`).

## Packaging status

Bundled into the Electron installer (TASKS.csv #49): `npm run build:sidecar` (`build_sidecar.js`)
freezes this into a standalone executable via [PyInstaller](https://pyinstaller.org) — no separate
Python/pip needed by an end user — which `electron-builder` then copies into the packaged app's
resources dir (`extraResources` in `package.json`'s `build` config). `electron/main.js`'s
`startPythonSidecar()` spawns that frozen executable when `app.isPackaged` is true, and still uses
the from-source `python -m uvicorn` path for `npm run dev`.

Not run automatically by plain `npm run build` — that would force everyone building the app to also
have `python-sidecar/venv` set up with `pyinstaller` installed, which most contributors touching only
the frontend won't have. Run `npm run build:sidecar` once before `npm run build`/`npm run build:dir`
if you want the packaged app to include it (or use the combined `npm run build:full`); if the frozen
executable isn't present, packaging proceeds without it exactly like before this pass — anything that
depends on the sidecar still degrades gracefully (see `src/lib/desktop.js`
`pythonHealth`/`pythonInterpolate`).

Setup for building the frozen executable (one-time, in addition to `pip install -r requirements.txt`
above):

```bash
pip install pyinstaller
```

Only built/verified on Windows so far — macOS/Linux need their own PyInstaller run on that platform
(PyInstaller freezes for the OS it runs on, it doesn't cross-compile) before `electron-builder`'s
`mac`/`linux` targets would have a bundled sidecar to pick up.

## Endpoints

- `GET /health` — `{"status": "ok", ...}` when running.
- `POST /interpolate` — general-purpose 3D scalar interpolation (RBF or IDW) between labelled
  sample points and query points. See `app/main.py` for the exact request/response shape. A
  stepping stone toward implicit lithology modelling, and directly useful today for contouring
  grade or magnetic-susceptibility values between drillholes.
- `POST /implicit-model` — implicit surface modelling via [GemPy](https://gempy.org) (TASKS.csv
  #29). Takes interface points + dip/azimuth orientation data for one or more named surfaces plus
  an extent/resolution, returns a triangle mesh (vertices + faces) per surface. Turned out to be a
  lighter dependency than expected — GemPy 2026.0.3's default backend is pure numpy, no
  pytensor/aesara compile step required. `ViewerModule.jsx`'s "Implicit model" panel is the current
  (first-pass, one-surface-at-a-time) caller; see `TASKS.csv` #29 for what's built vs. still open.
