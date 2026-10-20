// geostrix.com — point the download buttons at the newest installer on GitHub Releases (TASKS.csv #597).
// Without JavaScript, or if GitHub's API can't be reached, the buttons keep their fallback: the latest-release page.
(async () => {
  try {
    const r = await fetch("https://api.github.com/repos/Matt-Mendes-ai/geostrix/releases/latest", { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) return;
    const rel = await r.json();
    const exe = (rel.assets || []).find((a) => /^GeoStrix-Setup-.*\.exe$/.test(a.name));
    if (!exe) return;
    const mb = Math.round(exe.size / 1e6);
    document.querySelectorAll("[data-download]").forEach((a) => { a.href = exe.browser_download_url; });
    document.querySelectorAll("[data-version]").forEach((el) => {
      el.textContent = `Version ${rel.tag_name.replace(/^v/, "")} · Windows 10 / 11 (64-bit) · ${mb} MB`;
    });
  } catch { /* keep the fallback link */ }
})();

// Download count: every GeoStrix installer and portable zip ever downloaded from GitHub Releases, all versions.
// Counts only the app itself (not latest.yml, blockmaps, checksums or the geoML add-on). GitHub counts each
// download of the installer, so updates installed from inside GeoStrix are included. Hidden if GitHub can't be reached.
(async () => {
  try {
    const el = document.querySelector("[data-downloads]");
    if (!el) return;
    let total = 0;
    for (let page = 1; page <= 10; page++) {
      const r = await fetch(`https://api.github.com/repos/Matt-Mendes-ai/geostrix/releases?per_page=100&page=${page}`, { headers: { Accept: "application/vnd.github+json" } });
      if (!r.ok) return;
      const releases = await r.json();
      for (const rel of releases) {
        for (const a of rel.assets || []) {
          if (/^GeoStrix-Setup-.*\.exe$/.test(a.name) || /^GeoStrix-.*-win\.zip$/.test(a.name)) total += a.download_count || 0;
        }
      }
      if (releases.length < 100) break;
    }
    if (!total) return;
    el.textContent = `Downloaded ${total.toLocaleString("en-CA")} times from GitHub (all versions, including updates).`;
    el.hidden = false;
  } catch { /* leave the count hidden */ }
})();
