// TASKS.csv #4099 — the portable zip is no longer published (releases are the NSIS installer only). A copy still running from an old zip cannot update itself (#473: it has no uninstaller beside the exe),
// so its update prompt and status-bar button point at the new release's INSTALLER: the direct download when the version is known, else the latest-release page.
export const RELEASES = "https://github.com/Matt-Mendes-ai/geostrix/releases";
export const installerUrl = (version) => (version ? `${RELEASES}/download/v${version}/GeoStrix-Setup-${version}.exe` : `${RELEASES}/latest`);
