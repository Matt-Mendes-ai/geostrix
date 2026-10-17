# Code signing policy

This document describes how GeoStrix release binaries are built, signed and approved. It exists so that
users can verify what they download, and because SignPath Foundation requires participating projects to
publish a code signing policy.

## Signing

Free code signing provided by [SignPath.io](https://signpath.io), certificate by
[SignPath Foundation](https://signpath.org).

**Status:** GeoStrix has applied to SignPath Foundation. Until signing is approved and live, releases are
**unsigned** — see *Release history* below. This page will say so plainly when the first signed release
ships.

Signing covers the files GeoStrix's own build produces from this repository:

- the Windows installer `GeoStrix-Setup-<version>.exe` and its uninstaller,
- the application executable `GeoStrix.exe`,
- the Python engine `geostrix-sidecar.exe` (frozen with PyInstaller, using a bootloader compiled in CI).

Third-party runtime files shipped inside the installer (Electron/Chromium and Python DLLs and libraries)
are included as published by their upstream projects and are not re-signed under GeoStrix's identity.
Every signed GeoStrix binary carries the product name **GeoStrix** and the release's version number in
its file metadata.

## Team roles

GeoStrix is a single-maintainer project. This section will be updated if that changes.

| Role | Members |
| --- | --- |
| Authors (may change source without further review) | Matt Mendes ([@Matt-Mendes-ai](https://github.com/Matt-Mendes-ai)) |
| Reviewers (review every change from non-committers, e.g. pull requests) | Matt Mendes ([@Matt-Mendes-ai](https://github.com/Matt-Mendes-ai)) |
| Approvers (authorise each signing request) | Matt Mendes ([@Matt-Mendes-ai](https://github.com/Matt-Mendes-ai)) — repository owner |

Contributions from anyone else arrive as pull requests and are reviewed before they are merged.
All team members use multi-factor authentication for GitHub and for SignPath.

## How releases are built

Releases are **not** built on a developer machine. Every published installer is produced by the
`Release` GitHub Actions workflow ([`.github/workflows/release.yml`](.github/workflows/release.yml)),
which runs on a GitHub-hosted Windows runner when a version tag (`v*`) is pushed, and which:

1. checks out the tagged commit,
2. installs Python dependencies from pinned versions (`python-sidecar/requirements.txt` +
   `constraints.txt`) and freezes the Python engine with PyInstaller, compiling PyInstaller's bootloader
   from source rather than using the prebuilt one,
3. installs Node dependencies from `package-lock.json` and builds the web bundle,
4. packages the Electron app with `electron-builder` (NSIS installer and a portable zip),
5. publishes the installer, its blockmap, `latest.yml` and `SHA256SUMS.txt` to the GitHub Release,
6. verifies that the release is published (not a draft) and that `latest.yml`'s declared size
   matches the attached installer, failing the build if not.

Because the build runs from the tagged commit on a hosted runner, every binary traces back to public
source. Build scripts and CI configuration are part of the repository and are reviewed like application
code.

Once SignPath is set up, the workflow submits the built artifacts to SignPath for signing, and
`latest.yml` (the auto-updater's checksum file) is generated from the **signed** installer.

## Approval

Every signing request requires manual approval by an Approver listed above. Signing is never automatic
on tag push: a release is built and submitted, and a person authorises the signature.

## Privacy

GeoStrix does not send information to other networked systems unless the user asks for a feature that
needs it (map tiles, terrain, the user's own database or web-map servers, the update check). The update
check at startup can be turned off in the Help menu. The installer shows this privacy summary before
installing. Full policy: [PRIVACY.md](PRIVACY.md) / [geostrix.com/privacy](https://geostrix.com/privacy).

## Uninstalling

Windows Settings → Apps → Installed apps → GeoStrix → Uninstall (or Control Panel → Programs and
Features). The uninstaller removes the application; project files you saved are kept.

## Verifying a download

Each release includes `SHA256SUMS.txt`. On Windows:

```powershell
Get-FileHash .\GeoStrix-Setup-0.1.38.exe -Algorithm SHA256
```

and compare with the line for that file in `SHA256SUMS.txt`. Once signing is active you can also check
the signature:

```powershell
Get-AuthenticodeSignature .\GeoStrix-Setup-<version>.exe | Format-List Status, SignerCertificate
```

## SmartScreen

Microsoft Defender SmartScreen builds *reputation* per signing identity over time; it does not trust a
certificate instantly. Expect warnings on early signed releases, decreasing as consecutive releases are
signed with the same identity.

## Release history

| Versions | Signing status |
| --- | --- |
| 0.1.0 – 0.1.45 | Unsigned. Windows may show a SmartScreen warning; choose **More info** → **Run anyway**. |

This table will be updated when the first signed release ships.
