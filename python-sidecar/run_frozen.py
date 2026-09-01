"""Entry point for the PyInstaller-frozen sidecar executable (TASKS.csv #49).

`uvicorn app.main:app` (the from-source dev command, see app/main.py's own docstring) needs a real
Python interpreter with the sidecar's deps importable off PATH — fine for a developer running from
source, but a packaged install has no such thing, so Python-dependent features (GemPy implicit
modelling, RBF/IDW interpolation) were simply unavailable to anyone who just installed the app.
PyInstaller freezes this exact same FastAPI app plus a Python runtime into one standalone .exe with
no separate Python install required — this script is that .exe's entry point (`--onefile`, see
build_sidecar.py), calling uvicorn.run() programmatically instead of via its own CLI, since a frozen
executable has no `python -m` to invoke.

Host/port are hardcoded to match electron/main.js's PY_SIDECAR_PORT (127.0.0.1:8765 — this server was
already 127.0.0.1-only pre-freeze, see app/main.py's own CORS comment for why that's fine) rather than
threaded through as CLI args — one fewer thing that can drift between the two sides of this spawn.
"""
import uvicorn

if __name__ == "__main__":
    from app.main import app
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
