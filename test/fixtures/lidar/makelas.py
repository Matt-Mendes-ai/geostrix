# TASKS.csv #1994 — small LAS / LAZ test files with known contents (laspy 2.6.1 + lazrs 0.7.0)
# A 100 m x 60 m tile at Woodjam-like UTM coordinates: ground on a plane z = 1000 + 0.1 x' + 0.05 y' (x', y' from the SW
# corner), "trees" 15 m above it, two noise points, one withheld point. 600 points, deterministic.
import sys, json, laspy, numpy as np
from laspy.vlrs.known import WktCoordinateSystemVlr, GeoKeyDirectoryVlr, GeoKeyEntryStruct
out = sys.argv[1]
x0, y0 = 620000.0, 5800000.0
rng = np.random.default_rng(1994)
n = 600
xs = x0 + rng.uniform(0, 100, n); ys = y0 + rng.uniform(0, 60, n)
ground = 1000 + 0.1 * (xs - x0) + 0.05 * (ys - y0)
cls = np.where(np.arange(n) % 3 == 0, 5, 2).astype(np.uint8)  # every third point high vegetation, the rest ground
zs = np.where(cls == 5, ground + 15, ground)
cls[10] = 7; zs[10] = ground[10] - 40  # low noise
cls[11] = 18; zs[11] = ground[11] + 300  # high noise
inten = (np.arange(n) * 37 % 4000).astype(np.uint16)
WKT = 'PROJCS["NAD83 / UTM zone 10N",GEOGCS["NAD83",DATUM["North_American_Datum_1983",SPHEROID["GRS 1980",6378137,298.257222101,AUTHORITY["EPSG","7019"]],AUTHORITY["EPSG","6269"]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4269"]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-123],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Easting",EAST],AXIS["Northing",NORTH],AUTHORITY["EPSG","26910"]]'
facts = {}
for fmt, ver, ext in [(1, "1.2", "las"), (3, "1.2", "laz"), (6, "1.4", "laz"), (7, "1.4", "las"), (8, "1.4", "laz")]:
    h = laspy.LasHeader(point_format=fmt, version=ver)
    h.scales = np.array([0.001, 0.001, 0.001]); h.offsets = np.array([x0, y0, 0.0])
    if fmt >= 6:
        h.vlrs.append(WktCoordinateSystemVlr(WKT))
    else:
        gk = GeoKeyDirectoryVlr()
        gk.geo_keys_header.number_of_keys = 3
        gk.geo_keys = [GeoKeyEntryStruct(1024, 0, 1, 1), GeoKeyEntryStruct(3072, 0, 1, 26910), GeoKeyEntryStruct(3076, 0, 1, 9001)]
        h.vlrs.append(gk)
    las = laspy.LasData(h)
    las.x = xs; las.y = ys; las.z = zs; las.intensity = inten
    las.classification = cls
    w = np.zeros(n, dtype=np.uint8); w[12] = 1
    las.withheld = w
    name = f"lidar_fmt{fmt}.{ext}"
    las.write(f"{out}/{name}")
    keep = (w == 0) & (cls != 7) & (cls != 18)
    g = keep & (cls == 2)
    facts[name] = {"format": fmt, "version": ver, "points": n, "ground": int(g.sum()), "veg": int((keep & (cls == 5)).sum()), "groundMeanZ": float(np.round(zs[g], 3).mean()),
                   "first": [round(float(xs[0]), 3), round(float(ys[0]), 3), round(float(zs[0]), 3), int(inten[0]), int(cls[0])], "withheldCls": int(cls[12])}
print(json.dumps(facts, indent=1))
