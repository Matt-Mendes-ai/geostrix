# GeoStrix predictive-modelling add-on (TASKS.csv #638) — the geoML models GeoStrix runs.
# Copyright (C) 2026 Matt Mendes. Licensed under the GNU GPL v3 (see ../LICENSE): this add-on runs geoML
# (Ítalo Gonçalves, GPL-3.0, https://github.com/italo-goncalves/geoML), so the add-on as a whole is GPL-3.0.
# GeoStrix itself (the desktop app) is a separate program under the MIT licence; they talk over local HTTP.
#
# Two jobs, each a pure function of its JSON parameters, reporting progress through `progress(fraction, text)`:
#   domain — implicit model of one rock unit (a set of logged codes) against the rest: the contact surface with
#            the model's uncertainty on every vertex, and blocks with the unit's probability and uncertainty.
#   grade  — Gaussian-process grade model (Box-Cox warped, so grades stay positive) on composites: blocks with the
#            predicted grade, its spread (P10 / P90) and uncertainty.
# Coordinates in and out are the project's own (GeoStrix sends and receives world x / y / z).
import math
import time
import warnings

import numpy as np
import pandas as pd

MAX_BLOCKS_OUT = 100_000  # GeoStrix's 3D-view cell budget


def _holes(geoml, p):
    collar = pd.DataFrame(p["collars"])
    survey = pd.DataFrame(p.get("survey") or [])
    kw = dict(hole="hole_id", x="x", y="y", z="z", length="length", dip="dip", azimuth="azimuth", depth="depth",
              dip_positive_down=False)  # the API takes dips negative-down; GeoStrix (positive-down inside) negates them when sending (#644)
    collar["hole_id"] = collar["hole_id"].astype(str)
    if len(survey):
        survey["hole_id"] = survey["hole_id"].astype(str)
    return geoml.data.DrillholeData(collar, survey=survey if len(survey) else None, **kw)


def _anisotropy(geoml, p, rng):
    """TASKS.csv #650 — the model's anisotropy. With a structural trend from GeoStrix (p["trend"]: azimuth / dip of the
    maximum axis, rake, midFct = int / max, minFct = min / int — lib/trend.js trendToGeoml) the orientation and the
    ratios are the geologist's and are held fixed while training; only the overall range is learnt. Without one,
    the add-on's earlier behaviour (orientation 0 / 0, isotropic ratios, everything trainable)."""
    t = p.get("trend")
    if not t:
        return geoml.transform.Anisotropy3D(rng, float(p.get("ratio_y", 1.0)), float(p.get("ratio_z", 1.0)),
                                            azimuth=float(p.get("azimuth", 0.0)), dip=float(p.get("dip", 0.0)))
    clamp = lambda v, lo, hi: min(hi, max(lo, float(v)))
    tr = geoml.transform.Anisotropy3D(rng, clamp(t["midFct"], 0.05, 1.0), clamp(t["minFct"], 0.01, 1.0),
                                      azimuth=float(t["azimuth"]) % 360, dip=clamp(t["dip"], 0.0, 90.0), rake=clamp(t["rake"], -90.0, 90.0))
    for k in ("azimuth", "dip", "rake", "midrange_fct", "minrange_fct"):
        tr.parameters[k].fix()
    return tr


def _range_report(tr, start):
    """TASKS.csv #673 — the range the model actually learnt (the add-on's 400 / 150 m are only training's starting
    point: Woodjam IMMOQ settled at 883 m, Cu at 291 m), with the in-plane / across ratios, so GeoStrix can clip its
    blocks to where the model is informed rather than to the starting value."""
    def val(k):
        try:
            return float(np.asarray(tr.parameters[k].get_value()).ravel()[0])
        except Exception:  # noqa: BLE001 — an older geoML without that parameter: report what is known
            return None
    return {"start": float(start), "trained": val("maxrange"), "mid_fct": val("midrange_fct"), "min_fct": val("minrange_fct")}


def _grid(lo, hi, cell, max_cells):
    """A regular block grid over [lo, hi] with cubic cells of at least `cell`, grown until it fits max_cells."""
    lo, hi = np.asarray(lo, float), np.asarray(hi, float)
    while True:
        n = np.maximum(1, np.ceil((hi - lo) / cell).astype(int))
        if int(np.prod(n)) <= max_cells:
            return n, cell
        cell *= 1.25


def _capped_inducing(geoml, dense, sparse, n, seed, mode="thin"):
    """TASKS.csv #1158 — at most n inducing points. "thin": every k-th of the points geoML itself dropped along the holes and at
    the contacts, so they stay on the holes (k-means centroids sat between holes: on Treaty Creek PS_DK the model then learnt a
    2-3 km range and predicted the unit nowhere). "kmeans": two thirds on the unit and its contacts, kept for comparison."""
    if mode == "thin":
        xyz = np.asarray(sparse.coordinates)
        idx = np.unique(np.linspace(0, len(xyz) - 1, n).round().astype(int))
        return geoml.data.PointData(pd.DataFrame(xyz[idx], columns=["X", "Y", "Z"]), ["X", "Y", "Z"])
    v = dense.variables["UNIT"]
    a, b = np.asarray(v.measurements_a.to_numpy()), np.asarray(v.measurements_b.to_numpy())
    near = (a == "Target") | (b == "Target")
    xyz = np.asarray(dense.coordinates)
    picked = []
    n_near = min(int(np.sum(near)), max(1, (2 * n) // 3))
    for mask, count in ((near, n_near), (~near, min(int(np.sum(~near)), n - n_near))):
        if count > 0:
            picked.append(np.asarray(geoml.data.inducing.from_kmeans(xyz[mask], count, seed=seed).coordinates))
    return geoml.data.PointData(pd.DataFrame(np.vstack(picked), columns=["X", "Y", "Z"]), ["X", "Y", "Z"])


def _fit_check(geoml, model, dense):
    """TASKS.csv #1158 — the model against what is logged: the share of training points inside the unit it puts inside (probability
    over 0.5), and of those in other rock it puts outside. Treaty Creek V4 at Fast finished with 0 % of its in-unit points inside, and
    nothing said so: a finished run is not a good model. None if the check itself fails: it must never cost the result."""
    try:
        v = dense.variables["UNIT"]
        a, b = np.asarray(v.measurements_a.to_numpy()), np.asarray(v.measurements_b.to_numpy())
        pts = geoml.data.PointData(pd.DataFrame(np.asarray(dense.coordinates), columns=["X", "Y", "Z"]), ["X", "Y", "Z"])
        model.predict(pts)
        prob = np.asarray(pts.values("UNIT/Target/probability")).ravel()
        inside, other = (a == "Target") & (b == "Target"), (a != "Target") & (b != "Target")
        if not inside.any() or not other.any():
            return None
        return {"in_unit": round(float(np.mean(prob[inside] > 0.5)), 3), "other": round(float(np.mean(prob[other] < 0.5)), 3), "n_in_unit": int(inside.sum()), "n_other": int(other.sum())}
    except Exception:  # noqa: BLE001
        return None


def _probabilities_at(geoml, model, points):
    """TASKS.csv #1318 — the unit's probability at points the app chose: its logged intercepts, along the traces it draws. None if there are none, or
    if it fails: it must never cost the result."""
    try:
        if not points:
            return None
        pts = geoml.data.PointData(pd.DataFrame(np.asarray(points, float), columns=["X", "Y", "Z"]), ["X", "Y", "Z"])
        model.predict(pts)
        return np.asarray(pts.values("UNIT/Target/probability")).ravel().round(3).tolist()
    except Exception:  # noqa: BLE001
        return None


def _train(model, iterations, progress, lo, hi, label):
    """train_full in chunks so progress can be reported (and a cancel lands between chunks)."""
    done, chunk = 0, max(10, iterations // 20)
    while done < iterations:
        step = min(chunk, iterations - done)
        model.train_full(max_iter=step)
        done += step
        progress(lo + (hi - lo) * done / iterations, f"{label}: {done} / {iterations} iterations")


def _focused_points(dense, n_other):
    """Every point in the unit and at its contacts, and every k-th of the others up to n_other."""
    v = dense.variables["UNIT"]
    a, b = np.asarray(v.measurements_a.to_numpy()), np.asarray(v.measurements_b.to_numpy())
    near = (a == "Target") | (b == "Target")
    other = np.flatnonzero(~near)
    if len(other) > n_other:
        other = other[np.unique(np.linspace(0, len(other) - 1, n_other).round().astype(int))]
    return dense[np.sort(np.concatenate([np.flatnonzero(near), other]))]


def _domain_train(geoml, p, holes, progress):
    """The intervals to a trained model. Also used for the held-out check, on fewer holes."""
    target = set(map(str, p["target_values"]))
    exclude = set(map(str, p.get("exclude_values") or []))
    iv = pd.DataFrame(p["intervals"])
    iv["hole_id"] = iv["hole_id"].astype(str)
    iv["value"] = iv["value"].astype(str)
    iv = iv[~iv["value"].isin(exclude)].copy()
    iv["UNIT"] = np.where(iv["value"].isin(target), "Target", "Other")
    holes.add_intervals("lito", iv[["hole_id", "from", "to", "UNIT"]], hole="hole_id", fr="from", to="to", categorical=["UNIT"])
    holes.add_intervals("lito", holes.merge_domains(("lito", "UNIT")))
    # TASKS.csv #1312 — a thin unit: dense along it and at its contacts, the other rock thinned to a budget. Sent by the app only when the
    # unit's runs are thin; on a thick unit it shortens the learnt range and the unit vanishes from holes it has not seen (IMMOQ).
    focus_other = int(p.get("focus_other") or 0)
    dense = holes.as_classification_input(("lito", "UNIT"), length=float(p.get("focus_spacing") if focus_other and p.get("focus_spacing") else p.get("train_spacing", 5.0)))
    if focus_other:
        dense = _focused_points(dense, focus_other)
    sparse = holes.as_classification_input(("lito", "UNIT"), length=float(p.get("inducing_spacing", 40.0)))
    # TASKS.csv #1158 — every contact and every short run adds a point at ANY spacing, so a unit with thousands of contacts built
    # thousands of inducing points however coarse the spacing was: Treaty Creek V4, about 5,970, past 5 GB and still on its first
    # iterations. Every contact stays in the training data the model must honour; only the inducing points are capped.
    max_inducing = int(p.get("max_inducing") or 0)
    if max_inducing and sparse.n_data > max_inducing:
        sparse = _capped_inducing(geoml, dense, sparse, max_inducing, int(p.get("seed", 1234)), str(p.get("inducing_mode", "thin")))
    n_contacts = int(np.sum(dense.values("UNIT/boundary")))
    if n_contacts == 0:
        raise ValueError("The chosen unit has no contact with the other rock in these holes — nothing to model.")

    rng = float(p.get("range", 400.0))
    tr = _anisotropy(geoml, p, rng)  # #673 — kept, to read back the range training settled on
    inp = geoml.latent.BasicInput(inducing_points=sparse, center=True, transform=tr)
    deep = p.get("model") == "deep"
    if deep:  # chapter 17: a vector field moves the coordinates so one stationary field can follow folds
        walked = geoml.latent.GPWalk(geoml.latent.BasicGP(inp, size=3), n_steps=5)
        field = geoml.latent.BasicGP(walked, size=1, isotropic=True)
    else:
        field = geoml.latent.BasicGP(inp, size=1)
    model = geoml.models.VGPNetwork(dense, "UNIT", geoml.likelihood.CategoricalGaussianIndicator(2), geoml.latent.Linear(field, size=2),
                                    options=geoml.models.GPOptions(jitter=1e-6, training_batch_size=500, verbose=False))
    iterations = int(p.get("iterations", 300))
    progress(0.08, f"Training ({dense.n_data} points, {n_contacts} contacts)")
    if deep:
        model.set_learning_rate(5e-2)
        epochs = max(5, iterations // 15)
        for e in range(epochs):
            model.train_svi(1)
            progress(0.08 + 0.5 * (e + 1) / epochs, f"Training (deep): epoch {e + 1} / {epochs}")
    else:
        model.set_learning_rate(2e-2)
        _train(model, iterations, progress, 0.08, 0.58, "Training")

    return {"model": model, "dense": dense, "sparse": sparse, "n_contacts": n_contacts, "tr": tr, "rng": rng, "deep": deep}


def _only_holes(p, keep):
    q = dict(p)
    q["collars"] = [c for c in p["collars"] if keep(str(c["hole_id"]))]
    q["survey"] = [r for r in (p.get("survey") or []) if keep(str(r["hole_id"]))]
    q["intervals"] = [r for r in p["intervals"] if keep(str(r["hole_id"]))]
    return q


def _held_out_check(geoml, p, progress, lo, hi):
    """TASKS.csv #1312 — the model against holes it never saw. The fit on the training points flatters: Treaty Creek PS_POR read 66 % there
    and 24 % on unseen holes. Every 4th hole, taken separately among holes with and without the unit, is left out; the same settings train
    again on the rest; the left-out holes are scored at 2.5 m. About doubles the run. None if there are too few holes, or if it fails: it
    must never cost the result."""
    try:
        target = set(map(str, p["target_values"]))
        with_unit = sorted({str(r["hole_id"]) for r in p["intervals"] if str(r["value"]) in target})
        without = sorted({str(c["hole_id"]) for c in p["collars"]} - set(with_unit))
        held = set(with_unit[3::4]) | set(without[3::4])
        if len(with_unit) < 4 or not held:
            return None
        trained = _domain_train(geoml, _only_holes(p, lambda h: h not in held), _holes(geoml, _only_holes(p, lambda h: h not in held)),
                                lambda f, text: progress(lo + (hi - lo) * 0.95 * f / 0.58, f"Testing on {len(held)} unseen holes. {text}"))
        test = _only_holes(p, lambda h: h in held)
        holes = _holes(geoml, test)
        iv = pd.DataFrame(test["intervals"])
        iv["hole_id"] = iv["hole_id"].astype(str)
        iv["value"] = iv["value"].astype(str)
        iv = iv[~iv["value"].isin(set(map(str, p.get("exclude_values") or [])))].copy()
        iv["UNIT"] = np.where(iv["value"].isin(target), "Target", "Other")
        holes.add_intervals("lito", iv[["hole_id", "from", "to", "UNIT"]], hole="hole_id", fr="from", to="to", categorical=["UNIT"])
        holes.add_intervals("lito", holes.merge_domains(("lito", "UNIT")))
        d = holes.as_classification_input(("lito", "UNIT"), length=2.5)
        fit = _fit_check(geoml, trained["model"], d)
        return {**fit, "holes_left_out": len(held), "holes": len(held) + len(_only_holes(p, lambda h: h not in held)["collars"])} if fit else None
    except Exception:  # noqa: BLE001
        return None


def run_domain(p, progress):
    import geoml
    t0 = time.time()
    outer = progress
    if p.get("held_out"):  # the second training takes as long as the first: half the bar each
        progress = lambda f, text: outer(f * 0.5, text)
    geoml.set_seed(int(p.get("seed", 1234)))
    progress(0.02, "Reading the drillholes")
    holes = _holes(geoml, p)
    t = _domain_train(geoml, p, holes, progress)
    model, dense, sparse, n_contacts, tr, rng, deep = t["model"], t["dense"], t["sparse"], t["n_contacts"], t["tr"], t["rng"], t["deep"]
    fit = _fit_check(geoml, model, dense)
    check_probability = _probabilities_at(geoml, model, p.get("check_points"))
    c = np.asarray(dense.coordinates)
    pad = np.array([float(p.get("pad", 100.0))] * 2 + [float(p.get("pad_z", 50.0))])
    lo, hi = c.min(0) - pad, c.max(0) + pad
    if p.get("bounds"):
        b = p["bounds"]; lo, hi = np.array(b[:3], float), np.array(b[3:], float)

    # the contact surface: refined blocks (finer where the contact runs), contoured where the unit's indicator is 0
    progress(0.6, "Building the contact surface")
    sblock = float(p.get("surface_block", 40.0))
    n, sblock = _grid(lo, hi, sblock, 60_000)
    bs = geoml.data.BlockSet3D(start=list(lo + sblock / 2), n=list(n), step=[sblock] * 3, discretization=(2, 2, 2), max_levels=int(p.get("refine_levels", 2)))
    bs = geoml.models.refine(model, bs)
    # TASKS.csv #1158 — geoML raises when the unit's indicator never reaches 0: the model predicts the unit nowhere. That is a result
    # (blocks with their low probabilities), not a failure with a message about an indicator nobody asked about.
    try:
        surf = bs.get_contour("UNIT/Target/indicator_predicted", 0.0)
    except ValueError:
        surf = None
    surface = None
    if surf is not None and len(surf.triangles):
        model.predict(surf)
        surface = {"vertices": np.asarray(surf.coordinates).round(2).tolist(), "triangles": np.asarray(surf.triangles).astype(int).tolist(),
                   "uncertainty": np.asarray(surf.values("UNIT/uncertainty")).round(3).tolist(), "area": float(surf.area)}

    # blocks for the 3D view: a regular grid inside the cell budget, unit probability + uncertainty
    progress(0.85, "Predicting the block model")
    n, cell = _grid(lo, hi, float(p.get("block_size", 25.0)), int(p.get("max_blocks", MAX_BLOCKS_OUT)))
    grid = geoml.data.BlockSet3D(start=list(lo + cell / 2), n=list(n), step=[cell] * 3, discretization=(2, 2, 2), max_levels=1)
    model.predict(grid)
    xyz = np.asarray(grid.coordinates)
    prob = np.asarray(grid.values("UNIT/Target/probability"))
    unc = np.asarray(grid.values("UNIT/uncertainty"))
    result = {
        "kind": "domain", "model": "deep" if deep else "stationary", "seconds": round(time.time() - t0, 1),
        "range": _range_report(tr, rng), "trend_applied": bool(p.get("trend")),  # #673 / #692
        "training_points": int(dense.n_data), "inducing_points": int(sparse.n_data), "contacts": n_contacts, "fit": fit, "check_probability": check_probability,
        "surface": surface,
        "blocks": {"cell": cell, "n": [int(v) for v in n], "x": xyz[:, 0].round(2).tolist(), "y": xyz[:, 1].round(2).tolist(), "z": xyz[:, 2].round(2).tolist(),
                   "probability": prob.round(4).tolist(), "uncertainty": unc.round(4).tolist()},
        "elbo": [float(v) for v in list(getattr(model, "training_log", []))[-50:]],
    }
    if p.get("held_out"):  # TASKS.csv #1312 — the blocks are safe in `result`: free the model before training another
        del model, bs, grid, t
        result["held_out"] = _held_out_check(geoml, p, outer, 0.5, 1.0)
    outer(1.0, "Done")
    return result


def run_grade(p, progress):
    import geoml
    t0 = time.time()
    geoml.set_seed(int(p.get("seed", 1234)))
    progress(0.02, "Reading the drillholes and assays")
    holes = _holes(geoml, p)
    name = str(p.get("element", "grade"))
    a = pd.DataFrame(p["samples"])  # hole_id, from, to, value
    a["hole_id"] = a["hole_id"].astype(str)
    a = a[np.isfinite(a["value"].astype(float)) & (a["value"].astype(float) >= 0)].copy()
    a = a.rename(columns={"value": name})[["hole_id", "from", "to", name]]
    # #658 / #692 — geoML's own data checks (overlapping intervals...) are passed back instead of being lost
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        holes.add_intervals("assay", a, hole="hole_id", fr="from", to="to")
    data_warnings = [str(w.message)[:300] for w in caught][:10]
    comp = holes.composite_fixed(length=float(p.get("composite", 5.0)))
    pts = comp.as_point_data(["assay"])
    if pts.n_data < 20:
        raise ValueError(f"Only {pts.n_data} composites with a {name} value — too few to model.")
    n_ind = int(min(p.get("inducing", 300), max(20, pts.n_data // 3)))
    inducing = geoml.data.inducing.from_kmeans(pts, n_ind)
    rng = float(p.get("range", 150.0))
    tr = _anisotropy(geoml, p, rng)  # #673
    root = geoml.latent.BasicInput(inducing, center=True, transform=tr)
    gp = geoml.latent.BasicGP(root, size=1)
    vals = np.asarray(pts.values(f"{name}/measurements")) if f"{name}/measurements" in str(pts.tree()) else a[name].to_numpy(float)
    positive = vals[vals > 0]
    shift = float(np.nanmin(positive)) / 2 if positive.size else 1.0  # Box-Cox needs > 0; half the smallest grade
    lik = geoml.likelihood.Gaussian(geoml.warping.ChainedWarping(geoml.warping.BoxCox(1, shift=shift), geoml.warping.ZScore(1)))
    model = geoml.models.VGPNetwork(pts, name, lik, gp, options=geoml.models.GPOptions(verbose=False))
    progress(0.08, f"Training ({pts.n_data} composites)")
    _train(model, int(p.get("iterations", 300)), progress, 0.08, 0.75, "Training")

    c = np.asarray(pts.coordinates)
    pad = np.array([float(p.get("pad", 50.0))] * 3)
    lo, hi = c.min(0) - pad, c.max(0) + pad
    if p.get("bounds"):
        b = p["bounds"]; lo, hi = np.array(b[:3], float), np.array(b[3:], float)
    progress(0.8, "Predicting the block model")
    n, cell = _grid(lo, hi, float(p.get("block_size", 20.0)), int(p.get("max_blocks", MAX_BLOCKS_OUT)))
    grid = geoml.data.BlockSet3D(start=list(lo + cell / 2), n=list(n), step=[cell] * 3, discretization=(2, 2, 2), max_levels=1)
    model.predict(grid, n_sim=int(p.get("simulations", 20)))
    xyz = np.asarray(grid.coordinates)

    def get(path):
        try:
            return np.asarray(grid.values(f"{name}/{path}"))
        except KeyError:
            return None
    pred, disp, sims = get("prediction"), get("dispersion"), get("simulations")
    blocks = {"cell": cell, "n": [int(v) for v in n], "x": xyz[:, 0].round(2).tolist(), "y": xyz[:, 1].round(2).tolist(), "z": xyz[:, 2].round(2).tolist(),
              "prediction": None if pred is None else pred.round(5).tolist()}
    if disp is not None:
        blocks["dispersion"] = disp.round(5).tolist()  # geoML's spread of the back-transformed grade
    if sims is not None and sims.ndim == 2 and sims.shape[1] > 1:  # P10 / P90 from the simulations, in grade units
        blocks["p10"] = np.percentile(sims, 10, axis=1).round(5).tolist()
        blocks["p90"] = np.percentile(sims, 90, axis=1).round(5).tolist()
    out = {"kind": "grade", "element": name, "seconds": round(time.time() - t0, 1), "composites": int(pts.n_data), "inducing_points": n_ind, "blocks": blocks,
           "range": _range_report(tr, rng), "trend_applied": bool(p.get("trend")), "data_warnings": data_warnings}  # #673 / #692
    progress(1.0, "Done")
    return out


JOBS = {"domain": run_domain, "grade": run_grade}
