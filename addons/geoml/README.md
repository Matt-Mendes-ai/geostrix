# GeoStrix predictive modelling add-on (geoML)

An optional add-on for GeoStrix that runs **[geoML](https://github.com/italo-goncalves/geoML)** (Ítalo Gonçalves,
GPL-3.0) — Gaussian-process models with uncertainty — so its models can be compared with GeoStrix's own in the
same 3D view. GeoStrix downloads it only when a user asks for it; without it nothing changes.

**Licence: GNU GPL v3** (see `LICENSE`), because it includes geoML. GeoStrix itself is a separate program under the
MIT licence: the two run as separate processes and talk over a local HTTP connection.

## What it does

| Job | Input (sent by GeoStrix) | Output |
|---|---|---|
| `domain` | collars, survey, lithology intervals, the codes forming one unit | the unit's contact surface with uncertainty per vertex; blocks with the unit's probability and uncertainty |
| `grade` | collars, survey, assay intervals of one element | blocks with the predicted grade, P10 / P90 from simulations and geoML's dispersion |

Stationary or "deep" (fold-following, geoML's `GPWalk`) models for `domain`; Box-Cox-warped GP for `grade`.

## Running from source

```
python -m venv venv
venv\Scripts\pip install -r requirements.txt
set GEOSTRIX_ADDON_TOKEN=some-secret
venv\Scripts\python run_addon.py      # http://127.0.0.1:8766
```

API: `GET /health`, `POST /v1/jobs {kind, params}`, `GET /v1/jobs/{id}`, `GET /v1/jobs/{id}/result`,
`POST /v1/jobs/{id}/cancel`. Every request except `/health` needs `X-GeoStrix-Token`.

## Footprint (measured on Woodjam, 19 holes)

TensorFlow is large: about 2.6 GB installed from source, about 600 MB of memory once loaded and 1–2 GB while a model
runs. A copper grade model took about 45–65 s and a contact model about 100 s on a laptop.
