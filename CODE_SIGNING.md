# Code signing policy

This document describes how GeoStrix release binaries are built, signed and approved. It exists so that
users can verify what they download.

## Signing

GeoStrix is signed with a **Certum Open Source code-signing certificate** issued to
**Open Source Developer Matheus Mendes de Albuquerque** (issuer: Certum Code Signing 2021 CA, Asseco Data
Systems S.A.). The certificate's private key is held in Certum's SimplySign service and is unlocked only by
the maintainer, with a one-time code from his phone, for each signing session. Every signature is
timestamped by Certum, so it stays valid after the certificate itself expires.

**Status:** releases are signed from 0.1.53. Earlier releases are unsigned — see *Release history* below.

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
All team members use multi-factor authentication for GitHub; the signing key needs the maintainer's phone.

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
5. uploads the packaged application (unsigned) as a workflow artifact kept for 7 days.

The workflow does not publish anything by itself. The maintainer then runs
[`scripts/sign-release.ps1`](scripts/sign-release.ps1) at the tagged commit, which:

1. downloads the application that this workflow built — only from a run that passed every test,
2. signs `GeoStrix.exe` and the Python engine,
3. packages the installer and zip from that same application with `electron-builder --prepackaged` and
   signs the installer, its uninstaller and its elevation helper,
4. checks every signature and timestamp, writes `latest.yml` (the auto-updater's checksum) and
   `SHA256SUMS.txt` from the **signed** files,
5. creates the GitHub Release, uploads the files (`latest.yml` last), publishes it and verifies that the
   installer attached is the one `latest.yml` describes. It asks the maintainer first, unless run with
   `-Yes` because the maintainer has already decided to release; it never publishes if a check in steps 1-4
   failed.

Because the application is compiled and tested from the tagged commit on a hosted runner, every binary
traces back to public source; the maintainer's computer only adds signatures and wraps the same files
into the installer. Build scripts and CI configuration are part of the repository and are reviewed like
application code.

## Approval

Every signature requires the Approver listed above: the key cannot be used without his SimplySign
login and phone code, and the release script asks for confirmation before anything is published.
Signing is never automatic on tag push.

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
| 0.1.0 – 0.1.52 | Unsigned. Windows may show a SmartScreen warning; choose **More info** → **Run anyway**. |
| 0.1.53 – | Signed: Open Source Developer Matheus Mendes de Albuquerque (Certum Code Signing 2021 CA), timestamped. SmartScreen may still warn until reputation builds. |

