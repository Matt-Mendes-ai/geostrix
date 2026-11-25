# Synthetic geophysics fixtures (TASKS.csv #4070)

Small **made-up** files for the Geophysics panes that had no sample to measure or check live: TEM line data, MT / AMT soundings and FDEM 1D.
They are **not real geophysical data** and were not measured anywhere: every value comes from the formulae in `make.mjs`. They sit over the
WA lode gold sample's area (GDA94 / MGA zone 51) so they land in that project when imported. They were made for GeoStrix and may be shared
with it under its MIT licence.

- `tem_lines_SYNTHETIC.xyz`: an Aarhus Workbench layout: 3 east-west lines of 41 stations 50 m apart, 16 gates from 0.01 to 3 ms. Each decay
  is `C exp(-t / tau)`, tau 0.3 ms in the background and 1.6 ms over a made-up conductor.
- `mt_SYNTHETIC_1.edi` … `mt_SYNTHETIC_5.edi`: five EDI soundings 0.005° apart along a line, 16 frequencies from 10 kHz to 0.01 Hz: about
  300 ohm·m over 10 ohm·m from 400–640 m (deepening to the east), as a smooth apparent-resistivity curve with a phase bump.
- `dhem_maxwell_SYNTHETIC.tem`: a borehole EM Maxwell table (CRLF) for a made-up hole `DH-SYN-01` (it matches no sample hole by name), stations
  every 10 m to 300 m, components A, U and V, 10 gates; a made-up conductor at 180 m (A crosses zero there, U and V peak beside it).
- `fdem_dualem_SYNTHETIC.csv`: a DUALEM-421 style CSV, 80 readings 10 m apart on a north–south walk; apparent conductivity rises over a
  made-up clay lens.

Regenerate with `node test/fixtures/geophys4070/make.mjs`; `test/geophysFixtures4070.test.mjs` checks the files still match it and still read.
