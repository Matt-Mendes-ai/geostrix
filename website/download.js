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
