# GeoMet: 118 drillholes with 18-element assays (a research dataset), local grid, traces reconstructed

Real published data: the drillhole samples of the **GeoMet dataset**, a geometallurgical research dataset published by researchers
at IMPA, UFMG and Vale S.A.: 2,000 samples of 119 inclined holes, each with its position in 3D and its analyses for 18 elements (Ag,
Al, Au, C, Ca, Cl, Cu, F, Fe, K, Mg, Mn, Na, P, Pb, S, Th, U), all in ppm as delivered. Use it for grade statistics, compositing,
best intercepts, correlation, cross-plots and the 3D view of inclined holes.

**Two things to know before you use it.**

1. **The traces are reconstructed.** The source has no collars, no surveys and no intervals: one row per sample, with the sample's X, Y
   and Z. The collars, the survey and the intervals here are **worked out from those sample positions** (below). The holes are straight
   lines between samples, not measured paths, and the intervals are an assumption, not the laboratory's sampled lengths.
2. **The coordinates are a local mine grid with no coordinate system** (metres; X -1,150 to 955, Y -883 to 757, Z -400 to 419). The
   dataset gives no map projection, so the project opens with a local grid and no CRS: there is no map backdrop, and no reprojection
   is offered.

## What is real, and what was derived

**The analyses and the sample positions are real and unchanged; nothing is synthesized.** The collar, survey and interval tables are
derived from the positions by `scripts/samples/build-geomet.mjs`:

- `collars.csv` (118 holes): each hole's first (highest) sample is its collar; the azimuth and dip are those of the line to its
  second sample (dip negative down); the length is the distance along the hole to its last sample. The real collars are not in the
  dataset: a collar here is "the first sample", so the true top of a hole may be a little above it. One hole with a single sample has no
  direction and is left out.
- `survey.csv` (1,999 stations): one per sample, at the distance along the hole from the collar (segment by segment, in 3D), with the
  azimuth and dip of the segment that ends there.
- `assays.csv` (1,999 intervals): one interval per sample, from half way to the sample above to half way to the sample below (the first
  from 0, the last to the hole's length), so a sample is inside its interval except at the two ends. `sample_id` is the hole number and
  the sample's order in it. Element columns are `<Element>_ppm`, the values as delivered (a few carry floating-point noise from the
  source, such as 60199.99999999999).

## What the data checks found (counts)

- **Overlaps and runs past the hole:** none (118 holes, 1,999 intervals; checked by `test/sampleOsborneGeomet2006.test.mjs` with the
  same checks as every sample). Intervals run 1.7 to 108.6 m, median 17.4 m. Holes are 71 to 714 m long (median 284 m), all dipping
  down at 59° to 72° (median 70°).
- **Duplicates:** no repeated hole, no repeated interval and no repeated sample position. 4 samples repeat another sample's 18
  analyses exactly (the same values for every element): they are kept, as delivered.
- **Zeros:** Cu is 0 in 4 samples and Au is 0 in 7; the dataset does not say whether they are below detection.
- **What the chemistry says** (it does not name its deposit): iron-rich and copper-gold bearing. Fe median 24.6 % (up to 50 %), 460
  samples above 30 % Fe; Cu median 0.50 %, 986 samples above 0.5 % and 425 above 1 % Cu (up to 6.0 %); Au median 0.21 ppm, 252 samples
  above 1 ppm (up to 5.9 ppm); Ag median 1.1 ppm; S median 0.17 %. Read that as a description of these 1,999 samples, not of a
  deposit.

## Licence and attribution

> GeoMet dataset. Júlio Hoffimann, José Augusto, Lucas Resende, Marlon Mathias, Douglas Mazzinghy, Matheus Bianchetti, Mônica Mendes,
> Thiago Souza, Vitor Andrade, Tarcísio Domingues, Wesley Silva, Ruberlan Silva, Danielly Couto, Elisabeth Fonseca and Keila
> Gonçalves (IMPA, UFMG and Vale S.A.). Zenodo, version v4, 7 March 2022. https://doi.org/10.5281/zenodo.7051975

Released under the Creative Commons Attribution 4.0 International licence, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
The changes made are those listed above. Vale S.A. does not endorse GeoStrix, nor do the other organisations or authors, and the data is given
without warranty. Only the dataset's `drillholes.csv` is used; its comminution and flotation tables are not bundled.

Rebuild with:

```
node scripts/samples/build-geomet.mjs "<folder with drillholes.csv>"
```
