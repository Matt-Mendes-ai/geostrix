"""TASKS.csv #905 - build src/lib/cdogsIndex.json, the spatial index of the Geological Survey of Canada's CDoGS surveys
that have standardised data packages, from the three tables export-cdogs-tables.ps1 writes (Open Government Licence -
Canada). For each survey: its key, name, year, extent (NAD83 lon / lat) and its packages (sample type, size fraction,
samples); for each package: name, laboratory and its element columns (spreadsheet column, element, unit ppm / pct / ppb,
determination limit). The app fetches svy<key>_pkg_<package>a.xlsx for the chosen survey and package.

    python -I scripts/samples/build-cdogs-index.py <dir with the three CSVs> [out.json]

TASKS.csv #984 - reproducible: each package's columns in Package_Order_Of_Presentation (Access returns them in no set
order), "built" is the day it runs, and a non-numeric survey year is left empty instead of stopping the build.
ASSUMPTION (not checked against the database): survey_packages.Organisation_FieldWork_ID is the same number as
surveys.Organisation_ID; surveys whose packages do not match by it are left out of the index.
"""
import csv, html, json, os, re, sys
from datetime import date

src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "..", "src", "lib", "cdogsIndex.json")
read = lambda n: list(csv.DictReader(open(os.path.join(src, n + ".csv"), encoding="utf-8-sig")))
plain = lambda s: re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()
UNITS = {"ppm": "ppm", "percent": "pct", "ppb": "ppb"}
num = lambda s: float(s) if s not in ("", None) else None

def order_of(r):
    try:
        return float(r.get("Package_Order_Of_Presentation") or "inf")
    except ValueError:
        return float("inf")


def year_of(v):
    try:
        return int(float(v)) if v not in ("", None) else None
    except ValueError:
        return None


packages = {}
for r in sorted(read("package_columns"), key=lambda r: (int(r["Analytical_Package_ID"]), order_of(r), r["Spreadsheet_Column_Name"] or "")):
    unit = UNITS.get(plain(r["Analytical_Unit_Name_en"]).lower())
    sym = (r["Analytical_Quantity_Abbreviation_en"] or "").strip()
    col = (r["Spreadsheet_Column_Name"] or "").strip()
    pid = int(r["Analytical_Package_ID"])
    p = packages.setdefault(pid, {"name": plain(r["Analytical_Package_Name_en"]), "lab": plain(r["Laboratory_Name_en"]), "cols": {}})
    if unit and col and re.fullmatch(r"[A-Z][a-z]?", sym):  # elements only: no weights, counts, pH, oxides by name
        dl = num(r["Determination_Limit"])
        p["cols"][col] = [sym, unit] + ([dl] if dl is not None else [])

surveys = {}
for r in read("surveys"):
    try:
        w, e, s, n = (float(r[k]) for k in ("Minimum_Longitude_NAD83", "Maximum_Longitude_NAD83", "Minimum_Latitude_NAD83", "Maximum_Latitude_NAD83"))
    except ValueError:
        continue
    surveys[(int(r["Organisation_ID"]), int(r["Survey_ID"]))] = {"name": plain(r["Survey_Description_Short_en"]), "year": year_of(r["Survey_Year"]), "box": [round(w, 4), round(s, 4), round(e, 4), round(n, 4)], "pk": {}}

for r in read("survey_packages"):
    if not r["Analytical_Status_Description_en"].startswith("preferred"):
        continue
    key = (int(r["Organisation_FieldWork_ID"]), int(r["Survey_ID"]))
    sv, pid = surveys.get(key), int(r["Analytical_Package_ID"])
    if not sv or not packages.get(pid, {}).get("cols"):
        continue
    k = (pid, r["Sample_Type_Description_Short_en"].strip(), plain(r["Preparation_Method_Name_en"]))
    n = int(float(r["N"])) if r["N"] else 0
    sv["pk"][k] = max(sv["pk"].get(k, 0), n)

out_surveys, used = [], set()
for (org, sid), sv in sorted(surveys.items()):
    if not sv["pk"]:
        continue
    pk = [[pid, st, prep, n] for (pid, st, prep), n in sorted(sv["pk"].items())]
    used.update(p[0] for p in pk)
    out_surveys.append([f"{org:02d}{sid:04d}", sv["name"], sv["year"], *sv["box"], pk])
index = {
    "source": "Geological Survey of Canada, Canadian Database of Geochemical Surveys (CDoGS) metadata database, Open Government Licence - Canada",
    "built": date.today().isoformat(),
    "surveys": out_surveys,
    "packages": {str(pid): [packages[pid]["name"], packages[pid]["lab"], packages[pid]["cols"]] for pid in sorted(used)},
}
json.dump(index, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(out_surveys)} surveys, {len(used)} packages, {os.path.getsize(out):,} bytes -> {out}")
