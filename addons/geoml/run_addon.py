"""GeoStrix predictive-modelling add-on (geoML) — entry point, from source or frozen (PyInstaller).
Copyright (C) 2026 Matt Mendes. GNU GPL v3 (see LICENSE).

The port comes from GEOSTRIX_ADDON_PORT (GeoStrix picks one and passes it with the token); 8766 by default.
"""
import multiprocessing
import os

import uvicorn

if __name__ == "__main__":
    multiprocessing.freeze_support()  # a frozen job child is this executable re-launched
    from geostrix_geoml.server import app
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("GEOSTRIX_ADDON_PORT", "8766")), log_level="warning")
