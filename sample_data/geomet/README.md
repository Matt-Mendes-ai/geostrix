# GeoMet: 118 drillholes with 18-element assays (Vale S.A. research dataset), no coordinate system

Real published data: the drillhole samples of the **GeoMet dataset**, a geometallurgical research dataset from Vale S.A., IMPA and
UFMG. 2,000 samples of 119 inclined holes, each with its position in 3D and its analyses for 18 elements (Ag, Al, Au, C, Ca, Cl, Cu,
F, Fe, K, Mg, Mn, Na, P, Pb, S, Th, U), all in ppm as delivered. The coordinates are in the mine's **local grid** (metres; X -1,150
to 955, Y -883 to 757, Z -400 to 419): the dataset gives no map projection, so this sample has none either. Use it for grade
statistics, compositing, best intercepts, correlation, cross-plots and the 3D view of inclined holes.

## Credit (as the data owners ask)

> GeoMet dataset. Júlio Hoffimann, José Augusto, Lucas Resende, Marlon Mathias, Douglas Mazzinghy, Matheus Bianchetti, Mônica Mendes,
> Thiago Souza, Vitor Andrade, Tarcísio Domingues, Wesley Silva, Ruberlan Silva, Danielly Couto, Elisabeth Fonseca and Keila
> Gonçalves (IMPA, UFMG and Vale S.A.). Zenodo, version v4, 7 March 2022. https://doi.org/10.5281/zenodo.7051975

Licence: Creative Commons Attribution 4.0 International, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). The changes made are
listed below.

## What is real, and what was DERIVED

The source (`drillholes.csv`, 362 kB) is not a set of drillhole tables: it has one row per sample, with `HOLEID`, `X`, `Y`, `Z` (the
sample's position) and the 18 analyses. **The analyses and positions are real and unchanged. The collar, survey and interval tables are
derived from the positions, as follows** (`scripts/samples/build-geomet.mjs`):

- `collars.csv` (118 holes): each hole's first (highest) sample is taken as its collar; the azimuth and dip are those of the line
  to its second sample (dip negative down); the length is the distance along the hole to its last sample. The real collars are
  not in the dataset: a collar here is "the first sample", so the true top of a hole may be a little above it. All 118 holes run
  downwards. One hole with a single sample has no direction and is left out.
- `survey.csv` (1,999 stations): one per sample, at the distance along the hole from the collar (segment by segment, in 3D), with the
  azimuth and dip of the segment that ends there. The holes are drawn as straight segments through the samples, not as measured.
- `assays.csv` (1,999 intervals): one interval per sample, from half way to the sample above to half way to the sample below (the
  first from 0, the last to the hole's length), so the sample's position is inside its interval except at the two ends. The
  dataset does not give the sampled lengths: these intervals are an assumption, not the lab's. `sample_id` is the hole number and the sample's
  order in it. Element columns are `<Element>_ppm`, the values as delivered.

Rebuild with:

```
node scripts/samples/build-geomet.mjs "<folder with drillholes.csv>"
```
