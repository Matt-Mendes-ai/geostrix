// TASKS.csv #4099 (Matt) — the portable zip is no longer published: releases are the NSIS installer only. The build target, the signing script and the release workflow stop producing, signing, hashing and uploading it;
// a copy still running from an old zip (#473 / #915) is pointed at the installer; the website says "Only for me" instead of offering a zip, and its download-count badge is plain text (it looked like a download button and
// landed on the releases list, where the zip was listed first).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installerUrl, RELEASES } from "../src/lib/updateLinks.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#4099 electron-builder builds the Windows installer only", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.deepEqual(pkg.build.win.target, ["nsis"]);
});

test("#4099 the signing script and the release workflow no longer package, require, hash or upload a zip", () => {
  const ps = read("scripts/sign-release.ps1"), yml = read(".github/workflows/release.yml");
  assert.match(ps, /--win nsis --publish never/);
  assert.ok(!/--win nsis zip/.test(ps));
  assert.ok(!/GeoStrix-\$version-win\.zip/.test(ps) && !/-win\.zip/.test(yml), "no portable zip name in the script or workflow");
  assert.match(ps, /\$_\.Name -match "\\\.\(exe\|blockmap\)\$"/);
  assert.match(ps, /\$_\.Name -match "\\\.exe\$" \} \| ForEach-Object \{ "\$\(\(Get-FileHash/, "SHA256SUMS covers the installer only");
  assert.match(yml, /\$_\.Name -match '\\\.\(exe\|blockmap\)\$'\) -or \$_\.Name -eq 'latest\.yml'/);
  assert.match(yml, /\$_\.Name -match '\\\.exe\$' \} \| ForEach-Object \{ "\$\(\(Get-FileHash/);
  // the CI's unpacked-app.zip (the app the private key signs) is not the portable zip: it is still fetched and checked
  assert.ok(ps.includes("unpacked-app.zip"));
  // the notes carry the replacement advice, in ASCII (Windows PowerShell 5.1 reads this script as ANSI, #3916)
  assert.ok(ps.includes("No administrator rights? Choose 'Only for me' when installing."));
  assert.ok(!/[^\x00-\x7F]/.test(ps.split("\n").find((l) => l.startsWith("$notes = ")) || ""), "the notes line stays ASCII");
  assert.ok(yml.includes("Choose 'Only for me' when installing."));
});

test("#4099 a portable copy's update message and buttons point at the installer", () => {
  assert.equal(RELEASES, "https://github.com/Matt-Mendes-ai/geostrix/releases");
  assert.equal(installerUrl("0.2.14"), `${RELEASES}/download/v0.2.14/GeoStrix-Setup-0.2.14.exe`);
  assert.equal(installerUrl(""), `${RELEASES}/latest`);
  assert.equal(installerUrl(undefined), `${RELEASES}/latest`);
  const u = read("src/components/UpdatePrompt.jsx"), a = read("src/App.jsx"), m = read("electron/main.js");
  assert.ok(u.includes("href={installerUrl(version)}") && u.includes('tr("Download the installer")') && u.includes("The portable zip is no longer published"));
  assert.ok(a.includes("href={installerUrl(updater.version)}") && a.includes('tr("Get the installer")') && a.includes('import { installerUrl } from "./lib/updateLinks.js"'));
  assert.ok(!/new zip/.test(u + a), "no 'new zip' text left in the update prompt or the status bar");
  assert.ok(m.includes("Portable copy: download the installer from GitHub Releases."));
  assert.ok(m.includes("const IS_PORTABLE ="), "a zip copy is still told apart (#473): it never runs the NSIS installer from inside the app");
});

test("#4099 the four new messages are in every language and the old zip ones are gone", () => {
  const keys = ["The portable zip is no longer published: download the installer and run it (“Only for me” needs no administrator rights). Your projects are untouched.",
    "Download the installer", "Get the installer", "The portable zip is no longer published: download the installer and run it"];
  const old = ["Download the new zip", "Get the new zip", "This is the portable (zip) copy: download the new zip and replace this folder"];
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(read(`src/locales/${l}.json`));
    assert.deepEqual(keys.filter((k) => !d[k]), [], l);
    assert.deepEqual(old.filter((k) => k in d), [], `${l}: the old keys are gone`);
  }
});

test("#4099 the website: no portable zip, 'Only for me' on every language page, and a download-count badge that is plain text", () => {
  const SAY = { "index.html": "Choose “Only for me” when installing.", "es/index.html": "Elige «Solo para mí» al instalar.", "pt-br/index.html": "Escolha “Somente para mim” ao instalar.", "fr/index.html": "Choisissez « Pour moi uniquement » lors de l'installation.", "ar/index.html": "اختر «لي فقط» عند التثبيت." };
  for (const [f, say] of Object.entries(SAY)) {
    const h = read(`website/${f}`);
    assert.ok(h.includes(say), `${f}: says it`);
    assert.ok(!/win\.zip|portable zip|zip portátil|zip portable|zip محمول/i.test(h), `${f}: no portable zip`);
    assert.ok(h.includes('<span class="dl-badge" data-downloads-badge><span data-n></span></span>'), `${f}: the badge is a plain span with the count slot`);
    const badge = h.slice(h.indexOf("dl-badge") - 20, h.indexOf("dl-badge") + 200);
    assert.ok(!/<a |<svg|href=/.test(badge), `${f}: no link, no arrow in the badge`);
  }
  const js = read("website/download.js"), css = read("website/style.css");
  assert.ok(js.includes("badge.title = T.downloads(n)") && js.includes('badge.querySelector("[data-n]").textContent = T.badge(n)'), "the count and the tooltip are kept");
  assert.ok(!/dl-badge:hover|dl-badge svg/.test(css), "no hover effect or arrow style");
});
