"""TASKS.csv #775 — the macOS free-RAM probe (app/jobs.py _darwin_available_bytes), checked against vm_stat output
in the format an Apple Silicon Mac prints (16 KB pages). Run: venv python tests/test_ram_probe.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app import jobs  # noqa: E402

SAMPLE = """Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                9817.
Pages active:                            301446.
Pages inactive:                          297063.
Pages speculative:                         2954.
Pages throttled:                              0.
Pages wired down:                        122110.
Pages purgeable:                          14587.
"Translation faults":                1573939823.
Pages copy-on-write:                   62187536.
Pages zero filled:                    613946540.
Pages reactivated:                     33612734.
Pages purged:                           6180166.
File-backed pages:                       177425.
Anonymous pages:                         424038.
Pages stored in compressor:              651309.
Pages occupied by compressor:            214567.
Decompressions:                        48467009.
Compressions:                          63711806.
Pageins:                               20914410.
Pageouts:                                190539.
Swapins:                                3297127.
Swapouts:                               3940062.
"""


def main():
    got = jobs._darwin_available_bytes(SAMPLE)
    want = 16384 * (9817 + 297063 + 2954)
    assert got == want, (got, want)
    for bad in ("", "Pages free: 10.\n", "Mach Virtual Memory Statistics: (page size of 4096 bytes)\n"):
        try:
            jobs._darwin_available_bytes(bad)
        except ValueError:
            continue
        raise AssertionError(f"accepted {bad!r}")
    # this machine's own probe still answers through its native branch, not the fallback
    assert jobs.available_ram_bytes() > 0 and jobs.available_ram_bytes() != jobs.total_ram_bytes() // 2
    print(f"darwin sample: {got / 2**30:.2f} GiB available")
    print("ALL PASSED")


if __name__ == "__main__":
    main()
