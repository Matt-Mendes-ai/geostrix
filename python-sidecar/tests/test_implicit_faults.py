"""TASKS.csv #360 — faults solved with the stack (GemPy FAULT groups). Run: venv python tests/test_implicit_faults.py
A horizontal contact at 600 m west of a vertical N-S fault at x = 500 and 500 m east of it (100 m throw):
  * without the fault the modelled contact ramps across the fault zone;
  * with it, the contact is flat at the offset level right up to the fault on the downthrown side, a fault
    mesh comes back, and the lithology block keeps the unit numbering the client expects (ids 1..n)."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.main import implicit_model, ImplicitModelRequest  # noqa: E402


def _req(with_fault):
    top = {"name": "top", "points": [{"x": x, "y": y, "z": 600.0} for x in (100, 250, 400, 450) for y in (200, 500, 800)]
           + [{"x": x, "y": y, "z": 500.0} for x in (550, 600, 750, 900) for y in (200, 500, 800)],
           "orientations": [{"x": 250, "y": 500, "z": 600, "dip": 0, "azimuth": 0}, {"x": 750, "y": 500, "z": 500, "dip": 0, "azimuth": 0}]}
    fault = {"name": "F1", "points": [{"x": 500.0, "y": y, "z": z} for y in (200, 500, 800) for z in (200, 500, 800)],
             "orientations": [{"x": 500, "y": 500, "z": 500, "dip": 90, "azimuth": 90}]}
    return ImplicitModelRequest(extent=[0, 1000, 0, 1000, 0, 1000], surfaces=[top], resolution=[30, 30, 30], return_block=True,
                                faults=[fault] if with_fault else [])


def _near_fault(out):
    v = np.asarray([s for s in out.surfaces if s.name == "top"][0].vertices)
    east = v[(v[:, 0] > 530) & (v[:, 0] < 620)][:, 2]
    west = v[(v[:, 0] > 380) & (v[:, 0] < 470)][:, 2]
    return float(np.median(west)), float(east.min()), float(east.max())


def test_fault_offsets_the_contact():
    plain = implicit_model(_req(False))
    faulted = implicit_model(_req(True))
    w0, e0lo, e0hi = _near_fault(plain)
    w1, e1lo, e1hi = _near_fault(faulted)
    print(f"no fault: west {w0:.1f}, east {e0lo:.1f}-{e0hi:.1f} | fault: west {w1:.1f}, east {e1lo:.1f}-{e1hi:.1f}; "
          f"meshes {[s.name for s in faulted.surfaces]}; block ids {sorted(set(faulted.block['ids']))} labels {faulted.block['labels']}")
    assert e0hi - e0lo > 20                            # without the fault: a ramp next to it
    assert abs(e1lo - 500) < 1 and abs(e1hi - 500) < 1  # with it: flat at the downthrown level
    assert w1 > 575                                     # and the upthrown side stays high
    assert [s.name for s in faulted.surfaces] == ["F1", "top"]
    assert sorted(set(faulted.block["ids"])) == sorted(set(plain.block["ids"])) == [1, 2]


def _stack_req(offsets=None, second_fault=False, f1_offsets_f2=False):
    """TASKS.csv #1054 — a flat cover at 800 m over the faulted contact (erode stack: cover, top), fault F1 at x = 500."""
    r = _req(True).model_dump()
    cover = {"name": "cover", "points": [{"x": x, "y": y, "z": 800.0} for x in (100, 300, 700, 900) for y in (200, 800)],
             "orientations": [{"x": 500, "y": 500, "z": 800, "dip": 0, "azimuth": 0}]}
    r["surfaces"] = [cover] + r["surfaces"]
    r["faults"][0]["offsets"] = offsets
    if second_fault:  # F2: an E-W vertical fault at y = 300, listed after F1
        r["faults"].append({"name": "F2", "points": [{"x": x, "y": 300.0, "z": z} for x in (200, 500, 800) for z in (200, 500, 800)],
                            "orientations": [{"x": 500, "y": 300, "z": 500, "dip": 90, "azimuth": 0}]})
        if f1_offsets_f2:
            r["faults"][0]["offsets"] = ["cover", "top", "F2"]
    return ImplicitModelRequest(**r)


def test_fault_offsets_choice():
    """TASKS.csv #1054 — by default a fault offsets every unit and no fault (GemPy's OFFSET_FORMATIONS); with offsets it
    offsets exactly the named surfaces, and one fault can offset a fault listed after it."""
    d = implicit_model(_stack_req())
    print("default:", d.fault_offsets)
    assert d.fault_offsets == {"F1": ["cover", "top"]}
    only = implicit_model(_stack_req(["top"]))
    print("offsets=['top']:", only.fault_offsets)
    assert only.fault_offsets == {"F1": ["top"]}
    w, elo, ehi = _near_fault(only)
    assert abs(elo - 500) < 1 and abs(ehi - 500) < 1 and w > 575, (w, elo, ehi)  # the contact is still offset
    none = implicit_model(_stack_req([]))
    assert none.fault_offsets == {"F1": []}
    two = implicit_model(_stack_req(second_fault=True))
    assert two.fault_offsets == {"F1": ["cover", "top"], "F2": ["cover", "top"]}, two.fault_offsets
    cut = implicit_model(_stack_req(second_fault=True, f1_offsets_f2=True))
    print("F1 also offsets F2:", cut.fault_offsets)
    assert cut.fault_offsets["F1"] == ["F2", "cover", "top"], cut.fault_offsets


if __name__ == "__main__":
    test_fault_offsets_the_contact()
    test_fault_offsets_choice()
    print("ALL PASSED")
