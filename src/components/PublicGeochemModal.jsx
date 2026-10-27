// TASKS.csv #846 — the public geochemistry catalogue: government surveys searchable by name, agency, country and medium,
// each with its coverage, media, size, years, licence and the date its service was last checked. A downloadable entry
// fetches the project area's samples from the agency's service (main-process allow-list, geochem-fetch) and hands an
// ordinary table to the surface-sample import, with the source and licence on every sample; the others link to the
// agency page. The catalogue, the requests and the parsers are in lib/publicGeochem.js.
import React, { useEffect, useMemo, useState } from "react";
import { X, Globe } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #963
import { overlay, panel, header, label, sel, btn } from "../lib/modalStyles.js";
import { useStore } from "../lib/store.jsx";
import { toLonLat, isMetricProjectedEpsg } from "../lib/reproject.js";
import { geochemFetch } from "../lib/desktop.js";
import { CATALOGUE_CHECKED, projectBoxXY, searchCatalogue, coversArea, areaUrl, BC_PAGE, serviceError, parseBcRgs, parseNgsa, ngsaChoices, usgsQuadUrl, parseQuadCodes, USGS_MAX_QUADS, usgsPackageRequest, usgsPackageLink, parseNgdbPackage, parseNure, cdogsCandidates, cdogsUrl, parseCdogsWorkbook } from "../lib/publicGeochem.js"; // usgs, cdogs: TASKS.csv #905
import BasemapView from "./BasemapView.jsx";
import { t as tr } from "../lib/i18n.js";

const MAX_DEG = 5; // an area larger than this in either direction is refused (a project, not a province)
const BC_MAX_PAGES = 6;

export default function PublicGeochemModal({ onLoaded, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const { collars, surfaceSamples, boundaries, mapLayers, project } = useStore();
  const [q, setQ] = useState("");
  const [onlyHere, setOnlyHere] = useState(true);
  const [selId, setSelId] = useState(null);
  const [area, setArea] = useState(null); // [lonMin, latMin, lonMax, latMax]
  const [areaFrom, setAreaFrom] = useState(null); // "project" | "drawn"
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [ngsa, setNgsa] = useState(null); // { text, sites, combos, pick }
  const [cdogs, setCdogs] = useState(null); // #905 — { index, cands, pick }

  // the project area in lon / lat: collars, else surface samples, boundaries, map layers (with a margin)
  useEffect(() => {
    let live = true;
    (async () => {
      // #905 — not while the project CRS is unchosen (crsSet false): the coordinates would be read in the default CRS and
      // the "project area" put somewhere else entirely (a Colorado UTM 13N test landed at -130.4 degrees)
      const b = project?.epsg && project.crsSet !== false ? projectBoxXY({ collars, surfaceSamples, boundaries, mapLayers }, { geographic: isMetricProjectedEpsg(project.epsg) === false }) : null;
      if (!b) return;
      const ll = await Promise.all([[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map(([x, y]) => toLonLat(x, y, project.epsg)));
      if (!live || ll.some((p) => !p)) return;
      setArea([Math.min(...ll.map((p) => p.lon)), Math.min(...ll.map((p) => p.lat)), Math.max(...ll.map((p) => p.lon)), Math.max(...ll.map((p) => p.lat))]);
      setAreaFrom("project");
    })();
    return () => { live = false; };
  }, []); // the area on opening; Draw changes it after

  const list = useMemo(() => searchCatalogue(q).filter((e) => !onlyHere || !area || coversArea(e, area)), [q, onlyHere, area]);
  const entry = list.find((e) => e.id === selId) || null;
  const tooBig = area && (area[2] - area[0] > MAX_DEG || area[3] - area[1] > MAX_DEG);

  const download = async () => {
    if (!entry || !area) return;
    setError(null); setNgsa(null); setCdogs(null);
    try {
      if (entry.id === "bc-rgs") {
        const parts = [];
        for (let page = 0; page < BC_MAX_PAGES; page++) {
          setBusy(tr("Downloading from {host}… (page {n})", { host: entry.host, n: page + 1 }));
          const r = await geochemFetch({ url: areaUrl(entry.id, area, { page }) });
          if (!r.ok) throw new Error(r.message || tr("The service answered HTTP {status}.", { status: r.status }));
          const err = serviceError(r.text); if (err) throw new Error(err);
          const t = parseBcRgs(r.text);
          parts.push(t);
          if (t.fetched < BC_PAGE) break; // the last page
        }
        const rows = parts.flatMap((t) => t.rows);
        if (!rows.length) { setError(tr("No samples from this survey in the area.")); return; }
        const headers = [...new Set(parts.flatMap((t) => t.headers))];
        const zeros = parts.reduce((s, t) => s + (t.notes[0]?.n || 0), 0);
        onLoaded({ checked: CATALOGUE_CHECKED, headers, rows, entry, notes: zeros ? [tr("{n} zero value(s) read as no value: this layer has no below-detection marker, so a 0 may be below detection or not analysed. Thresholds and Surface QA/QC count them separately.", { n: zeros })] : [] });
      } else if (entry.cdogs) {
        // TASKS.csv #905 — the shipped index says which surveys overlap the area; the user picks one survey x package
        setBusy(tr("Looking up the surveys…"));
        const index = (await import("../lib/cdogsIndex.json")).default;
        const cands = cdogsCandidates(index, area);
        if (!cands.length) { setError(tr("No GSC survey with a standardised data package overlaps the area.")); return; }
        setCdogs({ index, cands, pick: 0 });
      } else if (entry.usgs) {
        // TASKS.csv #905 — the quadrangles in the box (WFS), their package (form POST -> a page linking the file), the file
        const db = entry.usgs;
        setBusy(tr("Finding the map quadrangles in the area…"));
        const w = await geochemFetch({ url: usgsQuadUrl(db, area) });
        if (!w.ok) throw new Error(w.message || tr("The service answered HTTP {status}.", { status: w.status }));
        const quads = parseQuadCodes(w.text);
        if (!quads.length) { setError(tr("No samples from this survey in the area.")); return; }
        if (quads.length > USGS_MAX_QUADS) { setError(tr("The area holds {n} map quadrangles (over {max}): draw a smaller one.", { n: quads.length, max: USGS_MAX_QUADS })); return; }
        setBusy(tr("Asking the USGS for {n} quadrangle(s) (this can take a minute)…", { n: quads.length }));
        const req = usgsPackageRequest(db, quads);
        const p = await geochemFetch(req);
        if (!p.ok) throw new Error(p.message || tr("The service answered HTTP {status}.", { status: p.status }));
        const link = usgsPackageLink(p.text, db);
        if (!link) throw new Error(tr("The USGS page did not link a data file (the service may have changed, or is busy: try again)."));
        setBusy(tr("Downloading from {host}…", { host: entry.host }));
        let t;
        if (db === "ngdb") {
          const f = await geochemFetch({ url: link, binary: true });
          if (!f.ok) throw new Error(f.message || tr("The service answered HTTP {status}.", { status: f.status }));
          const { readZipEntries } = await import("../lib/shapefile.js");
          const bytes = f.bytes; // #922
          const entries = await readZipEntries(bytes, /(main|bestvalue)\.txt$/i);
          const dec = (re) => { const k = Object.keys(entries).find((n) => re.test(n) && entries[n]); return k ? new TextDecoder().decode(entries[k]) : ""; };
          t = parseNgdbPackage({ main: dec(/main\.txt$/i), bestvalue: dec(/bestvalue\.txt$/i) }, area);
        } else {
          const f = await geochemFetch({ url: link });
          if (!f.ok) throw new Error(f.message || tr("The service answered HTTP {status}.", { status: f.status }));
          t = parseNure(f.text, area);
        }
        if (!t.rows.length) { setError(tr("No samples from this survey in the area.")); return; }
        onLoaded({ checked: CATALOGUE_CHECKED, headers: t.headers, rows: t.rows, entry, notes: t.notes.map((n) => tr(n.key, { n: n.n })) });
      } else if (entry.id === "ga-ngsa") {
        setBusy(tr("Downloading from {host}…", { host: entry.host }));
        const r = await geochemFetch({ url: areaUrl(entry.id, area) });
        if (!r.ok) throw new Error(r.message || tr("The service answered HTTP {status}.", { status: r.status }));
        const err = serviceError(r.text); if (err) throw new Error(err);
        const c = ngsaChoices(r.text);
        if (!c.sites) { setError(tr("No NGSA sites in the area (the survey has about one site per 5,500 km²). Draw a larger area.")); return; }
        const first = c.combos.find((k) => k.fraction === "coarse" && k.depth === "top" && k.digestion === "aqua regia") || c.combos[0];
        setNgsa({ text: r.text, ...c, pick: first });
      }
    } catch (e) { setError(e.message || String(e)); } finally { setBusy(null); }
  };
  const importCdogs = async () => {
    const cand = cdogs.cands[cdogs.pick];
    setError(null);
    try {
      setBusy(tr("Downloading from {host}…", { host: entry.host }));
      const f = await geochemFetch({ url: cdogsUrl(cand.key, cand.pkg), binary: true });
      if (!f.ok) throw new Error(f.message || tr("The service answered HTTP {status}.", { status: f.status }));
      const { readXlsxSheets } = await import("../lib/xlsx.js");
      const sheets = await readXlsxSheets(f.bytes); // #922
      const sheet = sheets.find((s) => !s.hidden && s.rows.length > 1) || sheets[0];
      const t = parseCdogsWorkbook(sheet?.rows || [], cdogs.index.packages[String(cand.pkg)][2], area, cand);
      if (!t.rows.length) { setError(tr("None of this survey's samples lie in the area (only its overall extent overlaps it).")); return; }
      onLoaded({ checked: CATALOGUE_CHECKED, headers: t.headers, rows: t.rows, entry, notes: [tr("Survey: {name} ({year}); {pkg}, {lab}.", { name: cand.name, year: cand.year || "?", pkg: cand.pkgName, lab: cand.lab }), ...t.notes.map((n) => tr(n.key, { n: n.n }))] });
    } catch (e) { setError(e.message || String(e)); } finally { setBusy(null); }
  };
  const importNgsa = () => {
    const t = parseNgsa(ngsa.text, ngsa.pick);
    onLoaded({ checked: CATALOGUE_CHECKED, headers: t.headers, rows: t.rows, entry, notes: [] });
  };

  const fractionLabel = (f) => (f === "coarse" ? tr("coarse (<2 mm)") : f === "fine" ? tr("fine (<75 µm)") : f);
  const depthLabel = (d) => (d === "top" ? tr("top (0-10 cm)") : tr("bottom (about 60-80 cm)"));
  const comboLabel = (k) => tr("{fraction}, {depth}, {digestion}: {n} sample(s)", { fraction: fractionLabel(k.fraction), depth: depthLabel(k.depth), digestion: k.digestion, n: k.n });
  const small = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };

  return (<>
    <div style={overlay}>{/* TASKS.csv #968 — no backdrop close (#387: it holds a drawn area, a download, a choice); Esc or Close */}
      <div style={panel({ width: 720, maxHeight: "90vh" })} role="dialog" aria-modal="true" aria-label={tr("Public geochemistry")} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-text)", fontSize: "var(--font-size-lg)" }}><Globe size={16} />{" "}{tr("Public geochemistry")}</span>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} size={16} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} aria-label={tr("Close")} />
        </div>
        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={small}>{tr("Government geochemical surveys, free to use under the licence shown. A download asks the agency's service for the samples in the area only, and they import as surface samples with the source and licence on every sample. Only the area is sent (its bounding box, and for the USGS the map quadrangles it covers), never your project's data.")}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search: name, agency, country, medium")} aria-label={tr("Search the catalogue")} style={{ ...sel, flex: 1, minWidth: 200 }} />
            <label style={{ ...small, display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={onlyHere} onChange={(e) => setOnlyHere(e.target.checked)} disabled={!area} />{tr("Only surveys covering the area")}</label>
          </div>
          <div style={{ ...small, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span>{!area && project?.crsSet === false ? tr("The project's coordinate system is not chosen yet, so its data cannot be placed: choose it (status bar) or draw an area.") : area ? tr("Area: {w}° × {h}° around {lon}, {lat} ({from})", { w: (area[2] - area[0]).toFixed(2), h: (area[3] - area[1]).toFixed(2), lon: ((area[0] + area[2]) / 2).toFixed(3), lat: ((area[1] + area[3]) / 2).toFixed(3), from: areaFrom === "drawn" ? tr("drawn") : tr("the project's data, with a margin") }) : tr("No area yet: the project has no located data. Draw one.")}</span>
            <button onClick={() => setDrawing(true)} style={{ ...btn(false), padding: "4px 10px" }}>{tr("Draw area…")}</button>
          </div>
          {tooBig && <div role="alert" style={{ ...small, color: "var(--color-warn-text)" }}>{tr("The area is larger than {n}° in one direction. Draw a smaller one: this is for a project, not a province.", { n: MAX_DEG })}</div>}
          <div role="listbox" aria-label={tr("Surveys")} style={{ border: "1px solid var(--color-border)", borderRadius: 6, maxHeight: 190, overflowY: "auto" }}>
            {list.length ? list.map((e) => (
              <div key={e.id} role="option" aria-selected={e.id === selId} tabIndex={0} onClick={() => { setSelId(e.id); setNgsa(null); setError(null); }} onKeyDown={(ev) => { if (ev.key === "Enter") setSelId(e.id); }}
                style={{ padding: "6px 10px", cursor: "pointer", borderBottom: "1px solid var(--color-border)", background: e.id === selId ? "var(--color-hover-bg)" : "transparent" }}>
                <div style={{ color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>{e.name}{" "}<span style={{ ...small, marginLeft: 6 }}>{e.downloadable ? tr("download by area") : tr("link to the agency")}</span></div>
                <div style={small}>{e.agency} · {e.country} · {e.media}</div>
              </div>
            )) : <div style={{ ...small, padding: 10 }}>{tr("No survey in the catalogue matches.")}</div>}
          </div>
          {entry && (
            <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={label}>{entry.name}</div>
              <div style={small}>{entry.years ? tr("Media: {media}. Size: {samples}. Years: {years}.", { media: entry.media, samples: entry.samples, years: entry.years }) : tr("Media: {media}. Size: {samples}.", { media: entry.media, samples: entry.samples })}</div>
              <div style={small}>{tr("Licence:")}{" "}<a href={entry.licenceUrl} target="_blank" rel="noreferrer">{entry.licence}</a>{". "}{tr("Attribution: {text}", { text: entry.attribution })}</div>
              <div style={small}>{entry.caveat}</div>
              <div style={small}>{tr("Last checked {date}.", { date: CATALOGUE_CHECKED })}{" "}<a href={entry.page} target="_blank" rel="noreferrer">{tr("Agency page")}</a></div>
              {entry.downloadable && !ngsa && !cdogs && (
                <button onClick={download} disabled={!!busy || !area || tooBig || !coversArea(entry, area)} style={{ ...btn(true), padding: "7px 12px", alignSelf: "flex-start", opacity: busy || !area || tooBig ? 0.6 : 1 }}>
                  {busy || (area && !coversArea(entry, area) ? tr("This survey does not cover the area") : tr("Download the samples in the area"))}
                </button>
              )}
              {cdogs && ( /* TASKS.csv #905 */
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={small}>{tr("{n} survey data package(s) overlap the area. Each is one sample type, size fraction and lab method: choose one, so every sample is comparable.", { n: cdogs.cands.length })}</div>
                  <select value={cdogs.pick} onChange={(e) => setCdogs({ ...cdogs, pick: Number(e.target.value) })} aria-label={tr("Survey and data package")} style={sel}>
                    {cdogs.cands.map((c, i) => <option key={i} value={i}>{`${c.year || "?"} · ${c.name.slice(0, 70)}${c.name.length > 70 ? "…" : ""} — ${c.sampleType || tr("sample type not given")}${c.prep ? `, ${c.prep}` : ""} — ${c.pkgName}${c.n ? ` (${c.n})` : ""}`}</option>)}
                  </select>
                  <button onClick={importCdogs} disabled={!!busy} style={{ ...btn(true), padding: "7px 12px", alignSelf: "flex-start", opacity: busy ? 0.6 : 1 }}>{busy || tr("Continue to the import")}</button>
                </div>
              )}
              {ngsa && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={small}>{tr("{n} NGSA site(s) in the area. Each was sampled at two depths, sieved to two fractions and analyzed by several digestions: choose one, so every sample is comparable.", { n: ngsa.sites })}</div>
                  <select value={ngsa.combos.indexOf(ngsa.pick)} onChange={(e) => setNgsa({ ...ngsa, pick: ngsa.combos[Number(e.target.value)] })} aria-label={tr("Fraction, depth and digestion")} style={sel}>
                    {ngsa.combos.map((k, i) => <option key={i} value={i}>{comboLabel(k)}</option>)}
                  </select>
                  <button onClick={importNgsa} style={{ ...btn(true), padding: "7px 12px", alignSelf: "flex-start" }}>{tr("Continue to the import")}</button>
                </div>
              )}
            </div>
          )}
          {error && <div role="alert" style={{ ...small, color: "var(--color-danger-fg)" }}>{error}</div>}
        </div>
      </div>
    </div>
    {/* outside the backdrop: a click on the map would otherwise reach the backdrop and close the catalogue */}
    {drawing && (
        <BasemapView mode="draw" title={tr("Draw the area to search for public geochemistry")} confirmLabel="Use this area" initialBboxLonLat={area}
          lon={area ? (area[0] + area[2]) / 2 : undefined} lat={area ? (area[1] + area[3]) / 2 : undefined}
          onClose={() => setDrawing(false)} onConfirm={(b) => { setArea(b); setAreaFrom("drawn"); setNgsa(null); setDrawing(false); }} />
    )}
  </>);
}
