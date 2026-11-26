# Altia South — nine holes with downhole EM and a full QAQC record (Queensland)

A base- and precious-metal target on EPM 25950 about 80 km south-south-east of Cloncurry, in the Eastern Succession of the Mount Isa Inlier, tested by
Sandfire Resources in 2017: moving-loop ground EM, nine RC and diamond holes, downhole EM in four of them with the conductors the contractor modelled, and
the drill database's logs, assays, QAQC, pXRF and magnetic susceptibility. Everything here is real company data from one open-file report; nothing is
synthesized. It is also a data-quality sample: the database's "not analysed" codes, a pXRF export with a unit fault, and a separate QAQC table.

Source: Geological Survey of Queensland open-file report cr105798 (company report by Sandfire Resources NL, 2018), (c) State of Queensland, CC BY 4.0
(creativecommons.org/licenses/by/4.0). Converted and trimmed for GeoStrix: the drill tables renamed to GeoStrix's columns (one assay column per element and
unit, the lab's method and batch columns left out) and every person's name left out, the database's -555 codes blanked and its not-sampled rows left out,
the pXRF readings with impossible values left out, the QAQC table's units confirmed against the assays, the far ground EM (the LAN prospect, 4-10 km away)
and the PDF reports left out.

## What it contains

| | |
|---|---|
| Holes | 9 (5 RC with a diamond tail, 4 RC), 102 survey stations, MGA94 zone 54 (EPSG:28354) |
| Logs | lithology (477 intervals, with regolith), alteration (141), sulphides (183), veins (166), magnetic susceptibility (4,696 probe readings) |
| Assays | 1,199 intervals (core, chips, composites), 49 element columns; `qaqc.csv`: 321 QC samples (153 standards, 87 blanks, 70 lab and 11 field duplicates; a table for reference: they carry no hole or depth, and GeoStrix keeps QC in the assay table, so it has no import for them yet) |
| pXRF | 557 interval readings (Innov-X on RC chips), 29 elements |
| Surface | 10 rock chips (geology only: their assays are not in the tables), 16 to 19 km south-west of the holes |
| Geophysics | downhole EM: 4 holes (Maxwell DHEM tables, 6 files) and 2 modelled conductor plates (DXF); ground EM: 1 moving-loop line over the holes (Maxwell `.tem`) with its 96 stations (shapefile: open it as a map layer, Geological Mapping > Geology map; the 3D view's import offers "Import as survey stations", which reads no shapefile) |
| Mapping, terrain, grids | none |
| Size | 4.3 MB, 27 files, with this README and `build-checks.txt` |

## What the data are

- **Geology, from the logs (not the report's label).** Metasediments under regolith with garnet and hedenbergite alteration (the most logged), chlorite,
  hematite, silica, sericite, biotite and amphibole; the sulphides are pyrite, chalcopyrite, pyrrhotite, sphalerite, galena and bornite. Grades are low:
  copper to 0.57 %, zinc 0.9 %, lead 0.16 %, silver 11 ppm, gold 4.19 ppm, with iron up to 50 % and manganese up to 2.1 %. A garnet-hedenbergite,
  manganese-rich metasediment system with weak Zn-Pb-Ag and Cu-Au: the signature of Broken Hill-type alteration, with no economic intercept here.
- **Codes and QC.** The merged assay table writes -555 for "not analysed" in 41,832 cells: blanked (GeoStrix would read a negative as a detection limit).
  The other negatives (-0.002, -1, -0.05 …) are the lab's below-detection values and are kept. 504 rows are NS (not sampled, no analysis): left out.
  No row is superseded. The QAQC samples (standards with their IDs, blanks, lab and field duplicates with the sample they duplicate) are in
  `qaqc.csv`; their table gives element names without units, so each element's unit was confirmed against the same samples' assays (all 49 agree).
- **pXRF.** 614 of the 1,171 readings carry values over 1,000,000 ppm (iron up to 1.5 billion ppm, copper up to 330 %): a unit fault in the export.
  They are left out whole rather than rescaled by a guess. In the rest, the analyser's codes -100000 and -10 (no reading / under its limit) are blank.
- **Surveys.** The database's grid azimuths (MGA94 zone 54) are `azimuth_grid`; the magnetic readings are kept as `azimuth_magnetic`.
- **Overlaps.** None in any log, the assays or the pXRF.
- **Geophysics over the holes.** The moving-loop line passes 55 to 165 m from six of the nine holes; downhole EM was read in four.
- **CRS.** Everything in MGA94 zone 54 (EPSG:28354): the collars' NAT_Grid_ID, the rock chips' grid and the station shapefile's projection. The rock chips' Orig_East and Orig_North are swapped in the source (an "east" of 7.65 million m): swapped back here.

## Rebuild

`node scripts/samples/build-gsq-altia-south.mjs "<cr105798 download>"` with the report's download from the GSQ Open Data Portal (the portal's `.zip`, or the
folder it unpacks to). The script prints its checks and writes them to `build-checks.txt`.
