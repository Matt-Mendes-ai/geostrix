"""Open a .geoh5 file written by GeoStrix with geoh5py (the reference reader made by the maker of Geoscience ANALYST) and list what it finds.

    python -m venv venv && venv/Scripts/pip install geoh5py && venv/Scripts/python scripts/geoh5py-check.py file.geoh5

Not part of `npm test` (it needs Python and geoh5py). It reads only; exit code 1 when the file cannot be opened.
"""
import sys
from geoh5py.workspace import Workspace

bad = 0
for path in sys.argv[1:]:
    print("==", path)
    try:
        with Workspace(path, mode="r") as w:
            for o in w.objects:
                kids = [c.name for c in getattr(o, "children", [])]
                print(type(o).__name__, o.name, kids[:10])
                if type(o).__name__ == "Drillhole":
                    print("   collar", tuple(o.collar.tolist()) if hasattr(o.collar, "tolist") else o.collar, "end of hole", o.end_of_hole, "surveys", len(o.surveys), "intervals", None if o.cells is None else len(o.cells))
    except Exception as err:  # noqa: BLE001 - say what geoh5py refused
        bad = 1
        print("CANNOT OPEN:", type(err).__name__, str(err)[:300])
sys.exit(bad)
