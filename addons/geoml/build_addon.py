"""Build the GeoStrix predictive-modelling add-on (TASKS.csv #638): freeze it with PyInstaller, zip it, print the
release fields (url / sha256 / bytes / installedBytes / longestPath) for addons/geoml/release.json.
Copyright (C) 2026 Matt Mendes. GNU GPL v3 (see LICENSE).

    python build_addon.py [--out <folder>]        (run with the add-on's own Python, requirements + pyinstaller installed)

Writes <out>/geostrix-geoml/ (the frozen program), <out>/geostrix-geoml-addon-<version>-win.zip and <out>/release-fields.json.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))


BUILD_ONLY = {"pip", "setuptools", "wheel", "pyinstaller", "pyinstaller-hooks-contrib", "altgraph", "pefile", "pywin32-ctypes"}
REPO_URL = "https://github.com/Matt-Mendes-ai/geostrix"


def write_source_pointer(folder, version):
    """TASKS.csv #669 — GPL-3.0 section 6: the object code says where its exact source is."""
    sha = os.environ.get("GITHUB_SHA")
    if not sha:
        try:
            sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=HERE, capture_output=True, text=True, check=True).stdout.strip()
        except Exception:  # noqa: BLE001 — not a git checkout
            sha = None
    lines = [f"GeoStrix predictive-modelling add-on {version} (GPL-3.0, see LICENSE).",
             f"Source code: {REPO_URL}/tree/{sha or 'master'}/addons/geoml" + ("" if sha else " (build commit unknown)"),
             "It runs geoML by Italo Goncalves (GPL-3.0): https://github.com/italo-goncalves/geoML",
             "Third-party components and their licences: THIRD-PARTY-LICENCES.txt"]
    with open(os.path.join(folder, "SOURCE.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def write_third_party_licences(folder):
    """TASKS.csv #669 — every runtime package frozen into the add-on, with its licence and (where the package ships it)
    the licence text. BSD-3 needs the notice with binary distributions and Apache-2.0 (section 4) a copy of the licence;
    tensorflow's own wheel ships no licence file, so the Apache-2.0 text is included once, from a package that has it."""
    from importlib import metadata as m
    entries, apache_text, apache_users = [], None, []
    for d in sorted(m.distributions(), key=lambda d: (d.metadata.get("Name") or "").lower()):
        md = d.metadata
        name = md.get("Name")
        if not name or name.lower() in BUILD_ONLY:
            continue
        lic = md.get("License-Expression") or md.get("License") or ""
        if not lic or len(lic) > 80:
            cls = [c.split("::")[-1].strip() for c in (md.get_all("Classifier") or []) if c.startswith("License ::")]
            lic = "; ".join(cls) or (lic[:80] if lic else "see the project")
        texts = []
        for f in d.files or []:
            low = str(f).replace("\\", "/").lower()
            base = low.rsplit("/", 1)[-1]
            if ".dist-info/" in low and (base.startswith("licen") or base.startswith("copying") or base.startswith("notice")):
                try:
                    texts.append(d.locate_file(f).read_text(encoding="utf-8", errors="replace").strip())
                except Exception:  # noqa: BLE001
                    pass
        text = "\n\n".join(texts)
        if apache_text is None and "Apache License" in text and "Version 2.0, January 2004" in text:
            apache_text = text[text.index("Apache License"):]
        if not text and "apache" in lic.lower():
            apache_users.append(name)
        url = md.get("Home-page") or ((md.get_all("Project-URL") or [""])[0].split(",")[-1].strip())
        entries.append((name, d.version, lic.strip(), url, text))
    out = ["Third-party software in the GeoStrix predictive-modelling add-on", "=" * 66, ""]
    for name, ver, lic, url, text in entries:
        out += [f"{name} {ver} — {lic}" + (f" — {url}" if url else ""), ""]
        if text:
            out += [text, ""]
        elif name in apache_users:
            out += ["(Licensed under the Apache License 2.0; its full text is at the end of this file.)", ""]
        out += ["-" * 66, ""]
    if apache_users:
        out += ["Apache License 2.0 — full text, applies to: " + ", ".join(apache_users), ""]
        out += [apache_text or "Apache License, Version 2.0: https://www.apache.org/licenses/LICENSE-2.0 (the full text could not be found in this build environment)", ""]
    with open(os.path.join(folder, "THIRD-PARTY-LICENCES.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(out))
    return len(entries), apache_users


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(HERE, "dist"))
    args = ap.parse_args()
    release = json.load(open(os.path.join(HERE, "release.json"), encoding="utf-8"))
    version = release["version"]
    out = os.path.abspath(args.out)
    work = os.path.join(out, "_build")
    subprocess.run([sys.executable, "-m", "PyInstaller", os.path.join(HERE, "run_addon.py"), "--name", "geostrix-geoml", "--onedir", "--noconfirm",
                    "--log-level", "WARN", "--distpath", out, "--workpath", work, "--specpath", work, "--paths", HERE,
                    "--hidden-import", "geostrix_geoml.models", "--hidden-import", "geostrix_geoml.server",
                    "--collect-all", "geoml", "--collect-submodules", "tensorflow_probability", "--collect-data", "tensorflow_probability",
                    "--copy-metadata", "geoml"], check=True)
    folder = os.path.join(out, "geostrix-geoml")
    # the licence and the source pointer travel with the program (GPL-3.0 section 4 / 6d)
    for f in ("LICENSE", "README.md"):
        with open(os.path.join(HERE, f), "rb") as src, open(os.path.join(folder, f), "wb") as dst:
            dst.write(src.read())
    write_source_pointer(folder, version)  # #669
    write_third_party_licences(folder)  # #669
    installed = 0
    longest = 0  # the longest path inside the add-on: GeoStrix refuses to install where root + this would pass Windows' 260
    zpath = os.path.join(out, f"geostrix-geoml-addon-{version}-win.zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for root, _, files in os.walk(folder):
            for f in files:
                p = os.path.join(root, f)
                installed += os.path.getsize(p)
                longest = max(longest, len(os.path.relpath(p, out)))
                z.write(p, os.path.relpath(p, out))
    h = hashlib.sha256()
    with open(zpath, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    fields = {"version": version, "file": os.path.basename(zpath), "sha256": h.hexdigest(), "bytes": os.path.getsize(zpath), "installedBytes": installed, "longestPath": longest}
    json.dump(fields, open(os.path.join(out, "release-fields.json"), "w"), indent=2)
    print(json.dumps(fields, indent=2))


if __name__ == "__main__":
    main()
