"""TASKS.csv #834 — generate GeoStrix's EPSG registry candidates from the EPSG database through PROJ (pyproj).

Run with pyproj on the path (it is NOT a GeoStrix dependency; the registry it produces is committed):
    python scripts/epsg/gen-epsg-registry.py <out.json>
then check and finish it with   node scripts/epsg/verify-epsg-registry.mjs <out.json> src/lib/epsgRegistry.json

For every non-deprecated projected and geographic 2D CRS:
  * the projection as a proj4 string (PROJ's own export), its ellipsoid written out (+a / +rf) and any +datum / +towgs84
    / +nadgrids replaced by the datum shift chosen below;
  * the datum shift to WGS 84: among the transformations PROJ lists for the CRS's area of use, best first, the first
    that is a single 3- or 7-parameter Helmert (+towgs84 in proj4's position-vector convention, rotations in
    arc-seconds, scale in ppm) or a null shift; its stated accuracy (metres, -1 = not stated). When PROJ's list has a
    more accurate operation that needs a correction grid (NTv2 and the like, which GeoStrix does not ship), "grid" is
    set; when there is no Helmert at all, the shift is unknown (null) and the CRS is still usable for data already in it;
  * three test points inside the area of use: WGS 84 lon / lat and PROJ's coordinates in the CRS computed with that
    same operation, for the verify step to compare proj4js against.
"""
import json
import re
import sys
import warnings

from pyproj import CRS, Transformer
from pyproj.aoi import AreaOfInterest
from pyproj.database import get_codes, get_database_metadata
from pyproj.enums import TransformDirection
from pyproj.transformer import TransformerGroup

warnings.filterwarnings("ignore")
WGS84 = CRS.from_epsg(4326)
DROP = re.compile(r"\+(datum|ellps|towgs84|nadgrids|a|b|rf|R|f|no_defs|type)=?\S*")


GRID_STEPS = {"hgridshift", "vgridshift", "xyzgridshift", "gridshift", "tinshift", "deformation"}
PLUMBING = {"unitconvert", "axisswap", "push", "pop", "cart", "noop", "set", "longlat", "latlong", "lonlat", "latlon"}


def helmert_of(definition):
    """+towgs84 (position vector, arc-seconds, ppm) from a PROJ operation string - tokens "step", "inv", "key=value", with
    or without "+" - holding at most one Helmert (or abridged Molodensky) step and no grid; None otherwise."""
    steps, cur = [], None
    toks = definition.replace("+", " ").split()
    if "step" not in toks:
        steps = [{"inv": False, "kv": {}}]
        cur = steps[0]
    for tok in toks:
        if tok == "step":
            cur = {"inv": False, "kv": {}}
            steps.append(cur)
        elif cur is None:
            continue
        elif tok == "inv":
            cur["inv"] = True
        elif "=" in tok:
            k, v = tok.split("=", 1)
            cur["kv"][k] = v
        else:
            cur["kv"][tok] = ""
    procs = [st["kv"].get("proj") for st in steps]
    if any(pr in GRID_STEPS for pr in procs):
        return None
    shifts = [st for st in steps if st["kv"].get("proj") in ("helmert", "molodensky")]
    if any(pr not in PLUMBING and pr not in ("helmert", "molodensky", "pipeline", None) for pr in procs):
        return None
    if not shifts:
        return [0, 0, 0, 0, 0, 0, 0]
    if len(shifts) != 1:
        return None
    st = shifts[0]
    kv = st["kv"]
    f = lambda k: float(kv.get(k) or 0)
    if kv.get("proj") == "molodensky":  # abridged Molodensky: the same three translations
        p = [f("dx"), f("dy"), f("dz"), 0, 0, 0, 0]
    else:
        if any(k in kv for k in ("dx", "dy", "dz", "drx", "dry", "drz", "ds", "t_epoch")):  # time-dependent: not a fixed shift
            return None
        p = [f("x"), f("y"), f("z"), f("rx"), f("ry"), f("rz"), f("s")]
        if kv.get("convention") == "coordinate_frame":
            p[3], p[4], p[5] = -p[3], -p[4], -p[5]
    if st["inv"]:  # PROJ applies this step inverted: the small-angle inverse of a Helmert
        p = [-v for v in p]
    return p


def choose_shift(geod, aoi):
    if geod.equals(WGS84, ignore_axis_order=True):
        return {"towgs84": None, "wgs84": True, "acc": 0, "grid": False, "op": "WGS 84"}
    tg = TransformerGroup(geod, WGS84, always_xy=True, area_of_interest=aoi)
    best_grid = min([op.accuracy for op in tg.unavailable_operations if op.accuracy and op.accuracy > 0] or [None], key=lambda v: v if v is not None else 1e9)
    for t in tg.transformers:
        if "ballpark" in (t.description or "").lower():
            continue
        p = helmert_of(t.definition)
        if p is None:
            continue
        acc = t.accuracy if t.accuracy is not None else -1
        grid = best_grid is not None and (acc < 0 or best_grid < acc)
        return {"towgs84": p, "wgs84": False, "acc": round(acc, 2) if acc >= 0 else -1, "grid": bool(grid), "op": t.description, "transformer": t}
    # no operation covers the whole area (Arc 1950, Minna...: EPSG has one shift per country, each over part of a UTM
    # zone): the most accurate Helmert whose own area overlaps the CRS's, marked "part" (right only where it applies)
    cands = []
    for t in TransformerGroup(geod, WGS84, always_xy=True).transformers:
        if "ballpark" in (t.description or "").lower() or not t.area_of_use:
            continue
        a = t.area_of_use
        if a.east < aoi.west_lon_degree or a.west > aoi.east_lon_degree or a.north < aoi.south_lat_degree or a.south > aoi.north_lat_degree:
            continue
        p = helmert_of(t.definition)
        if p is not None:
            cands.append((t.accuracy if t.accuracy and t.accuracy > 0 else 1e9, t, p))
    if cands:
        acc, t, p = min(cands, key=lambda c: c[0])
        return {"towgs84": p, "wgs84": False, "acc": round(acc, 2) if acc < 1e9 else -1, "grid": best_grid is not None, "part": True,
                "op": t.description, "transformer": t}
    return {"towgs84": None, "wgs84": False, "acc": None, "grid": best_grid is not None, "op": None}


def ellipsoid_of(crs):
    e = crs.ellipsoid
    a, rf = e.semi_major_metre, e.inverse_flattening
    return f"+a={a:.10g} +rf={rf:.12g}" if rf and rf > 0 else f"+a={a:.10g} +b={a:.10g}"


def fmt(v):
    return f"{v:.10g}"


def main(out):
    meta = get_database_metadata("EPSG.VERSION")
    rows, skipped = {}, {"no_proj4": 0, "no_area": 0, "error": 0}
    codes = [(c, "projected") for c in get_codes("EPSG", "PROJECTED_CRS")] + [(c, "geographic") for c in get_codes("EPSG", "GEOGRAPHIC_2D_CRS")]
    for i, (code, kind) in enumerate(codes):
        try:
            crs = CRS.from_epsg(int(code))
            au = crs.area_of_use
            if not au:
                skipped["no_area"] += 1
                continue
            aoi = AreaOfInterest(au.west, au.south, au.east, au.north)
            geod = crs.geodetic_crs
            shift = choose_shift(geod, aoi)
            try:
                p4 = crs.to_proj4()
            except Exception:
                p4 = None
            if not p4:
                skipped["no_proj4"] += 1
                continue
            base = re.sub(r"\s+", " ", DROP.sub("", p4)).strip()
            if shift["wgs84"]:
                datum = "+datum=WGS84"
            else:
                datum = ellipsoid_of(crs) + (f" +towgs84={','.join(fmt(v) for v in shift['towgs84'])}" if shift["towgs84"] is not None else "")
            definition = f"{base} {datum} +no_defs"
            # test points: centre and two inset corners of the area of use (dateline-crossing areas: centre only)
            w, s, e, n = au.west, au.south, au.east, au.north
            pts = [((w + e) / 2, (s + n) / 2)] if e < w else [((w + e) / 2, (s + n) / 2), (w + 0.25 * (e - w), s + 0.25 * (n - s)), (w + 0.75 * (e - w), s + 0.75 * (n - s))]
            tests, conv_tests = [], []
            conv = None if kind == "geographic" else Transformer.from_crs(geod, crs, always_xy=True)
            if conv is not None:  # the projection alone, on its own datum (checked for every projected code)
                for lon, lat in pts:
                    x, y = conv.transform(lon, lat)
                    conv_tests.append([round(lon, 9), round(lat, 9), x, y])
            if shift.get("transformer") is not None or shift["wgs84"]:
                to_src = shift.get("transformer")
                for lon, lat in pts:
                    if to_src is not None:
                        slon, slat = to_src.transform(lon, lat, direction=TransformDirection.INVERSE)
                    else:
                        slon, slat = lon, lat
                    x, y = (slon, slat) if conv is None else conv.transform(slon, slat)
                    tests.append([round(lon, 9), round(lat, 9), x, y])
            rows[code] = {"name": crs.name, "kind": kind, "def": definition, "acc": shift["acc"], "grid": shift["grid"], "part": bool(shift.get("part")), "op": shift["op"],
                          "area": [round(w, 4), round(s, 4), round(e, 4), round(n, 4)], "tests": tests, "convTests": conv_tests,
                          "ellps": ellipsoid_of(crs), "pm": crs.prime_meridian.longitude}
        except Exception as exc:  # noqa: BLE001 — counted and reported, never silently kept
            skipped["error"] += 1
            if skipped["error"] <= 10:
                print("error", code, exc, file=sys.stderr)
        if i % 500 == 0:
            print(f"{i}/{len(codes)}", file=sys.stderr)
    json.dump({"epsg": meta, "proj": __import__("pyproj").proj_version_str, "rows": rows, "skipped": skipped}, open(out, "w", encoding="utf-8"))
    print(f"{len(rows)} candidates, skipped {skipped}, EPSG {meta}")


if __name__ == "__main__":
    main(sys.argv[1])
