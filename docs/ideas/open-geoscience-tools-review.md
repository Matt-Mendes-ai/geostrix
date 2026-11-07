# Open-source geoscience tools: what GeoStrix could take from the three awesome lists

Research only, nothing built, nothing installed. Written 2026-11-06 for Matt's request: go through
[awesome-mineral-exploration](https://github.com/XploraHub/awesome-mineral-exploration),
[mineral-exploration-machine-learning](https://github.com/RichardScottOZ/mineral-exploration-machine-learning) and
[awesome-open-geoscience](https://github.com/softwareunderground/awesome-open-geoscience), skip what GeoStrix already
uses or has reviewed, check every candidate's licence and weight, and say what is worth adding, rebuilding or watching.

How it was done. The three lists were read in full (list 2 is 339k characters; its software entries were extracted in
three passes). Names were checked against `python-sidecar/requirements.txt`, `constraints.txt`, `package.json` and the
notes column of `TASKS.csv` (1,935 rows, read with `errors="replace"`). The GeoStrix code under `src/` and
`python-sidecar/app/` was grepped for each method before a gap was claimed. Six parallel research passes then read
GitHub / GitLab pages, the LICENSE file at the latest release tag (or the default branch where there is no tag), PyPI
and npm metadata, dependency lists and issue trackers for "pyinstaller". Nothing was cloned, installed or run; README
text and issues were treated as data. Where a page could not be opened the report says so.

Licence classes used below: **OK** = MIT, BSD-2/3, Apache-2.0, ISC, Zlib, PSF, Unlicense, CC0, public domain;
**Caution** = LGPL, MPL-2.0, EPL, EUPL, CC-BY (attribution clauses on code); **No** = GPL, AGPL, no licence file,
CC-BY-NC, non-commercial, academic-only, custom. None of this is legal advice.

Facts about GeoStrix that frame the verdicts (checked in the code, 2026-11-06):
- The sidecar is Python 3.11.9 (`constraints.txt`), frozen with PyInstaller `--onedir`, about 288 MB (TASKS #792). Its
  tree already has numpy 2.4, scipy 1.17, numba / llvmlite (via choclo), matplotlib 3.11, pillow, pydantic. It has no
  pandas, no xarray, no scikit-learn, no h5py, no GDAL.
- Grid filters (`src/lib/gridFilters.js`): RTP, 1VD, upward continuation, tilt, analytic signal, tilt-depth, radial
  spectrum and matched filter. No Euler deconvolution, no equivalent sources, no horizontal-gradient worms, no
  low-latitude RTP variant (RTP warns under 20° inclination and points to tilt / analytic signal).
- Estimation (`src/lib/estimation.js`, a JS worker): nearest neighbour, IDW and ordinary kriging with search
  ellipsoids; Matheron experimental variograms with spherical / exponential / Gaussian fits. No simulation, no
  indicator or co-kriging, no robust variogram estimators.
- Geophysics has 2D and 3D DC/IP and gravity / magnetic inversion on SimPEG, IGRF, diurnal correction; survey labels
  exist for TEM, FDEM, VLF, ZTEM and MT, but there is no EM forward model or inversion, and `.edi` files are refused
  with advice (#1667).
- Geochem already draws TAS, Winchester–Floyd, AFM, Jensen, Pearce 2008 and Pearce–Cann, Wood, PER, alteration box plot,
  REE / multi-element spiders normalized to McDonough & Sun 1995 only. No lambda REE shapes, no CIPW norm, no QAP,
  no other reference compositions, no multivariate anomaly score.
- Targeting has fuzzy overlay and weights of evidence (#851 and later); no posterior-uncertainty map, no
  positive-unlabelled or MaxEnt models (deliberately, see #850).
- Structure: equal-area / equal-angle stereonets, Fisher statistics with an orientation tensor and eigenvalues,
  Terzaghi weighting, Kamb contouring, rose diagrams, alpha / beta core orientation, local grids (`localGrid.js`).
- Formats read: CSV / XLSX, shapefile, GeoPackage, KML / GPX, DXF, OMF v1, GeoTIFF, Geosoft GRD / GXF / XYZ / PLY,
  UBC mesh / model, LAS 2.0 logs, Surfer-type grids, PDF pages. Not read: LAS / LAZ point clouds, ASEG-GDF2, geoh5,
  GOCAD, Leapfrog `.msh`, Datamine `.dm`, VTK.
- Lithology colours exist; the only hatch is one diagonal "low support" pattern (`supportHatch.js`). No FGDC
  patterns.
- Terrain hydrology (flow direction, accumulation, Strahler order, catchments) exists in JS (`hydrology.js`).

## 1. Summary: the recommendations worth Matt's time

1. **Harmonica + Verde + Boule (Fatiando, BSD-3) as sidecar dependencies.** Euler deconvolution, equivalent sources
   (level and merge surveys, continue to a drape, fill gaps), gradient-boosted equivalent sources for big surveys,
   total-gradient and derivative filters, Bouguer and normal-gravity corrections, spline gridding with blocked
   cross-validation. They sit on numba / choclo that GeoStrix already ships; the extra weight is pandas, xarray,
   xrft and scikit-learn (roughly 70 MB unpacked). Size M.
2. **empymod (Apache-2.0) for the EM gap.** A 1D layered-earth EM forward model for loop and dipole sources in the
   frequency and time domains, under 5 MB, depending only on numpy / scipy / numba. It gives GeoStrix its first
   ground-TEM and FDEM sounding curves and a 1D inversion wrapped with scipy. Size M. A 1D airborne-EM
   conductivity-depth section can be rebuilt on it later (GA-AEM's method is published; its code is GPL-2).
3. **FGDC lithology patterns (davenquinn/geologic-patterns, CC0).** 480 standard hatch patterns as SVG for strip
   logs, sections, legends and Layout, the way every published log and map draws lithology. Static assets, no runtime
   dependency. Size M.
4. **LAS / LAZ point clouds through laz-perf (Apache-2.0 since 3.x) and copc.js (MIT) in the renderer.** Lidar and
   drone point clouds as terrain and outcrop sources; 1.2 MB of WASM, no sidecar involvement. Size M.
5. **A geoh5 reader (Caution: geoh5py is LGPL-3.0-or-later; the format is public).** Geoscience ANALYST is the free
   viewer most juniors and contractors use, so `.geoh5` import / export is the single most-asked interchange gap
   after OMF. Two routes: geoh5py as an unmodified, replaceable package in the onedir tree with its notice (needs the
   sidecar on Python 3.12), or a clean-room HDF5 reader from the published spec. Needs a decision. Size L.
6. **Rebuild, from papers and MIT references, five small methods GeoStrix lacks:** potential-field worms (Hornby et
   al. 1999; BSD-2 BSDWormer and MIT SGTool as references), low-latitude RTP variants (Cooper & Cowan 2005; MIT
   SGTool), robust variogram estimators (Cressie–Hawkins, Dowd; MIT scikit-gstat), a robust multivariate anomaly
   score for geochemistry (Filzmoser et al. 2005; the MinersAI notebooks compare the alternatives), and lambda REE
   shape coefficients with pyrolite's MIT reference compositions (O'Neill 2016). Each is S–M and pure JS.
7. **Clean-room readers for Leapfrog `.msh`, GOCAD TS / PL / VS and ASEG-GDF2, and an EDI reader.** The formats are
   simple and documented; the existing readers are LGPL, GPL or unlicensed, so they are only format references.
   Each S–M, JS, in `src/lib`.
8. **Sequential Gaussian simulation in the estimation worker (Rebuild, L).** GStatSim (MIT, pure numpy) and
   GeostatsPy (MIT) show the GSLIB method is small; simulation is how an estimate's uncertainty is reported
   honestly, which fits the #264 / #269 framing. Low priority unless resource work grows.
9. **Watch, do not add yet:** pulearn (BSD-3) and elapid (MIT) for positive-unlabelled and MaxEnt prospectivity
   (#850's conclusion still holds at property scale), Macrostrat's CC BY 4.0 API as a geology web layer (a new network
   host), pyrolite itself (MIT since 0.3.8, but its sympy dependency is 50 MB), geoh5py's Python 3.12 requirement,
   OMF v2 (omf-rust is beta), cmocean colour maps (MIT, data only; cheap when a request comes).

## 2. Recommendation table

Lists: 1 = awesome-mineral-exploration, 2 = mineral-exploration-machine-learning, 3 = awesome-open-geoscience.
Verdicts: Add = add as a dependency, Rebuild = rebuild the method ourselves, Watch, Skip.

| Tool | Link | Lists | Licence (from the file) | Class | Module | Verdict | Reason |
|---|---|---|---|---|---|---|---|
| Harmonica | https://github.com/fatiando/harmonica | 1, 2 | BSD-3-Clause (LICENSE.txt @ v0.7.0) | OK | Geophysics | Add | Euler deconvolution, equivalent sources, gravity corrections; deps mostly already shipped |
| Verde | https://github.com/fatiando/verde | 1, 2, 3 | BSD-3-Clause (v1.9.0) | OK | Geophysics, Geochem | Add | Spline gridding, block reduction, trend removal, blocked cross-validation; avoid the `fast` extra (pykdtree LGPL) |
| Boule | https://github.com/fatiando/boule | 1 | BSD-3-Clause (v0.7.0) | OK | Geophysics | Add | Normal gravity for correct gravity disturbances; required by Harmonica main; <200 kB |
| empymod | https://github.com/emsig/empymod | 1 (as emsig), 3 | Apache-2.0 (v2.6.1) | OK | Geophysics | Add | 1D EM forward model (TEM / FDEM), <5 MB, numpy / scipy / numba only |
| emg3d | https://github.com/emsig/emg3d | 1, 3 | Apache-2.0 (v1.9.1) | OK | Geophysics | Watch | 3D EM forward model; slow for inversion on 8 GB; revisit after empymod |
| GA-AEM | https://github.com/GeoscienceAustralia/ga-aem | 1, 2 | GPL-2.0-only (LICENCE.txt pointer) | No | Geophysics | Rebuild | 1D AEM inversion method is published (Brodie & Richardson 2015); rebuild on empymod |
| MTpy-v2 / mt_metadata | https://github.com/MTgeophysics/mtpy-v2 | 1, 2, 3 | MIT (v2.1.4) | OK | Geophysics | Rebuild | MIT, but drags geopandas, rasterio, bokeh, panel, obspy (+300–500 MB); write an EDI reader instead |
| rjmcmcmt | https://github.com/GeoscienceAustralia/rjmcmcmt | 1 | GPL-3.0-only | No | Geophysics | Watch | Cover-thickness probability from AMT soundings is valuable; method published (Brodie & Jiang 2018); later |
| SGTool | https://github.com/swaxi/SGTool | 1 | MIT (LICENSE @ main; no tag) | OK (QGIS plugin) | Geophysics | Rebuild | Checklist and MIT reference for worms, variable / low-latitude RTP, Euler; audit the SAGA-derived files before copying anything |
| BSDWormer | https://bitbucket.org/fghorow/bsdwormer | 2 | BSD-2-Clause (COPYRIGHT.txt) | OK, abandoned | Geophysics | Rebuild | Worms (multiscale edges) from Hornby et al. 1999; code dead since 2021 |
| gams | https://github.com/eroots/gams | 2 | MIT (code); PyQt5 GPL-3 | OK code / No as app | Geophysics | Watch | Vertical-dip transform (Smith et al. 2022) as a low-latitude RTP alternative |
| deinterf | https://github.com/dyuu7/deinterf | 1 | MIT | OK | Geophysics | Skip | Tolles–Lawson compensation; niche (own aircraft / drone mag) |
| Tomofast-x | https://github.com/TOMOFAST/Tomofast-x | 1, 2 | MIT (+ authors line) | OK, Fortran + MPI | Geophysics | Skip | A second inversion binary; SimPEG covers it |
| invert4geom | https://github.com/mdtanker/invert4geom | 1 | MIT | OK, impractical | Geophysics | Skip | 30 hard deps incl. torch and pygmt (GMT C library) |
| PFToolbox | https://github.com/LL-Geo/PFToolbox (upstream) | 2 | no LICENSE file | No | Geophysics | Skip | Notebooks on Harmonica; nothing beyond Harmonica |
| geophys_utils | https://github.com/GeoscienceAustralia/geophys_utils | 2 | Apache-2.0 | OK, pinned | Geophysics | Skip | gdal 3.6.2 / numpy 1.24 hard pins; GA-specific |
| pyinterp | https://github.com/CNES/pangeo-pyinterp | 2 | BSD-3-Clause | OK | Geophysics | Watch | Fast gridding with Windows wheels; needs Python ≥3.12 |
| gio | https://github.com/softwareunderground/gio | 3 | Apache-2.0 | OK, stale | Import | Skip | Surfer / ZMAP readers; GeoStrix reads Surfer grids |
| geoh5py | https://github.com/MiraGeoscience/geoh5py | 1, 2 | LGPL-3.0-or-later (COPYING.LESSER @ v0.13.1) | Caution | Import, 3D View | Add (needs decision) | geoh5 interchange with Geoscience ANALYST; LGPL obligations and Python ≥3.12 |
| aseg_gdf2 | https://github.com/kinverarity1/aseg_gdf2 | 2 | MIT | OK | Import, Geophysics | Rebuild | ASEG-GDF2 airborne deliverables; the spec is public and the format is fixed-width text |
| EMagPy | https://gitlab.com/hkex/emagpy | 2 | GPL-3.0-only | No | Geophysics | Skip | Shallow FDEM inversion; method published (McLachlan et al. 2021); low priority for deep targets |
| ResIPy | https://gitlab.com/hkex/resipy | 1, 2 | GPL-3.0-only; bundles closed-source R2 binaries | No | Geophysics | Skip | GeoStrix has DC/IP on SimPEG |
| resistics, MTH5, razorback | see §4 | 1, 2 | MIT / MIT / GPL-3 | OK / OK / No | — | Skip | MT time-series processing is a contractor task, not a desktop-app job |
| FEMTIC, pyMT | see §4 | 1, 2 | MIT (MKL notice) / GPL-3 | Caution / No | — | Skip | 3D MT inversion needs tens of GB; pyMT is a PyQt GUI |
| bruges | https://github.com/agile-geoscience/bruges | 3 | Apache-2.0 | OK, dormant | — | Skip | Seismic / reservoir equations; nothing for ore rocks |
| GStatSim | https://github.com/GatorGlaciology/GStatSim | 1 | MIT (main; no tags) | OK | 3D Modelling | Rebuild | SGS, MM1 co-kriging, normal scores in pure numpy; the MIT reference for a JS worker version |
| GeostatsPy | https://github.com/GeostatsGuy/GeostatsPy | 1, 2, 3 | MIT (v0.0.71) | OK | 3D Modelling | Watch | GSLIB in numba (SIS, IK, declus, varmap); deps undeclared, numpy <2.2 note |
| PyKrige | https://github.com/GeoStat-Framework/PyKrige | 1 | BSD-3-Clause (v1.7.3) | OK | 3D Modelling | Watch | Universal kriging / external drift; overlaps the OK engine |
| GSTools | https://github.com/GeoStat-Framework/GSTools | 1, 3 | LGPL-3.0-only | Caution | 3D Modelling | Skip | Best maintained, but LGPL and the methods are reachable under MIT elsewhere |
| scikit-gstat | https://github.com/mmaelicke/scikit-gstat | 1, 3 | MIT (v1.0.27) | OK | 3D Modelling | Rebuild | Robust estimators (Cressie–Hawkins, Dowd) are 20 lines; the package pins scipy <1.17 |
| pyinterpolate | https://github.com/DataverseLabs/pyinterpolate | 1, 2 | BSD-3 (file); badge says BSD-2, PyPI says MIT | OK | — | Skip | Poisson kriging; drags geopandas + dask |
| pyKriging | https://github.com/capaulson/pyKriging | 3 | master MIT; PyPI 0.2.0 tag GPL-2.0 | No (PyPI artifact) | — | Skip | Surrogate modelling, not geostatistics |
| HPGL | https://github.com/hpgl/hpgl | 3 | BSD-3 file contradicted by README non-commercial text | No | — | Skip | Python 2, dead since 2019 |
| PyGSLib | https://github.com/opengeostat/pygslib | 2, 3 | MIT file; setup.py says "GPL and MIT" | Caution | — | Skip | numpy.distutils build; conda py39 only; unclear GPL part |
| lasio | https://github.com/kinverarity1/lasio | 1, 3 | MIT (v0.32) | OK | Import | Skip | GeoStrix has a clean-room LAS 2.0 reader (#492); lasio adds writing and LAS 1.2 / 3.0 if ever asked |
| welly, wellpathpy | see §4 | 3 | Apache-2.0 / LGPL-3.0-only | OK / Caution | — | Skip | Petroleum well model; wellpathpy's extra desurvey methods are 150 lines |
| dhcomp | https://github.com/FractalGeoAnalytics/dhcomp | 2 | MIT (master) | OK | Import | Watch | Hard-boundary compositing with optimal placement and coverage fraction; small enough to vendor |
| dh2loop | https://github.com/Loop3D/dh2loop | 1, 2 | MIT (v1.0.0) but imports fuzzywuzzy (GPL-2) | No in practice | Import | Rebuild | Lithology-code harmonization with thesauri (Joshi et al. 2021); rebuild with a MIT fuzzy matcher |
| DrillDown, corelab, pyborehole, litholog, fractoolbox | see §4 | 1, 2, 3 | MIT / MIT / GPL-3 / Apache-2.0 / Apache-2.0 | mixed | — | Skip | Notebook viewers or unreleased; nothing beyond GeoStrix |
| pyrolite | https://github.com/morganjwilliams/pyrolite | 1, 2, 3 | MIT (v0.3.9; custom CSIRO licence ≤0.3.7; README badge stale) | OK | Geochem | Rebuild | Lambdas, CIPW, QAP and 38 reference compositions are the gaps; sympy (50 MB) argues for a JS rebuild using its MIT data |
| geochemical-levelling (GA) | https://github.com/GeoscienceAustralia/geochemical-levelling | 2 | Apache-2.0 | OK | Geochem | Rebuild | Huber-regression levelling (Main & Champion 2022) as a variant of #1001; a script, not a library |
| geochemical_anomaly_detection (MinersAI) | https://github.com/MinersAI/geochemical_anomaly_detection | 1 | MIT | OK | Geochem | Rebuild | Multivariate anomaly scores; notebooks, not a package |
| Geochemistry QAQC (GA) | https://github.com/GeoscienceAustralia/Geochemistry | 1 | Apache-2.0 | OK | Geochem | Skip | GeoStrix QA/QC covers it; a UX reference for per-batch reports |
| pygeochemtools | https://github.com/RADutchie/pygeochemtools | 2 | MIT | OK, dead | Geochem | Skip | SARIG-specific; dask + MetPy |
| periodictable | https://github.com/pkienzle/periodictable | 2 | Public domain + BSD-3 file | OK | Geochem | Skip | GeoStrix has oxide / element conversion |
| Geochemistrypi | https://github.com/ZJUEarthData/geochemistrypi | 2 | MIT | OK, unusable | — | Skip | Python 3.9 only, numpy 1.23 pins, ~1 GB |
| pulearn | https://github.com/pulearn/pulearn | 1 | BSD-3-Clause (v0.2.0) | OK | Targeting | Watch | Positive-unlabelled prospectivity; needs scikit-learn; #850's property-scale caution applies |
| elapid | https://github.com/earth-chris/elapid | 1 | MIT (v1.0.4) | OK | Targeting | Watch | MaxEnt; needs geopandas + rasterio (~100 MB); optional glmnet is GPL-2 (falls back to sklearn) |
| MPM-WofE (GA) | https://github.com/GeoscienceAustralia/MPM-WofE | 2 | Apache-2.0 (R; archived) | OK, R | Targeting | Rebuild | Posterior standard-deviation / confidence map and ROC as additions to the existing WofE |
| spatial-kde | https://github.com/mblackgeo/spatial-kde | 2 | MIT | OK, stale | Targeting | Rebuild | Quartic KDE occurrence-density evidence layer; ~50 lines |
| uncover-ml, minpot-toolkit, PySpatialml, truly-spatial-random-forest, hdmedians | see §4 | 1, 2 | Apache / Apache / GPL-3 / no file / Apache | mixed | — | Skip | MPI / POSIX, Python 3.6, GPL, unlicensed, no Windows wheels |
| Spectral Python (SPy) | https://github.com/spectralpython/spectral | 1 | MIT (0.26) | OK | Maps | Rebuild | SAM / matched filter / RX anomaly on EMIT cubes and a USGS spectral-library reader are small in JS; SPy is the reference |
| hylite | https://github.com/hifexplo/hylite | 1 | MIT (1.41); hard dependency plyfile is GPL-3 | OK code / No as shipped | Maps | Rebuild | Minimum-wavelength mapping (Gaussian feature fit); use gfit (MIT) as the reference, never plyfile |
| APSG, mplstereonet | see §4 | 1, 3 | MIT / MIT | OK | 3D View | Watch | GeoStrix already has the orientation tensor and Kamb contours; Bingham cones and fold-axis fits are the small delta |
| leapfrogmshreader | https://github.com/ThomasMGeo/leapfrogmshreader | 2 | LGPL-3.0-only, dead | Caution | Import | Rebuild | Leapfrog `.msh` is a trivial text-header + binary format; ~50 lines of JS |
| geomodel-2-3dweb, GOCAD_TS-Surface-Reader | see §4 | 2 | GPL-3.0 / no LICENSE file | No | Import | Rebuild | GOCAD TS / PL / VS readers from the de-facto public format |
| OpenGeode | https://github.com/Geode-solutions/OpenGeode | 3 | MIT (v19.8.1) | OK | Import | Watch | Licensed GOCAD / LSO reader, but 14 MB wheels, two releases a day and tight pins |
| mining-ds-toolkit | https://github.com/matthew-nimmo/mining-ds-toolkit | 2 | BSD-3-Clause | OK (Go) | Import | Watch | Datamine `.dm` binary reference for a clean-room JS port if asked |
| omf (gmggroup) | https://github.com/gmggroup/omf-python | 1, 2, 3 | MIT | OK | Import | Watch | v1 library dead; OMF v2 lives in omf-rust 0.2.0-beta; no JS reader exists on npm |
| PDAL | https://github.com/PDAL/PDAL | 1 | BSD-3-Clause | OK, impractical | Import | Skip | C++ / GDAL stack; use laz-perf + copc in JS |
| laz-perf + copc.js | https://github.com/hobuim/laz-perf, https://github.com/connormanning/copc.js | (route for PDAL) | Apache-2.0 (3.x; was LGPL-2.1 ≤2.x) / MIT | OK | Import, Maps | Add | LAS / LAZ point clouds in the renderer, 1.2 MB WASM + 78 kB |
| WhiteboxTools | https://github.com/jblindsay/whitebox-tools | 2 | MIT (v2.4.0) | OK | Maps | Skip | Rust exe to bundle; repo marked legacy; GeoStrix hydrology exists |
| exactextract | https://github.com/isciences/exactextract | 2 | Apache-2.0 (links GEOS LGPL) | OK | Maps | Rebuild | Zonal statistics of rasters over polygons; cell-centre sampling is enough in JS |
| Smoothify | https://github.com/DPIRD-DMA/Smoothify | 2 | MIT | OK | Maps | Watch | Chaikin smoothing of raster-derived polygons; 100 lines if wanted |
| vtk_triangulate_points, VTK-to-DXF | see §4 | 3, 2 | Apache-2.0 / no licence | OK / No | — | Skip | Scripts on pyvista; GeoStrix has Delaunay and DXF |
| geologic-patterns | https://github.com/davenquinn/geologic-patterns | 3 | CC0-1.0 (assets and code); FGDC source US-Gov public domain | OK | Layout, 3D View, Import | Add | FGDC lithology patterns for strip logs, sections, legends |
| cmocean | https://github.com/matplotlib/cmocean | 3 | MIT (incl. colour-map data) | OK | Maps, Geophysics | Watch | More perceptual ramps (topo, balance, haline) as JS tables when asked |
| Colorcet | https://github.com/holoviz/colorcet | 3 | CC-BY-4.0 for the whole package, code included | Caution | — | Skip | cmocean and the viridis family cover it without attribution clauses on code |
| Macrostrat API | https://macrostrat.org/api/v2 | 1 | Code Apache-2.0; data CC BY 4.0 | OK code / Caution data | Maps | Watch | Geologic map units, ICS intervals and lithology colour / fill codes; a new network host (PRIVACY.md and the website pages) |
| Bluecap | https://github.com/GeoscienceAustralia/bluecap | 2 | Apache-2.0 | OK | Mine Design | Watch | Mine-economics NPV grids (Walsh et al. 2020); Australia-calibrated costs, unpackaged |
| subsurface | https://github.com/softwareunderground/subsurface | 2 | Apache-2.0, dormant | OK | — | Skip | Data-hub design reference only |

## 3. Detail for each Add and Rebuild

### 3.1 Harmonica, Verde and Boule (Add, M)

**What GeoStrix gains.** In Geophysics: Euler deconvolution (source depths and locations from a magnetic grid, the
classic complement to tilt-depth), equivalent sources (level two surveys flown at different heights, merge a ground and
an airborne survey, continue data onto the terrain drape, fill gaps without the FFT's edge artefacts), gradient-boosted
equivalent sources that scale to hundreds of thousands of stations, total-gradient amplitude and east / north
derivatives, Bouguer and free-air corrections with a proper normal-gravity model, and prism / point forward models for
quick hand checks. In Geochem and Geophysics gridding: Verde's bi-harmonic spline with blocked cross-validation,
block means for decimating dense lines, and trend removal before gridding.

**Where it plugs in.** `python-sidecar/app/geophys/` as a new `potential_fields.py` module exposing jobs through the
existing `/v1/jobs` API; `src/lib/gridFilters.js` gains "Euler deconvolution" and "Equivalent-source continuation /
levelling" entries that call the sidecar instead of running in JS; `src/lib/sampleGrid.js` gains a "spline (Verde)"
method beside IDW and minimum curvature (#1622).

**Weight and licence chain.** Harmonica 0.7.0 (BSD-3) needs numba (BSD-2, shipped), choclo (BSD-3, shipped), verde
(BSD-3), xarray (Apache-2.0), xrft (MIT), pandas (BSD-3), scikit-learn (BSD-3); Harmonica main also needs boule and
bordado (BSD-3). Verde needs pooch and dask (BSD-3). New to the frozen tree: pandas, xarray, xrft, scikit-learn,
pooch, dask: roughly 70 MB unpacked, all pure Python except scikit-learn's wheels. Do not install Verde's `fast` extra
(pykdtree is LGPL-3). No PyInstaller problems are reported in any of the three trackers; scikit-learn and xarray need
the usual hooks that a SimPEG build already carries.

**Risks.** Harmonica's last release (0.7.0) was 2024-08-12, 27 months before this review, although the repository
is active and main is on Python 3.10–3.13 with a changed dependency set (boule, bordado). Pin an exact version and
test the frozen build, as #363 requires. Dense equivalent-source solves are memory-hungry; the gradient-boosted
variant exists for that, and the job planner (#324's RAM cap) must size the source layer. Harmonica's
`load_oasis_montaj_grid` duplicates `geosoft.js`; use ours.

### 3.2 empymod (Add, M), with a 1D AEM inversion rebuilt on it later (Rebuild, L)

**What GeoStrix gains.** A ground-loop TEM or FDEM sounding can be forward-modelled over a layered earth (central
loop, fixed loop, coincident loop, dipole-dipole FDEM), and a 1D inversion wrapped with scipy's least squares gives a
conductivity-depth model per station, then a conductivity-depth section along a line. That is what a geologist does
with a contractor's TEM decay curves today in a spreadsheet or not at all. GeoStrix already labels TEM dB/dt, B-field,
decay constant and FDEM channels in `geophysSurveys.js`, so the data path exists.

**Where it plugs in.** `python-sidecar/app/geophys/em1d.py` (forward via `empymod.loop` / `empymod.dipole`, inversion
on scipy), a job type in `main.py`, a pane beside the DC/IP panels. A later row rebuilds GA-AEM's sample-by-sample
AEM inversion (system geometry, waveform, Gauss–Newton with a reference model) on the same kernel.

**Weight and licence chain.** empymod 2.6.1, Apache-2.0, pure-Python wheel; numpy ≥2, scipy, numba, libdlf (shipped
already for SimPEG), scooby. Under 5 MB new. Python ≥3.11. No PyInstaller issues.

**Risks.** Single maintainer (active since 2016, 14 open issues). A 1D model is wrong under a 3D conductor; the UI
must say so. SimPEG also has 1D TDEM; empymod is lighter and better documented for sounding curves, but the two
should agree on a test model before shipping.

### 3.3 FGDC lithology patterns (Add, M)

**What GeoStrix gains.** Strip logs, sections, fences, the lithology legend and Layout pages drawn with the standard
FGDC-STD-013-2006 patterns (series 600 and 700 are lithology), so a printed log looks like every other printed log and
is readable in black and white.

**Where it plugs in.** Copy the SVG patterns into `src/assets/patterns/` with the CC0 notice; `src/lib/layers.js`
maps a lithology code or group to a pattern code the way Macrostrat's `defs/lithologies` does (its `fill` field is the
same FGDC number); `striplogSvg.js`, `sectionLegend.js` and the Layout legend render `<pattern>` fills over the colour.

**Weight and licence chain.** 480 SVGs plus PNGs; the repository's LICENSE dedicates the repackaging under CC0-1.0 and
notes the FGDC source is a US Government work (public domain). No runtime dependency.

**Risks.** Pattern 718 is missing upstream (its one open issue). Patterns scale with the drawing; the Layout depth
scale (#1480) must keep hatch spacing on the page constant. Drawing hundreds of patterned intervals in the 3D View is
not the plan; patterns are for 2D outputs.

### 3.4 LAS / LAZ point clouds with laz-perf and copc.js (Add, M)

**What GeoStrix gains.** Import a lidar or drone LAS / LAZ file as a terrain (ground-classified points to
`terrainFromPoints`) or as a coloured point cloud in the 3D View for outcrop and pit-wall mapping, and read a COPC
file by level of detail so a 2 GB survey does not have to be loaded whole.

**Where it plugs in.** `src/lib/lazImport.js` wrapping `laz-perf`'s WASM decoder in a worker (the pattern of
`solidImport.worker.js`), `copc` for the COPC hierarchy, then `terrainFromPoints.js` and the existing point-cloud
drawing. Point classification 2 (ground) drives the terrain; the ASPRS LAS 1.2–1.4 spec is public.

**Weight and licence chain.** laz-perf 0.0.7 on npm (Apache-2.0 since the 3.x C++ line; 2.1.0 was LGPL-2.1, so pin
≥0.0.6 and keep the licence text), 1.2 MB WASM; copc 0.0.9 (MIT), 78 kB, depends on laz-perf and cross-fetch. The CSP
already allows WASM (sql.js, meshoptimizer). PDAL (BSD-3) was the listed tool; its Python binding is sdist-only and
needs the PDAL C++ stack, so it is not an option for the sidecar.

**Risks.** laz-perf's npm releases lag the C++ code; test LAS 1.4 point formats 6–8. A full-resolution cloud of tens
of millions of points will not render on an 8 GB laptop; decimate on import and say how much was dropped.

### 3.5 geoh5 import / export (Add with Caution, L; needs a decision)

**What GeoStrix gains.** Open the `.geoh5` workspaces contractors and juniors deliver for Geoscience ANALYST (points,
curves, surfaces, 2D / 3D grids, drillholes with property groups) and save a GeoStrix project's holes, surfaces and
block models into one for a client who views in ANALYST. After OMF this is the most common 3D interchange gap.

**Where it plugs in.** Route A: `geoh5py` in the sidecar, a `/v1/jobs` job that converts a `.geoh5` to the same JSON
the OMF importer emits (`src/lib/omfImport.js` as the model). Route B: a clean-room reader in the renderer over an
HDF5 library in JS, following the public geoh5 specification on readthedocs, into the same importer shape.

**Weight and licence chain.** geoh5py 0.13.1 is LGPL-3.0-or-later (COPYING.LESSER; unchanged since 2020) with numpy,
h5py (BSD-3, ~3 MB), Pillow, psutil and pydantic. LGPL inside a PyInstaller onedir is workable because the package
stays as separate `.pyc` files the user can replace: ship it unmodified, include its licence text and a written offer
or link to its source, document how to replace it, never vendor or patch it, and import it dynamically so the sidecar
runs without it. geoh5py 0.13 requires Python 3.12 to 3.14; the sidecar is 3.11, so route A also means re-verifying
GemPy, SimPEG, numba / llvmlite and the freeze on 3.12 (the same move #809 noted for pgcore). Route B avoids all of
that at the cost of writing an HDF5 reader against a specification that Mira changes between ANALYST versions.

**Risks.** Format drift (geoh5 is Mira's, versioned with ANALYST). Drillhole property groups and sub-blocked grids are
the hard parts. The licence page (#639) and the installer notice need the LGPL entry either way.

### 3.6 Potential-field worms and low-latitude RTP (Rebuild, M)

**Method and sources.** Worms: upward-continue the grid to a ladder of heights, take the total horizontal gradient at
each, trace the ridge maxima, and stack the traces as "worms" whose persistence with height indicates dip and depth
extent (Hornby, Boschetti & Horowitz 1999, Geophys. J. Int. 137, 175–196; Horowitz et al. 2000, Exploration
Geophysics). References: BSDWormer (BSD-2, abandoned 2021) and SGTool's MIT port. Low-latitude RTP: variable RTP
(Cooper & Cowan 2005, Computers & Geosciences) and the amplitude-stabilized form (Hao et al. 2018), both ported in
SGTool (MIT) alongside Euler deconvolution after Melo & Barbosa. Everything builds on `gridFilters.js`'s existing FFT
kernels. GeoStrix's audience includes Brazil and West Africa, where RTP at ±10–20° inclination is a real problem the
current warning only names.

**Where.** `src/lib/gridFilters.js` (new filter kinds) and a worm layer in `sceneBuilders.js`. Pure JS, S–M each.
Audit SGTool's `calcs/` files before lifting code: some are ported from SAGA GIS (GPL / LGPL).

### 3.7 Robust variogram estimators (Rebuild, S)

Cressie–Hawkins and Dowd estimators beside Matheron in `variogram.js`, so a handful of massive-sulphide composites
stops dictating the sill (the file's own comment at line 84 describes the problem). Twenty lines each, from Cressie &
Hawkins 1980 (Math. Geol. 12) and Dowd 1984; scikit-gstat (MIT) is the reference implementation. Add a directional
variogram table (azimuth × dip) in the same pass.

### 3.8 Robust multivariate anomaly score for geochemistry (Rebuild, M)

A robust Mahalanobis distance on log-ratio-transformed elements, using a minimum-covariance-determinant estimate
(Filzmoser, Garrett & Reimann 2005, Computers & Geosciences 31, 579–587), as a new column and map in Geochem beside
the univariate thresholds (`thresholds.js`). The MinersAI notebooks (MIT) compare Isolation Forest, LOF and ABOD and
would need scikit-learn in the sidecar; the MCD route is pure JS on `arrayStats.js` and `correlation.js`. The
honesty rule applies: an anomaly score is a ranking, not a probability, and the pane should say so.

### 3.9 Lambda REE shape coefficients and pyrolite's reference compositions (Rebuild, S–M)

Lambdas (O'Neill 2016, J. Petrology 57, 1463–1508; tetrad terms after Anenburg & Williams 2021) are an orthogonal
polynomial fit to the chondrite-normalized REE pattern: a weighted least squares over 14 elements, 60 lines in
`geochemDiagrams.js`, giving λ0–λ3 as columns and a λ1–λ2 plot. pyrolite (MIT since 0.3.8) ships 38 reference
compositions as CSVs (Sun & McDonough 1989, Palme & O'Neill, Gale 2013 MORB, Rudnick & Gao crust, PAAS, NASC and
more) under the repository MIT licence with per-file citations; copying the CSVs with attribution gives the spider
plots more normalizers than McDonough & Sun 1995. CIPW norm (Verma et al. 2003 algorithm, as pyrolite implements)
and QAP are M-sized follow-ons. pyrolite as a dependency was rejected only on weight: its sympy dependency is about
50 MB and GeoStrix's geochemistry runs in the renderer, not the sidecar.

### 3.10 Clean-room readers: Leapfrog `.msh`, GOCAD TS / PL / VS, ASEG-GDF2, EDI (Rebuild, S–M each)

- **Leapfrog `.msh`**: a text header of `[index]` lines (`Tri Integer 3 N`, `Location Double 3 M`) then `[binary]`
  with little-endian int32 triangles and float64 vertices. About 50 lines in `src/lib/leapfrogMsh.js` feeding
  `solidImport`. The only existing reader (LGPL-3, dead) is not needed.
- **GOCAD ASCII**: `GOCAD TSurf 1` with VRTX / ATOM / TRGL, PLine with ILINE / SEG, VSet. Documented in several
  MIT projects (OpenGeode-GeosciencesIO, pygcd). Government 3D models (GSWA, GSQ, GSC) ship this way. Voxet and
  SGrid are a later, moderate step.
- **ASEG-GDF2**: `.dfn` definitions plus fixed-width `.dat`; the ASEG publishes the standard. Airborne mag, radiometric
  and EM deliverables in Australia and from Australian contractors elsewhere use it. Stream it through
  `streamTable.js` like the big XYZ files (#1351).
- **EDI**: the SEG 1991 MT transfer-function format, plain text. Read apparent resistivity and phase per station,
  draw sounding curves and a pseudosection, and add a Niblett–Bostick depth transform for a first look. Replaces
  the refusal in `unreadableFormats.js` (#1667). mt_metadata's parser (MIT) is the reference; the whole MTpy-v2
  stack is not needed.

### 3.11 Sequential Gaussian simulation (Rebuild, L)

Normal-score transform, SGS on a random path with simple kriging of the transformed values, back-transform, and
e-type / probability maps over N realizations (Deutsch & Journel 1998, GSLIB; GStatSim and GeostatsPy as MIT
references). It would live in `estimation.worker.js` beside ordinary kriging and reuse the search and variogram
code. Value: a probability-above-cutoff block model is the honest way to report grade uncertainty (#264, #269).
Cost: L, and realizations multiply memory; a 20-realization cap and the #1416 budget note would be needed. Low
priority unless resource-style work grows.

### 3.12 Small Targeting and Maps rebuilds (S each)

- Weights of evidence: posterior standard deviation and a confidence map, and a ROC / AUC on the training points
  (Bonham-Carter 1994; GA's archived MPM-WofE R scripts as the cross-check).
- Occurrence-density evidence layer: quartic kernel density of known showings (spatial-kde's method), feeding the
  evidence overlay.
- Zonal statistics of a raster over polygons (mean, percentiles, count) by cell-centre sampling; exactextract
  (Apache-2.0) is the exact-area reference if precision ever matters.
- Spectral angle mapper, matched filter and RX anomaly on EMIT cubes with a USGS spectral-library reader
  (Spectral Python, MIT, as the reference), and minimum-wavelength mapping by Gaussian feature fitting (hylite's gfit,
  MIT), extending #807's continuum removal and feature depth.
- Lithology-code harmonization for legacy logs: a thesaurus of codes and a fuzzy match (dh2loop's MIT thesaurus
  CSVs; Joshi et al. 2021, GMD 14, 6711) with a MIT fuzzy matcher, never fuzzywuzzy (GPL-2).

## 4. Tables

### 4.1 Already covered (skipped before research)

| Tool | Why skipped | TASKS row |
|---|---|---|
| GemPy, gempy_engine | sidecar dependency | #29, #363 and ~118 rows |
| SimPEG, discretize, geoana, choclo, pymatsolver, libdlf | sidecar dependencies | #321, #322, #324, #643 |
| numba, llvmlite, matplotlib, pillow, pydantic, fastapi, uvicorn | in constraints.txt | #363 |
| pyGIMLi (gimli) | reviewed; postponed as an add-on | #805, #809 |
| PyGMI | reviewed (GPL-3 GUI; used as a checklist) | #805, #806, #807, #808 |
| EIS Toolkit (eis_toolkit) | reviewed (EUPL-1.2, TensorFlow, scipy pin) | #850 |
| scikit-learn | reviewed; not in the base sidecar | #850, #669 |
| geoML | reviewed; shipped as the optional add-on | #638, #639 and ~57 rows |
| PyVista, omfvista, VTK | reviewed; not adopted | #792, #798 |
| LoopStructural, map2loop, Loop3D | tested; postponed | #1310 |
| GemGIS, nfcd/mapsTo3DModels | used as a benchmark source | #1306, #1307 |
| Baselode (darkmine-oss) | reviewed (GPL-3); its GSWA data used as a fixture | #492, #493 |
| OMF (Open Mining Format) | own JS reader and writer | #159, #160, #411, #500 |
| Geosoft grids (geosoft_grid, Geosoft-Grid-to-Raster, Harmonica's GRD loader) | own GRD / GXF / XYZ / PLY readers | #26, #99, #1347, #1351 |
| GDAL, rasterio, GeoPandas, xarray, pyproj | named in earlier reviews; not shipped | #805, #850, #415, #834 |
| QGIS | reference application throughout | ~131 rows |
| Leapfrog Geo | reference application throughout | ~110 rows |
| proj4, geotiff.js, d3-delaunay, papaparse, sql.js, meshoptimizer, pdfjs-dist, three, mysql2, pg, undici, electron-updater, lucide-react | package.json | various |
| striplog (agile-geoscience) | named as a known example; GeoStrix has its own strip logs (`striplogSvg.js`) | #133 |
| lasio | GeoStrix wrote a clean-room LAS reader instead | #492 |
| Datamine / Micromine CSV | survey and block-model CSVs recognized | #546, #410 |
| MTpy (original) | named among pyGMI's dependencies; GPL-3, deprecated | #805 |
| SRTM / Copernicus / NRCan DEM sources | shipped terrain sources | #77, #814, #815 |

### 4.2 Skipped: standalone applications, GUIs and plugins

| Tool | Note |
|---|---|
| QGIS, GRASS, SAGA GIS, RustGIS | desktop GIS; QGIS is already the reference |
| OpendTect, OpendTect-Plugins | seismic interpretation suite |
| GPlates, pyGPlates, GPlatesReconstructionModel | plate reconstruction |
| CloudCompare | point-cloud editor (GPL) |
| OpenDroneMap, WebODM | photogrammetry servers (AGPL) |
| EnMAP-Box, Geo-SAM, QGIS WofE plugins (chudasama-bijal, wofe_module), QGIS Project Packager, SGTool (plugin form) | QGIS plugins; SGTool kept as an MIT algorithm reference in §3.6 |
| Geoscience for QGIS (rolandhill), OpenLog | QGIS drillhole plugins, GPL-3 / GPL-2+ (OpenLog depends on AGPL xplordb) |
| BlenderGeoModeller | Blender add-on |
| OpenGeoPlotter, GeoSuite (Orebit), CoreSpecViewer | GPL-3 desktop apps (PyQt5 / pywebview); GeoSuite's maths is bundled JavaScript |
| gams, pyMT, EMagPy GUI, ResIPy GUI | PyQt5 geophysics GUIs |
| geoapps (Mira) | notebook applications on SimPEG and geoh5py |
| Loop3D | GUI for map2loop |
| Whitebox GUI | GUI over WhiteboxTools |
| Orange | visual data-mining GUI |
| napari | image viewer |
| SGeMS, pysgems | geostatistics application and its driver |
| MRST, ResInsight, Webviz, Webviz-subsurface | reservoir applications |
| Tomofast-x, FEMTIC, rjmcmcmt, GA-AEM | compiled Fortran / C++ MPI executables (methods noted in §2) |
| Kart | geospatial version control |
| Prospectivity Online Tool, Nickel Mineral Potential Modelling (ESRI) | web tool / ArcGIS workflow |
| Geoscience ANALYST, Anaconda, DuckDB, GDAL binaries | commercial or platform software |
| PhreeQC, Reaktoro, GeoPyTool | aqueous speciation programs; geochemical plotting app (GPL) |
| Lefa, FuzzyLAS, modelr.io | web applications |
| TV, tifviewer | terminal viewers |
| Macrostrat (platform) | the API is assessed in §2; the platform itself is a web service |

### 4.3 Skipped: out of scope or not software

| Tool | Reason |
|---|---|
| segyio, segysak, SeismicZFP, pyZGY, pyVDS, OpenSeaSeis, Seismic Un*x, Madagascar | seismic data formats and processing |
| ObsPy, SeisComP, REDPy, Pyrocko, rsudp, disba, hvsrpy, bh_tomo, ttcrpy | seismology / passive seismic |
| Devito, PyLops, Auralib | seismic modelling and operators |
| libres, ecl, DuMux, SHEMAT-Suite, Fesapi, XTgeo, pyGeoPressure | reservoir engineering and petroleum |
| ModFlow, Landlab, HyVR, PyMT (csdms), BMI | groundwater and surface-process modelling |
| gprMax, RGPR, readgssi, GPRPy, RAGU | ground-penetrating radar |
| resistics, razorback, MTH5, MTH5-based tooling, MATE | MT time-series processing and mantle interpretation |
| Stress2Grid | stress-orientation gridding |
| TorchGeo, terratorch, TorchSpatial, torch-harmonics, Landshark, scikit-map, AIDE, ExPLoRA, Perceiver, Senseiver, CoreJepa, geo-deep-learning | deep-learning frameworks (PyTorch / TensorFlow, GPU) |
| UNCOVER-ML framework (fork), Geo-Wavelets, ML-Preprocessing, GIS-ML-Workflow, PySpatialml | ML pipelines for HPC; PySpatialml GPL-3 |
| uncover-ml, minpot-toolkit, MPM-WofE (as packages) | MPI / POSIX, Python 3.6 archived, R; methods noted in §3.12 |
| 3DMPM, MPM Gawler, MPM Curnamona REE, MPM Lachlan Laterite, porphyry-prospectivity-global, porphyry_copper_spatiotemporal_exploration, Lachlan_Laterite_Ni_Co, Transform 2022 tutorial, Tin-Tungsten Colab, Sediment-hosted deposits data mining, Aeromagnetic_CNN, KGMLPrescribedFires, geothermal play-fairway code | paper code and notebooks, mostly unmaintained |
| CAST, geodl, geotargets, sf, terra, stars, raster, exactextractr, rayshader, hsdar, cetcolor, gstat, RGPR | R packages |
| GeoStats.jl, DrillHoles.jl, Rasters.jl, Zarrs.jl, JuliaEarth, JuliaGeodynamics | Julia |
| NumPy, pandas, Matplotlib, Dask, dask-cloudprovider, Zarr, DuckDB, DuckDB Spatial, GeoRust, Anaconda, Python data-science template | general stacks |
| rioxarray, xarray-spatial, xrft, xvec, xdggs, xhistogram, xarray-einstats, rasterix, odc-geo, geocube, gdalxarray, pyvista-xarray | xarray ecosystem; xrft arrives with Harmonica |
| Open Data Cube, datacube-stats, DEA notebooks, DEA-stackstac, stackstac, pystac, odc-stac, intake-stac, sat-search, kerchunk, Kerchunk-geoh5, VirtualiZarr, icechunk, serverless-datacube-demo, titiler, Geolambda, docker-lambda | cloud datacube, STAC and serverless tooling |
| Raster4ML, georeader, geoutils, Rasterstats, Raster-threading, COG validator, griffine, ouroboros, async-geotiff, raster-benchmark, Pairwise, PyESRIDump, geofileops, dask-geopandas, giswqs/geospatial | raster and vector utilities duplicating geotiff.js / proj4 / own code |
| PyMeshLab, TorchMesh, vedo, PVGeo, geoh5vista, HoloViews, pygraphviz, Sits, ipyleaflet, geonotebook, Pangeo | visualization libraries for Python / notebooks |
| Colorcet, PU Colormaps, Colormap distortions, cetcolor | colour-map packages (Colorcet assessed in §2; the rest are formats for other software) |
| GXPy | needs a Geosoft Oasis montaj licence |
| geoh5-bridge, AEM2SEG-Y, CGG-Out-Reader, geophysics-data-reverse-engineering, PDFMiner, Harmonica Geosoft PR | one-off converters or not software |
| geomodel-2-3dweb, GOCAD SG Grid Reader, GOCAD TS Surface Reader, Leapfrog mesh reader, VTK-to-DXF | format readers assessed in §2 / §3.10 |
| hdstats, hdmedians, distfit, spatial-kde (package) | statistics utilities; methods noted where useful |
| Spatial Docker, DL Docker Geospatial, Rocker geospatial, AWS Deep Learning Containers, Geobase | Docker images |
| Bluecap (methodology noted), ZipfsLaw_Quadrilatero_Ferrifero, PyASX, Metal Price API | mining economics scripts and market scrapers |
| GEM Global Active Faults, global_tectonics, GeologicTimeScale, Global Copper Deposits, Zircon Fertility, EarthChem, GEOROC | datasets (see §5) |
| structuralGeology notebooks, manual-python-geologia, computational-geophysics, Signal-Image-Processing, Geophysics Fortran subroutines, 2020-aachen-inverse-problems, SimPEG workshop repositories, SimPEG_Scripts, Astic-2019-PGI, UHElectromagnetics, mtwaffle, MECMUS, Mineral Stats Toolkit, grid-aeromag, pseudogravity Fortran, gs2021-pyrolite, geoquimica, SA geochemical maps, SA stratigraphy DB, Pybedforms, Loop-Autobedding, aem_interp_dash, australia-gravity-data (code), osborne-magnetic (code), RIS_basement_sediment, ASTER-analysis, Geo Notebooks | courses, notebooks, examples and one-off scripts |
| DeepWiki, Map of GitHub, geo-lm, QueryPlot, DARPA CriticalMAAS repositories (uncharted-ta1), GEM 3D project page, pyClusterWise | LLM tooling, map digitizing competition code, project pages |
| awesome-* related lists, cheat sheets, Software Underground, Wikipedia comparison | lists, documents and communities |
| PyGMT, GMT | publication maps; GMT is a C library (LGPL) outside the stack |
| Smoothify, exactextract, WhiteboxTools, Macrostrat, pyinterp, cmocean, APSG, mplstereonet, PyKrige, GeostatsPy, GSTools, dhcomp, emg3d, gams, rjmcmcmt, OpenGeode, mining-ds-toolkit, omf, Bluecap, pulearn, elapid | assessed in §2 as Watch or Skip |

Licence facts worth flagging from the research (all read from the LICENSE files): pyrolite changed from a custom
CSIRO licence to MIT at 0.3.8 and its README badge is stale; laz-perf changed from LGPL-2.1 (≤2.x) to Apache-2.0
(3.x); pyinterpolate's file says BSD-3 while its badge says BSD-2 and PyPI says MIT; pyKriging's PyPI release is
GPL-2.0 while master is MIT; PyGSLib's file says MIT while setup.py says "GPL and MIT"; HPGL's BSD file is contradicted
by non-commercial wording in the README; PFToolbox, GOCAD_TS-Surface-Reader, VTK-to-DXF and truly-spatial-random-forest
have no LICENSE file at all; hylite is MIT but hard-depends on plyfile (GPL-3); dh2loop is MIT but imports fuzzywuzzy
(GPL-2); Colorcet is CC-BY-4.0 for its code as well as its data; geoh5py's GitHub label says LGPL-3.0 while the file
and pyproject say LGPL-3.0-or-later; Tomofast-x's GitHub label says "Other" because of an authors line on a plain MIT
text. No PyInstaller freezing issue was found in any of the 60-odd trackers searched, except lasio's historical #380
(fixed; add `copy_metadata`) and the general rasterio / joblib hooks.

## 5. Datasets worth noting

Licences read from the portal, DataCite or repository pages on 2026-11-06; several official pages blocked automated
reading (USGS copyright page, mrdata, ScienceBase, map.sarig, GSQ HTML, gov.ie), and those are marked "verify".

| Dataset | Useful content | Licence | Redistribution | Fixture-sized item |
|---|---|---|---|---|
| fatiando-data / osborne-magnetic | Airborne TMI lines over the Osborne Cu-Au deposit, Queensland (990,987 rows, 200 m lines, 80 m clearance), from GA P1029 (eCat 142419) | CC BY 4.0 (dataset and GA source); code BSD-3 | Yes; credit GA ("© Commonwealth of Australia (Geoscience Australia)") and DOI 10.5281/zenodo.5882209 | osborne-magnetic.csv.xz, 2.2 MB; companion lightning-creek-magnetic grid, netCDF, ~1 MB |
| Ensaio (Fatiando) | britain-magnetic (BGS aeromag, 2.7 MB), bushveld-gravity (0.14 MB), southern-africa-gravity (0.14 MB) | CC BY 4.0 each (BGS OGL and NOAA public domain at source) | Yes, with each README's attribution line | all under 3 MB |
| compgeolab / australia-gravity-data | All GA ground gravity, QC-filtered (gravity disturbance, height, density) | CC BY 4.0; cite Wynne 2018 (doi:10.26186/5C1987FA17078) and Uieda 2021 (doi:10.6084/m9.figshare.13643837) | Yes | a clipped regional subset |
| GeoMet dataset (Zenodo 10.5281/zenodo.7051975, via Awesome Mining Data) | Drillhole assays with coordinates plus comminution and flotation tables | CC BY 4.0 | Yes | drillholes.csv, 362 kB: the smallest real drillhole fixture found |
| Geoscience Australia portal | National mag, radiometric and gravity grids, OZMIN deposits, boreholes | CC BY 4.0 site-wide (ga.gov.au/copyright); check each eCat record | Yes; "© Commonwealth of Australia (Geoscience Australia) 2026" | a prospect-scale grid clip |
| GSWA DASC | 1:100k / 1:500k geology, Mineral System Atlas, MINEDEX, geophysics (GDA2020 only from 2026-03-31) | Crown copyright, CC BY 4.0 unless noted | Yes; "© State of Western Australia (Department of Mines, Petroleum and Exploration) 2026" or "Based on ... material" when modified; WAMEX geochem licence "see Help guide" (not stated) | a 1:100k tile or MINEDEX extract; GeoStrix already ships a GSWA CC BY 4.0 sample |
| SARIG (South Australia) | Mineral drillholes, MaxDH downhole geochemistry, MINDEP, geology, geophysics, WFS / WMS; yearly CSV data package | CC BY 4.0 (energymining.sa.gov.au data services); some legacy records CC BY 3.0 AU; verify the Gawler Phase 2 drillhole package (34 holes) page, which blocked the tool | Yes; "Contains data © Government of South Australia (Department for Energy and Mining), CC BY 4.0" | a MaxDH subset or the Gawler Phase 2 package |
| GSQ Open Data Portal (Queensland) | Boreholes, geochemistry, mapping, mineral occurrences, geophysics, 3D (Thalanga deposit atlas ds100103) | per-record field, "cc-by" 4.0 (CKAN API); some report records "Not Specified" | Yes for cc-by records; "© State of Queensland (Geological Survey of Queensland) [year], CC BY 4.0" | a single borehole or geochem record; Thalanga is 158–732 MB |
| USGS MRData / NGDB / MRDS | Deposit databases, 1.5 M-sample geochemistry (1962–2023 release CC0), aeromagnetic and gravity grids | US Government public domain; specific releases CC0 1.0; verify (pages blocked) | Yes; customary "U.S. Geological Survey" credit | mrds-trim shapefile; one state's NGDB extract; one quad grid |
| Canada Geophysical Data Repository | 200 m and 1 km aeromagnetic compilations, individual surveys, radiometrics, gravity | Open Government Licence – Canada 2.0 (open.canada.ca record) | Yes; required line "Contains information licensed under the Open Government Licence – Canada." | a clipped 200 m tile beside the BC samples |
| BGS OpenGeoscience | DiGMapGB-625 geology, GB aeromagnetic survey; G-BASE geochemistry is NOT open | OGL for the open products; BGS Non-Commercial / Viewer licences on others | Yes for OGL items; "Contains British Geological Survey materials © UKRI [year]" | DiGMapGB-625 GeoPackage region; britain-magnetic above |
| Macrostrat | Global geologic map units, columns, ICS intervals with colours, lithology definitions with FGDC fill codes; API v2 and vector tiles | Data CC BY 4.0; cite Peters et al. 2018 (doi:10.1029/2018gc007467), Quinn et al. 2023 (doi:10.1002/gdj3.189) and original map sources | Yes for Macrostrat-compiled data; check each source map's `ref` | a GeoJSON of map units for one bounding box |
| DARPA CriticalMAAS / USGS training data | Scanned geologic maps with georeferencing ground truth and feature labels | CC0 1.0 (DataCite, doi:10.5066/P9FXSPT1) | Yes | one map TIFF plus its JSON labels (tens of MB) |
| World Stress Map 2025 | 100,842 crustal stress records | CC BY 4.0 (doi:10.5880/WSM.2025.001) | Yes | wsm2025.csv (~10–20 MB); not exploration data |
| ICGEM gravity models | Spherical-harmonic models (EIGEN-6C4 etc.) | site terms not stated; DOI'd models CC BY 4.0 (e.g. doi:10.5880/icgem.2015.1) | Yes for DOI'd models | a low-degree .gfc (<5 MB) |
| GEM Global Active Faults | Fault traces with slip type and rates | CC BY-SA 4.0 | Bundle unmodified only; a derived layer would have to stay BY-SA, which is not MIT-compatible | a regional clip of the GeoJSON |
| global_tectonics (Hasterok) | Plates, boundaries, geologic provinces, cratons | GPL-3.0 on the data | Avoid bundling in an MIT installer | — |
| Awesome Mining Data entries to avoid | Macpass (own-use only, form-gated), pygslib tutorial data (GPL-3), exepulveda porphyry synthetic (CC BY-NC-SA), Lisheen / Galmoy (licence not stated) | — | No / not confirmed | — |
| Canadian provincial portals (XploraHub list) | BC ARIS and MINFILE are recorded as "access only (BC)"; Quebec SIGÉOM CC BY 4.0; Yukon, Alberta, NB, NS under OGLs; NWT non-commercial; Ontario Crown copyright | as recorded by the list | GeoStrix already ships ARIS-derived samples: confirm BC's terms directly with BCGS before the next release | SIGÉOM drilling GeoPackage subset |
| US state surveys (XploraHub list) | Arizona CC BY-NC-SA; Minnesota non-commercial; Nevada, Alaska, Idaho, Montana, Michigan not stated | — | Only USGS federal data is openly licensed | — |

Best five for GeoStrix sample projects or test fixtures: osborne-magnetic with its grid (a real aeromagnetic survey over
a known deposit, 3 MB, one attribution line); GeoMet drillholes (a genuine 362 kB assay table); a SARIG drillhole and
MaxDH extract (CC BY 4.0, verify the record); USGS CC0 extracts (no attribution obligation, US anchor); a Canadian
200 m aeromagnetic tile (OGL Canada) to give the BC samples geophysics.

## 6. Proposed TASKS rows (for Matt's approval; nothing added to TASKS.csv)

| module | feature | priority | notes |
|---|---|---|---|
| Geophysics | Harmonica + Verde + Boule in the sidecar: Euler deconvolution, equivalent-source levelling / merging / continuation to the drape, Bouguer and normal-gravity corrections, spline gridding with blocked cross-validation | Medium | From docs/ideas/open-geoscience-tools-review.md §3.1. BSD-3 all three; new frozen deps pandas, xarray, xrft, scikit-learn, pooch, dask (~70 MB); never Verde's `fast` extra (pykdtree LGPL). Pin exactly (#363); Harmonica 0.7.0 is 27 months old, main needs boule + bordado. Size M. |
| Geophysics | 1D EM (TEM / FDEM) forward and inversion on empymod: sounding curves, conductivity-depth models per station, a section along a line | Medium | §3.2. Apache-2.0, <5 MB, numpy / scipy / numba only, Python ≥3.11. Say in the UI that a 1D model is wrong under a 3D conductor. Cross-check one model against SimPEG 1D TDEM. Size M. |
| Geophysics | 1D airborne-EM inversion (sample-by-sample, system geometry and waveform) rebuilt on empymod, after GA-AEM's published method | Low | §3.2. GA-AEM is GPL-2: rebuild from Brodie & Richardson 2015 and Brodie & Mulè 2023, do not read its code. Size L. Depends on the empymod row. |
| Geophysics | Potential-field worms (multiscale edges) and low-latitude RTP variants (variable RTP, amplitude-stabilized RTP), plus Euler deconvolution in JS if the Harmonica row is not taken | Medium | §3.6. Hornby et al. 1999; Cooper & Cowan 2005; Hao et al. 2018. MIT SGTool and BSD-2 BSDWormer as references; audit SGTool's SAGA-derived files first. Pure JS in gridFilters.js. Size M. |
| Geophysics / Import | EDI (MT / AMT transfer function) reader: apparent resistivity and phase curves, pseudosection, Niblett–Bostick depth transform; replaces the #1667 refusal | Medium | §3.10. SEG 1991 EDI format, plain text; mt_metadata (MIT) as the reference, not the MTpy-v2 stack. Size M. |
| Import | ASEG-GDF2 (.dfn + .dat) airborne survey import, streamed like big XYZ files (#1351) | Medium | §3.10. Public ASEG standard; aseg_gdf2 (MIT) as a reference. Size S–M. |
| Import | Leapfrog .msh mesh import (clean room) | Medium | §3.10. Text header + little-endian binary; ~50 lines; the LGPL reader is not used. Size S. |
| Import | GOCAD TS / PL / VS import (clean room); Voxet and SGrid later | Medium | §3.10. De-facto public ASCII format; OpenGeode-GeosciencesIO (MIT) as a format reference; geomodel-2-3dweb is GPL-3 and GOCAD_TS-Surface-Reader has no licence, neither is read. Size M. |
| Import / 3D View | geoh5 (Geoscience ANALYST) import and export | Medium | §3.5. NEEDS DECISION: route A geoh5py (LGPL-3.0-or-later, unmodified and replaceable in the onedir tree, notice + source offer, dynamic import; requires the sidecar on Python 3.12) or route B a clean-room reader from the public spec. Licence page (#639) and installer notice either way. Size L. |
| Import / Maps | LAS / LAZ / COPC point clouds in the renderer with laz-perf (Apache-2.0, ≥3.x) and copc.js (MIT): ground points to terrain, coloured clouds in 3D | Medium | §3.4. 1.2 MB WASM + 78 kB; worker like solidImport; decimate on import and report it. Pin laz-perf ≥0.0.6 (2.x was LGPL-2.1). Size M. |
| Layout / 3D View | FGDC lithology patterns (davenquinn/geologic-patterns, CC0) in strip logs, sections, legends and Layout; lithology → pattern mapping in layers.js | Medium | §3.3. Static SVG assets with the CC0 notice; pattern 718 is missing upstream; keep hatch spacing constant on the page under the #1480 depth scale. Size M. |
| 3D Modelling | Robust variogram estimators (Cressie–Hawkins, Dowd) and a directional variogram table | Low | §3.7. Twenty lines each in variogram.js; scikit-gstat (MIT) as the reference. Size S. |
| 3D Modelling | Sequential Gaussian simulation in the estimation worker: normal scores, N realizations, e-type and probability-above-cutoff block models | Low | §3.11. Deutsch & Journel 1998; GStatSim and GeostatsPy (MIT) as references. Cap realizations; extend the #1416 budget note. Size L. Only if resource-style work grows. |
| Geochem | Lambda REE shape coefficients (O'Neill 2016, with tetrads) and pyrolite's 38 MIT reference compositions as extra spider normalizers | Low | §3.9. Pure JS in geochemDiagrams.js; copy the CSVs with their citations. CIPW norm and QAP as follow-ons (M). Size S–M. |
| Geochem | Robust multivariate anomaly score (MCD Mahalanobis distance on log ratios, Filzmoser et al. 2005) as a column and map | Low | §3.8. Pure JS; a ranking, not a probability: the pane must say so. Size M. |
| Geochem | Huber-regression levelling variant for #1001 (Main & Champion 2022) | Low | §3.12 / §2. Rebuild from the paper; the GA script is Apache-2.0 but a script. Size S. |
| Targeting | Weights of evidence: posterior standard deviation / confidence map and ROC-AUC on training points; occurrence-density (quartic KDE) evidence layer | Low | §3.12. Bonham-Carter 1994; GA MPM-WofE (R, Apache-2.0) as a cross-check; spatial-kde's method. Size S each. |
| Maps | Zonal statistics of a raster over polygons (mean, percentiles, count) by cell-centre sampling | Low | §3.12. exactextract (Apache-2.0) as the exact-area reference if ever needed. Size S. |
| Maps | Spectral angle mapper, matched filter and RX anomaly on EMIT / ENVI cubes with a USGS spectral-library reader; minimum-wavelength mapping by Gaussian feature fit | Low | §3.12. Spectral Python (MIT) and hylite's gfit (MIT) as references; never hylite's plyfile dependency (GPL-3). Extends #807. Size M. |
| Import | Lithology-code harmonization for legacy logs: thesaurus + fuzzy match | Low | §3.12. dh2loop's MIT thesaurus CSVs (Joshi et al. 2021); a MIT fuzzy matcher, never fuzzywuzzy (GPL-2). Size M. |
| Maps | Macrostrat geology web layer and lithology / interval colour lookups (CC BY 4.0) | Needs decision | §2. A new network host: PRIVACY.md and the five website privacy pages must list macrostrat.org / tiles.macrostrat.org; attribution line in the layer legend. Watch until Matt decides. |
| App | Sample data: osborne-magnetic + lightning-creek grid (CC BY 4.0, GA), GeoMet drillholes (CC BY 4.0), a Canadian 200 m aeromagnetic tile (OGL Canada) as fixtures or a sample project; confirm BC ARIS terms with BCGS | Low | §5. Attribution lines as listed; nothing downloaded yet (ask first). |
