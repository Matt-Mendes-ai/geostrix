# TASKS.csv #1994 — a tiny COPC file (LAS 1.4, point format 6, one LAZ chunk per octree node, hierarchy EVLR) with known
# contents: depth 0 one node of 50 points, depth 1 four nodes of 50, depth 2 four nodes of 100 (650 points). Class 2 at depth
# 0 and 1, class 5 at depth 2, so reading the first two levels gives 250 ground points and no vegetation.
import io, struct, sys, json
import numpy as np, lazrs
out = sys.argv[1]
rng = np.random.default_rng(7)
x0, y0, sc = 620000.0, 5800000.0, 0.001
levels = [(0, [(0, 0, 0)], 50, 2), (1, [(0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 1, 0)], 50, 2), (2, [(0, 0, 0), (1, 1, 0), (2, 2, 0), (3, 3, 0)], 100, 5)]
nodes = []
for d, keys, n, cls in levels:
    for k in keys:
        xs = rng.uniform(0, 100, n); ys = rng.uniform(0, 100, n); zs = 500 + 0.2 * xs + (15 if cls == 5 else 0)
        nodes.append((d, k, xs, ys, zs, cls))
R = 30
def rec(x, y, z, cls, i):
    b = bytearray(R)
    struct.pack_into("<iiiH", b, 0, round(x / sc), round(y / sc), round(z / sc), i % 1000)
    b[14] = 0x11  # return 1 of 1
    b[16] = cls
    return bytes(b)
vlr = lazrs.LazVlr.new_for_compression(6, 0, True)
LAZ_DATA = vlr.record_data()
def vlr_bytes(user, rid, data):
    return struct.pack("<H16sHH32s", 0, user.encode().ljust(16, b"\0"), rid, len(data), b"".ljust(32, b"\0")) + data
copc_info_len = 160
HEADER = 375
vlr_block_len = (54 + copc_info_len) + (54 + len(LAZ_DATA))
off_points = HEADER + vlr_block_len
# points: compress chunk by chunk, noting each chunk's start
dest = io.BytesIO()
comp = lazrs.LasZipCompressor(dest, vlr)
comp.reserve_offset_to_chunk_table()
starts = []
total = 0
allz = []
for (d, k, xs, ys, zs, cls) in nodes:
    starts.append(dest.tell())
    data = b"".join(rec(xs[i], ys[i], zs[i], cls, total + i) for i in range(len(xs)))
    comp.compress_many(data)
    comp.finish_current_chunk()
    total += len(xs)
    allz.append(np.round(zs, 3))
comp.done()
pts = bytearray(dest.getvalue())
# lazrs writes the chunk table's offset relative to its own stream (which starts at the point data): LAZ wants it absolute
table_off = struct.unpack_from("<q", pts, 0)[0]
struct.pack_into("<q", pts, 0, table_off + off_points)
pts = bytes(pts)
sizes = [((starts[i + 1] if i + 1 < len(starts) else table_off) - starts[i]) for i in range(len(starts))]
evlr_start = off_points + len(pts)
entries = b"".join(struct.pack("<iiiiQii", d, k[0], k[1], k[2], off_points + starts[i], sizes[i], len(xs)) for i, (d, k, xs, ys, zs, cls) in enumerate(nodes))
evlr = struct.pack("<H16sHQ32s", 0, b"copc".ljust(16, b"\0"), 1000, len(entries), b"".ljust(32, b"\0")) + entries
hier_off = evlr_start + 60
copc_info = struct.pack("<5d2Q2d", x0 + 50, y0 + 50, 520, 50, 1.0, hier_off, len(entries), 0, 0) + b"\0" * 88
assert len(copc_info) == 160
allx = np.concatenate([n[2] for n in nodes]); ally = np.concatenate([n[3] for n in nodes]); allzz = np.concatenate(allz)
h = bytearray(HEADER)
h[0:4] = b"LASF"
struct.pack_into("<BB", h, 24, 1, 4)
h[26:58] = b"GeoStrix test".ljust(32, b"\0"); h[58:90] = b"makecopc.py #1994".ljust(32, b"\0")
struct.pack_into("<HIIBHI", h, 94, HEADER, off_points, 2, 6 | 0x80, R, 0)
struct.pack_into("<3d3d", h, 131, sc, sc, sc, x0, y0, 0.0)
struct.pack_into("<6d", h, 179, x0 + allx.max(), x0 + allx.min(), y0 + ally.max(), y0 + ally.min(), allzz.max(), allzz.min())
struct.pack_into("<QQIQ", h, 227, 0, evlr_start, 1, total)
blob = bytes(h) + vlr_bytes("copc", 1, copc_info) + vlr_bytes("laszip encoded", 22204, LAZ_DATA) + pts + evlr
open(f"{out}/lidar_tiny.copc.laz", "wb").write(blob)
g01 = np.concatenate(allz[:5])
print(json.dumps({"points": total, "level01": int(sum(len(n[2]) for n in nodes[:5])), "groundMean01": float(g01.mean()), "groundMeanAll": float(np.concatenate(allz[:5]).mean()), "bytes": len(blob), "sizes": sizes}))
