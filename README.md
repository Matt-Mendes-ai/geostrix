# GeoStrix

Lightweight, open-source 3D software for mineral exploration: drillholes, geochemistry, geophysics, modelling and drill planning in one place.

GeoStrix is made to support the development of mineral exploration, especially in countries where resources
are scarce: free, open source, offline, and with no account or licence to buy.

## Pillars

- **Focused on mineral exploration.** Built for exploration geologists, not adapted from general CAD or GIS:
  drillholes, geochemistry and geophysics come together to answer one question — where to drill next.
- **Easy to use.** Drop in your files and GeoStrix recognizes them, checks the data, and explains what it
  did in plain language.
- **Light enough for a cheap computer.** It runs on an ordinary laptop with no special hardware or internet
  connection.

## What it does

- **Drillholes in 3D:** collars, surveys and logs from CSV, Excel, shapefiles or a database; 3D views with
  terrain, cross-sections and data checks.
- **Geochemistry:** diagrams, statistics, compositing, best intercepts and QA/QC.
- **Geophysics:** surveys, grids and voxel models, plus magnetic, gravity and DC/IP inversion.
- **Modelling and targeting:** geological surfaces and faults, grade shells and drill planning.
- **Maps and reports:** any coordinate system worldwide, map layers, and print-ready layouts.

## What GeoStrix is not

GeoStrix is an exploration and targeting tool, **not** resource-estimation software. Its grade tools use
nearest-neighbour or inverse-distance interpolation only, with no classification, dilution or recovery.
Nothing it produces is a Mineral Resource under NI 43-101, JORC or any comparable code; public disclosure of
tonnage or grade needs an estimate by a Qualified Person.

## Download

Installers are on the [Releases page](https://github.com/Matt-Mendes-ai/geostrix/releases). Releases are not
yet code-signed, so Windows may warn on first run: choose *More info*, then *Run anyway*
([docs/antivirus.md](docs/antivirus.md)). GeoStrix has no telemetry; see [PRIVACY.md](PRIVACY.md).

## Run from source

```bash
npm install
npm run dev
```

The Python engine for modelling and inversion is optional; see `python-sidecar/README.md`.

## License

MIT — see `LICENSE`.
