# TASKS.csv #3514 — a curated subset of the USGS Spectral Library Version 7 (Kokaly et al. 2017, Data Series 1035), for the Hyperspectral tab's
# reference spectra: one spectrum for each of ~45 minerals common in hydrothermal alteration and weathering, from the ASD field-spectrometer sets
# (splib07b_..._ASDFR / ASDNG, 0.35-2.5 micrometres in 1 nm channels), else the Beckman laboratory set, resampled to 5 nm over 350-2500 nm. The USGS data are U.S. Government works (public domain); the USGS
# asks for acknowledgement. The library itself is NOT in the repository: run this against ASCIIdata_splib07b.zip (43 MB, ScienceBase item
# 586e8c88e4b0f5ce109fccae) and it writes src/lib/usgsSpectraSubset.json (about 100 kB), which is.
#   python -I scripts/spectral/build-usgs-splib-subset.py path/to/ASCIIdata_splib07b.zip
import json, re, sys, zipfile

WANT = [  # (label shown, regexp for the file name after 'splib07b_', chapter)
    ("Kaolinite", r"^Kaolinite_", "M"), ("Dickite", r"^Dickite_", "M"), ("Halloysite", r"^Halloysite_", "M"), ("Alunite", r"^Alunite_", "M"),
    ("Natroalunite", r"^Natroalunite_", "M"), ("Pyrophyllite", r"^Pyrophyllite_", "M"), ("Muscovite", r"^Muscovite_", "M"), ("Illite", r"^Illite_", "M"),
    ("Paragonite", r"^Paragonite_", "M"), ("Montmorillonite", r"^Montmorillonite_", "M"), ("Nontronite", r"^Nontronite_", "M"), ("Beidellite", r"^Beidellite_", "M"),
    ("Chlorite (clinochlore)", r"^Clinochlore_", "M"), ("Chlorite (chamosite)", r"^Chamosite_", "M"), ("Epidote", r"^Epidote_", "M"), ("Calcite", r"^Calcite_", "M"),
    ("Dolomite", r"^Dolomite_", "M"), ("Siderite", r"^Siderite_", "M"), ("Ankerite", r"^Ankerite_", "M"), ("Magnesite", r"^Magnesite_", "M"), ("Jarosite", r"^Jarosite_", "M"),
    ("Goethite", r"^Goethite_", "M"), ("Hematite", r"^Hematite_", "M"), ("Gypsum", r"^Gypsum_", "M"), ("Tourmaline", r"^Tourmaline_", "M"),
    ("Topaz", r"^Topaz_", "M"), ("Diaspore", r"^Diaspore_", "M"), ("Biotite", r"^Biotite_", "M"), ("Phlogopite", r"^Phlogopite_", "M"), ("Talc", r"^Talc_", "M"),
    ("Serpentine (lizardite)", r"^Lizardite_", "M"), ("Serpentine (antigorite)", r"^Antigorite_", "M"), ("Actinolite", r"^Actinolite_", "M"), ("Tremolite", r"^Tremolite_", "M"),
    ("Buddingtonite", r"^Buddingtonite_", "M"), ("Opal", r"^Opal_", "M"), ("Quartz", r"^Quartz_", "M"), ("Fluorite", r"^Fluorite_", "M"), ("Sphalerite", r"^Sphalerite_", "M"),
    ("Pyrite", r"^Pyrite_", "M"), ("Chalcopyrite", r"^Chalcopyrite_", "M"), ("Zoisite", r"^Zoisite_", "M"), ("Prehnite", r"^Prehnite_", "M"), ("Hornblende", r"^Hornblende_", "M"),
    ("Orthoclase", r"^Orthoclase_", "M"), ("Albite", r"^Albite_", "M"), ("Rhodochrosite", r"^Rhodochrosite_", "M"),
]
BAD = -1e30
z = zipfile.ZipFile(sys.argv[1])
names = z.namelist()
def read_grid(key):
    name = next(n for n in names if key in n)
    return [float(v) * 1000 for v in z.read(name).decode().split(chr(10))[1:] if v.strip()]  # micrometres -> nm (the first line is a header)
GRIDS = {2151: read_grid("Wavelengths_ASDFR_0.35-2.5microns_2151ch"), 3961: read_grid("Wavelengths_BECK_Beckman_interp._3961_ch")}
grid = [350 + 5 * i for i in range(431)]  # 350 ... 2500 nm
IDX = {n: [min(range(len(w)), key=lambda k: abs(w[k] - g)) for g in grid] for n, w in GRIDS.items()}
out = []
for label, pat, chap in WANT:
    cands = [n for n in names if f"/Chapter{chap}_" in n and n.endswith(".txt") and re.search(r"_(ASDFR|ASDNG|BECK)[abc]_AREF\.txt$", n) and re.search(pat, n.split("splib07b_")[-1])]
    best = None
    for n in sorted(cands, key=lambda n: (0 if "_ASD" in n else 1, n)): # the ASD field spectra first (0.35-2.5 um), then the Beckman lab ones
        txt = z.read(n).decode().split("\n")
        head, vals = txt[0].strip(), [float(v) for v in txt[1:] if v.strip()]
        if len(vals) not in GRIDS: continue
        # channels the instrument could not give (the water bands, the ends) are marked -1.23e34: a run of at most 60 channels inside the
        # spectrum is bridged linearly; a spectrum with more missing, or a gap at either end over 40 channels, is passed over
        ok = [v > BAD for v in vals]
        if sum(ok) < 0.85 * len(vals): continue
        first, last = ok.index(True), len(ok) - 1 - ok[::-1].index(True)
        if first > 40 or len(ok) - 1 - last > 40: continue
        vals = [vals[first] if i < first else vals[last] if i > last else v for i, v in enumerate(vals)]
        ok = [i < first or i > last or o for i, o in enumerate(ok)]
        fixed, i, bridged = vals[:], 0, True
        while i < len(vals):
            if ok[i]: i += 1; continue
            j = i
            while j < len(vals) and not ok[j]: j += 1
            if j - i > 60: bridged = False; break
            for k in range(i, j): fixed[k] = vals[i - 1] + (vals[j] - vals[i - 1]) * (k - i + 1) / (j - i + 1)
            i = j
        if bridged and all(-0.05 < v < 2.0 for v in fixed):
            best = (n, head, fixed); break
    if not best: print("no clean ASD spectrum for", label); continue
    n, head, vals = best
    out.append({"name": label, "record": head.replace("splib07b ", "").strip(), "file": n.split("/")[-1], "values": [round(vals[i], 4) for i in IDX[len(vals)]]})
doc = {
    "source": "USGS Spectral Library Version 7 (splib07b, ASD spectra): Kokaly, R.F., Clark, R.N., Swayze, G.A., Livo, K.E., Hoefen, T.M., Pearson, N.C., Wise, R.A., Benzel, W.M., Lowers, H.A., Driscoll, R.L., and Klein, A.J., 2017, USGS Spectral Library Version 7: U.S. Geological Survey Data Series 1035, 61 p., https://doi.org/10.3133/ds1035. Data: https://doi.org/10.5066/F7RR1WDJ",
    "licence": "U.S. Government work, public domain. The USGS asks for acknowledgement in derived products and gives no warranty.",
    "wavelengthNm": {"from": 350, "step": 5, "count": 431},
    "spectra": out,
}
json.dump(doc, open("src/lib/usgsSpectraSubset.json", "w", encoding="utf-8"), separators=(",", ":"))
print(len(out), "spectra,", len(json.dumps(doc, separators=(",", ":"))) // 1024, "kB")
