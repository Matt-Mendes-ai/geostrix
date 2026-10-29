// TASKS.csv #616 — ground-penetrating radar: open a GSSI .DZT (with its .DZG GPS track when there is one), look at the
// radargram with the usual first processing (time zero, dewow, background removal, gain), read depth from a
// dielectric constant, export it, and hang it in the 3D view as a curtain along the GPS track (or a straight line).
// Matt: "Can we add .dzt importing to geostrix". Reader and processing: lib/dzt.js, lib/gprProcess.js.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Download, Box } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { parseDzt, parseDzg, scanPositions, velocityFromEpsr, depthOfTime } from "../lib/dzt.js";
import { firstBreak } from "../lib/gprProcess.js";
import { processInWorker } from "../lib/gprClient.js";
import { terrainElevationAt } from "../lib/inversion.js";
import { reprojectXY, getProj4Def } from "../lib/reproject.js";
import { saveFile, safeFileName } from "../lib/desktop.js"; // safeFileName: #1114
import { version as APP_VERSION } from "../../package.json";
import { t as tr } from "../lib/i18n.js";
import { colors, exportScale } from "../lib/theme.js"; // exportScale: #1090

const num = (v) => (v === "" || v == null ? NaN : Number(v));
const MAX_COLUMNS_3D = 256; // curtain columns in the 3D view (the picture keeps its own resolution)

// a radargram picture with axes - two-way time (ns) left, depth (m) right, distance (m) or scans along the bottom - drawn
// at width x height CSS pixels (x the device pixel ratio): the radargram is scaled to fit, the labels stay 11 px
function pictureOf(img) {
  const pic = document.createElement("canvas"); pic.width = img.width; pic.height = img.height;
  pic.getContext("2d").putImageData(new ImageData(img.pixels, img.width, img.height), 0, 0);
  return pic;
}
// s (TASKS.csv #1090): every text size, margin and tick scaled by s. 1 on screen; the exported PNG passes the factor
// that prints its labels at printPt.small where Layout places it (exportScale), as the DC/IP section does (#585)
function figure(img, { timeNs, depthM, along, alongUnit, title, width, height, dpr = 1, pic = pictureOf(img), s = 1 }) {
  const L = 52 * s, R = 48 * s, T = 22 * s, B = 32 * s, W = Math.max(40, width - L - R), H = Math.max(40, height - T - B);
  const c = document.createElement("canvas");
  c.width = Math.round((W + L + R) * dpr); c.height = Math.round((H + T + B) * dpr);
  c.style.width = `${W + L + R}px`; c.style.height = `${H + T + B}px`;
  const g = c.getContext("2d");
  g.scale(dpr, dpr);
  g.fillStyle = "#fff"; g.fillRect(0, 0, W + L + R, H + T + B);
  g.imageSmoothingEnabled = true;
  g.drawImage(pic, L, T, W, H);
  g.strokeStyle = colors.text; g.strokeRect(L, T, W, H); // #999 — theme constants, Exo 2 like every other chart
  g.fillStyle = colors.text; g.font = `${11 * s}px 'Exo 2', system-ui, sans-serif`; g.lineWidth = Math.max(1, s * 0.8);
  let t = title;
  while (t.length > 8 && g.measureText(t).width > W + R) t = `${t.slice(0, -2)}`;
  g.fillText(t === title ? t : `${t}…`, L, 14 * s);
  const tick = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  const nice = (span, n) => { const r = span / n, p = 10 ** Math.floor(Math.log10(r)); return [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= r) || 10 * p; };
  const nY = Math.max(2, Math.floor(H / (45 * s)));
  g.textAlign = "right";
  for (let q = 0, st = nice(timeNs, nY); q <= timeNs + 1e-9; q += st) { const y = T + (q / timeNs) * H; tick(L - 4 * s, y, L, y); g.fillText(String(+q.toFixed(1)), L - 6 * s, y + 4 * s); }
  g.save(); g.translate(12 * s, T + H / 2); g.rotate(-Math.PI / 2); g.textAlign = "center"; g.fillText(tr("Two-way time (ns)"), 0, 0); g.restore();
  if (depthM > 0) {
    g.textAlign = "left";
    for (let q = 0, sd = nice(depthM, nY); q <= depthM + 1e-9; q += sd) { const y = T + (q / depthM) * H; tick(L + W, y, L + W + 4 * s, y); g.fillText(String(+q.toFixed(2)), L + W + 6 * s, y + 4 * s); }
    g.save(); g.translate(L + W + R - 8 * s, T + H / 2); g.rotate(Math.PI / 2); g.textAlign = "center"; g.fillText(tr("Depth (m)"), 0, 0); g.restore();
  }
  g.textAlign = "center";
  for (let q = 0, sa = nice(along, Math.max(2, Math.floor(W / (90 * s)))); q <= along + 1e-9; q += sa) { const x = L + (q / along) * W; tick(x, T + H, x, T + H + 4 * s); g.fillText(String(+q.toFixed(1)), x, T + H + 15 * s); }
  g.fillText(alongUnit, L + W / 2, T + H + 28 * s);
  return c;
}

export default function GprPanel({ pBtn, numInput, mainRef }) {
  const { terrain, project, addSectionImage } = useStore();
  const fileRef = useRef(null);
  const canvasHost = useRef(null);
  const [gpr, setGpr] = useState(null); // { name, d (parseDzt), fixes, dzgName }
  const [msg, setMsg] = useState(null);
  const [ch, setCh] = useState(0);
  const [o, setO] = useState({ t0: "", dewow: true, dewowNs: "", bg: "line", bgScans: 200, gain: "agc", agcNs: "", power: 1, colors: "grey", clip: 98, epsr: "", zoom: "fit", tmax: "" });
  const [place, setPlace] = useState({ mode: "gps", x0: "", y0: "", x1: "", y1: "", ground: "" });
  const set = (k, v) => setO((p) => ({ ...p, [k]: v }));

  const onFiles = async (files) => {
    const list = [...(files || [])];
    const dztF = list.find((f) => /\.dzt$/i.test(f.name));
    const dzgF = list.find((f) => /\.dzg$/i.test(f.name));
    if (!dztF && !(dzgF && gpr)) { setMsg({ ok: false, text: tr("Choose a GSSI .DZT file (and its .DZG GPS file if there is one).") }); return; }
    try {
      const d = dztF ? parseDzt(await dztF.arrayBuffer()) : gpr.d;
      const fixes = dzgF ? parseDzg(await dzgF.text()) : dztF ? null : gpr.fixes;
      setGpr({ name: dztF ? dztF.name : gpr.name, d, fixes, dzgName: dzgF ? dzgF.name : dztF ? null : gpr.dzgName });
      setCh(0);
      if (dztF) setO((p) => ({ ...p, t0: "", dewowNs: "", agcNs: "", epsr: "" }));
      setPlace((p) => ({ ...p, mode: fixes?.length ? "gps" : "line" }));
      const h = d.header;
      setMsg({ ok: true, text: tr("{name}: {scans} scans of {samp} samples ({bits}-bit), {range} ns window, {ch} channel(s){ant}{along}{gps}.", {
        name: dztF ? dztF.name : gpr.name, scans: d.nscans.toLocaleString(), samp: d.nsamp, bits: h.bits, range: +h.range.toFixed(1), ch: h.nchan,
        ant: h.antenna ? tr(", antenna {a}", { a: h.antenna }) : "",
        along: d.distance ? tr(", {m} m at {spm} scans/m", { m: (d.nscans * d.distance).toFixed(1), spm: +h.spm.toFixed(2) }) : tr(", time-based ({sps} scans/s, no survey wheel)", { sps: +h.sps.toFixed(1) }),
        gps: fixes ? tr(", {n} GPS fixes", { n: fixes.length }) : "",
      }) });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  };

  const d = gpr?.d;
  const h = d?.header;
  const epsr = num(o.epsr) > 0 ? num(o.epsr) : h?.epsr || 9;
  const v = velocityFromEpsr(epsr);
  const auto = useMemo(() => {
    if (!d) return null;
    const raw = d.channels[Math.min(ch, d.channels.length - 1)];
    const mhz = h.antennaMHz && h.antennaMHz >= 10 && h.antennaMHz <= 3000 ? h.antennaMHz : null;
    return { raw, t0: Math.max(0, firstBreak(raw, d.nscans, d.nsamp) - 2), dewowNs: mhz ? +(2000 / mhz).toFixed(1) : +(h.range / 20).toFixed(1), agcNs: +(h.range / 8).toFixed(1) };
  }, [d, h, ch]);
  // TASKS.csv #616 — processed in a worker (gprClient.js), bounded by the display (scans averaged to <= 4,096 columns):
  // TEST__001 (5,643 scans x 2,048 samples) froze the page for 2-40 s per setting when this ran here
  const popts = useMemo(() => {
    if (!d) return null;
    const keepNs = num(o.tmax) > 0 ? num(o.tmax) : 0;
    return {
      t0: Number.isFinite(num(o.t0)) ? num(o.t0) : auto.t0, keep: keepNs ? Math.round(keepNs / d.dt) + 1 : 0, keepNs,
      dewowSamples: o.dewow ? (num(o.dewowNs) > 0 ? num(o.dewowNs) : auto.dewowNs) / d.dt : 0,
      bg: o.bg, bgScans: Number(o.bgScans) || 0, gain: o.gain, agcSamples: (num(o.agcNs) > 0 ? num(o.agcNs) : auto.agcNs) / d.dt, power: Number(o.power) || 1,
      clip: Number(o.clip) / 100, colors: o.colors,
    };
  }, [d, auto, o.t0, o.tmax, o.dewow, o.dewowNs, o.bg, o.bgScans, o.gain, o.agcNs, o.power, o.clip, o.colors]);
  const [res, setRes] = useState(null); // { img: { pixels, width, height }, nsamp, steps, timeNs }
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!popts) { setRes(null); return undefined; }
    let alive = true;
    setBusy(true);
    const t = setTimeout(() => { // a burst of changes (a slider dragged) processes once
      processInWorker(`${gpr.name}|${d.nscans}|${ch}`, auto.raw, d.nscans, d.nsamp, popts).then((r) => {
        if (!alive || !r) return;
        setRes({ img: { pixels: r.pixels, width: r.width, height: r.height }, nsamp: r.nsamp, steps: r.steps, timeNs: (r.nsamp - 1) * d.dt });
        setBusy(false);
      }).catch((e) => { if (alive) { setMsg({ ok: false, text: e.message }); setBusy(false); } });
    }, 120);
    return () => { alive = false; clearTimeout(t); };
  }, [popts]); // the file, channel and raw data change together with popts
  const proc = res;
  const img = res?.img || null;
  const pic = useMemo(() => (img ? pictureOf(img) : null), [img]);

  // the scans' positions: GPS fixes reprojected to the project CRS, or a straight line between two typed points
  const [track, setTrack] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!d) { setTrack(null); return; }
      if (place.mode === "gps" && gpr.fixes?.length >= 2) {
        const epsg = Number(project?.epsg);
        if (!epsg || !(await getProj4Def(epsg))) { if (alive) setTrack({ error: tr("The project needs a known EPSG code to place GPS fixes.") }); return; }
        const fx = gpr.fixes.map((f) => { const q = reprojectXY(f.lon, f.lat, 4326, epsg); return q ? { scan: f.scan, x: q.x, y: q.y, z: f.alt } : null; }).filter(Boolean);
        if (alive) setTrack(fx.length >= 2 ? { pos: scanPositions(fx, d.nscans), how: tr("{n} GPS fixes (WGS 84 → EPSG:{epsg})", { n: fx.length, epsg }) } : { error: tr("The GPS fixes could not be reprojected.") });
      } else if (place.mode === "line") {
        const p = [place.x0, place.y0, place.x1, place.y1].map(num);
        if (!p.every(Number.isFinite)) { if (alive) setTrack(null); return; }
        const fx = [{ scan: 0, x: p[0], y: p[1], z: null }, { scan: d.nscans - 1, x: p[2], y: p[3], z: null }];
        if (alive) setTrack({ pos: scanPositions(fx, d.nscans), how: tr("a straight line between the two points") });
      } else if (alive) setTrack(null);
    })();
    return () => { alive = false; };
  }, [d, gpr, place.mode, place.x0, place.y0, place.x1, place.y1, project?.epsg]);
  const trackLen = useMemo(() => {
    const p = track?.pos;
    if (!p) return null;
    let s = 0;
    for (let k = 1; k < p.x.length; k++) s += Math.hypot(p.x[k] - p.x[k - 1], p.y[k] - p.y[k - 1]);
    return s;
  }, [track]);
  const along = d ? (d.distance ? { len: d.nscans * d.distance, unit: tr("Distance (m)") } : trackLen ? { len: trackLen, unit: tr("Distance along the track (m)") } : { len: d.nscans, unit: tr("Scan") }) : null;
  const depthM = proc ? depthOfTime(proc.timeNs, v) : 0;

  const figOpts = img ? { timeNs: proc.timeNs, depthM, along: along.len, alongUnit: along.unit, title: `${gpr.name}${d.channels.length > 1 ? ` — ch ${ch + 1}` : ""} · ${proc.steps.join(", ")} · εr ${epsr} (v ${v.toFixed(3)} m/ns)` } : null;
  const figKey = figOpts ? JSON.stringify(figOpts) : "";
  // drawn in the module's main area when it offers one (the sidebar is too narrow for a radargram), else here; redrawn at
  // the area's size ("Fit") or at a fixed scale, and again when the area is resized
  useEffect(() => {
    const host = mainRef?.current || canvasHost.current;
    if (!host) return undefined;
    // redrawn only when the area's size really changes: the figure itself must not trigger the observer again (it did,
    // through a scrollbar appearing and going: a 5,643-scan line kept the page busy, 40 s for one setting change)
    let last = "";
    const draw = () => {
      const size = `${host.clientWidth}x${host.clientHeight}`;
      if (size === last) return;
      last = size;
      host.innerHTML = "";
      if (!img) {
        if (host !== canvasHost.current) { const p = document.createElement("div"); p.textContent = tr("Open a .DZT file on the left to see its radargram here."); p.style.cssText = "color: var(--color-text-muted); margin: 40px auto; text-align: center"; host.appendChild(p); }
        return;
      }
      const z = Number(o.zoom), fit = o.zoom === "fit";
      const width = fit ? Math.max(300, host.clientWidth - 28) : img.width * z + 100;
      const height = fit ? Math.max(260, host.clientHeight - 28) : Math.min(img.height, 1600) * z + 54;
      const c = figure(img, { ...figOpts, width, height, dpr: window.devicePixelRatio || 1, pic });
      c.style.display = "block";
      host.appendChild(c);
    };
    draw();
    if (o.zoom !== "fit" || typeof ResizeObserver === "undefined") return undefined;
    let raf = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
    ro.observe(host);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [img, pic, figKey, o.zoom, mainRef]); // figOpts is read through figKey

  const groundAt = (x, y, k) => {
    const t = terrain ? terrainElevationAt(terrain, x, y) : NaN;
    if (Number.isFinite(t)) return t;
    const zk = track?.pos?.z?.[k];
    if (Number.isFinite(zk)) return zk;
    return num(place.ground);
  };
  const addTo3d = () => {
    if (!track?.pos) { setMsg({ ok: false, text: tr("Place the line first: load its .DZG GPS file, or type its start and end points.") }); return; }
    const p = track.pos, n = Math.min(MAX_COLUMNS_3D, d.nscans), top = [], bottom = [], u = [];
    for (let i = 0; i < n; i++) {
      const k = Math.round((i * (d.nscans - 1)) / Math.max(1, n - 1));
      const z = groundAt(p.x[k], p.y[k], k);
      if (!Number.isFinite(z)) { setMsg({ ok: false, text: tr("No ground elevation under the line: load a terrain, use GPS fixes with altitudes, or enter a ground elevation.") }); return; }
      top.push([+p.x[k].toFixed(2), +p.y[k].toFixed(2), +z.toFixed(2)]);
      bottom.push([+p.x[k].toFixed(2), +p.y[k].toFixed(2), +(z - depthM).toFixed(2)]);
      u.push(+(k / Math.max(1, d.nscans - 1)).toFixed(5));
    }
    const pic = document.createElement("canvas"); pic.width = img.width; pic.height = img.height;
    pic.getContext("2d").putImageData(new ImageData(img.pixels, img.width, img.height), 0, 0);
    addSectionImage({
      name: `GPR ${gpr.name.replace(/\.dzt$/i, "")}${d.channels.length > 1 ? ` ch ${ch + 1}` : ""}`, dataUrl: pic.toDataURL("image/png"), strip: { top, bottom, u }, source: "gpr",
      params: { tool: "GPR radargram (GSSI .DZT)", file: gpr.name, gps: gpr.dzgName || null, placement: track.how, processing: proc.steps, dielectric: epsr, velocityMPerNs: +v.toFixed(4), depthM: +depthM.toFixed(2), app: APP_VERSION },
    });
    setMsg({ ok: true, text: tr("Added to the 3D view as a curtain {len} m long and {depth} m deep along {how} (3D View sidebar > Section images).", { len: trackLen.toFixed(0), depth: depthM.toFixed(1), how: track.how }) });
  };
  const exportPng = () => {
    if (!img) return;
    // #1090 — the labels were 11 px on a canvas as wide as the line (4,100 px for 4,000 traces: 1.3 pt at 170 mm); now
    // scaled so they print at printPt.small where Layout places the image (exportScale)
    const s = exportScale(img.width + 100);
    const c = figure(img, { ...figOpts, width: img.width + 100 * s, height: Math.min(img.height, 1600) + 54 * s, pic, s }); // the full-resolution picture
    saveFile({ suggestedName: `${safeFileName(gpr.name.replace(/\.dzt$/i, ""), "gpr")}_radargram.png`, filters: [{ name: "PNG", extensions: ["png"] }], content: c.toDataURL("image/png").split(",")[1], encoding: "base64" });
  };

  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
  const row = { display: "flex", alignItems: "center", gap: 6, marginTop: 5 };
  const lbl = { width: 104, flexShrink: 0, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
  const inp = { ...numInput, width: 70, flex: "0 1 70px", minWidth: 0 };
  return (
    <div style={{ fontSize: "var(--font-size-sm)" }}>
      <div style={small}>{tr("A GSSI .DZT radar line (RADAN, SIR-3000 / 4000, UtilityScan…), with its .DZG GPS file when there is one. GPR reaches metres to a few tens of metres in resistive ground and much less in clay, wet till or conductive ground.")}</div>
      <button onClick={() => fileRef.current?.click()} style={{ ...pBtn, marginTop: 8 }}><Upload size={14} />{" "}{tr("Open .DZT (+ .DZG)…")}</button>
      <input ref={fileRef} type="file" accept=".dzt,.DZT,.dzg,.DZG" multiple style={{ display: "none" }} onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      {msg && <div role="status" style={{ ...small, marginTop: 6, color: msg.ok ? "var(--color-text-secondary)" : "var(--color-danger-fg)" }}>{msg.text}</div>}
      {d && (<>
        {d.channels.length > 1 && <div style={row}><span style={lbl}>{tr("Channel")}</span><select value={ch} onChange={(e) => setCh(Number(e.target.value))} style={{ ...numInput, flex: 1 }} aria-label={tr("Channel")}>{d.channels.map((_, i) => <option key={i} value={i}>{tr("Channel {n}", { n: i + 1 })}</option>)}</select></div>}
        <div className="ge-section-label" style={{ marginTop: 12 }}>{tr("Processing")}</div>
        <div style={row} title={tr("Samples before the first arrival are cut so depth 0 is the ground. Blank: the first break, found automatically.")}><span style={lbl}>{tr("Time zero (sample)")}</span><input type="number" min={0} value={o.t0} placeholder={String(auto.t0)} onChange={(e) => set("t0", e.target.value)} style={inp} aria-label={tr("Time zero sample")} /></div>
        <div style={row}><label style={{ ...lbl, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}><input type="checkbox" checked={o.dewow} onChange={(e) => set("dewow", e.target.checked)} />{tr("Dewow (ns)")}</label><input type="number" min={0} value={o.dewowNs} placeholder={String(auto.dewowNs)} disabled={!o.dewow} onChange={(e) => set("dewowNs", e.target.value)} style={inp} aria-label={tr("Dewow window (ns)")} /></div>
        <div style={row} title={tr("Subtracts the mean trace: removes horizontal banding (antenna ringing, the direct wave) — and flat reflectors too.")}><span style={lbl}>{tr("Background")}</span>
          <select value={o.bg} onChange={(e) => set("bg", e.target.value)} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={tr("Background removal")}><option value="line">{tr("Remove (whole line)")}</option><option value="window">{tr("Remove (running window)")}</option><option value="off">{tr("Keep")}</option></select>
          {o.bg === "window" && <input type="number" min={3} value={o.bgScans} onChange={(e) => set("bgScans", e.target.value)} style={{ ...inp, width: 56 }} aria-label={tr("Background window (scans)")} title={tr("Window (scans)")} />}
        </div>
        <div style={row}><span style={lbl}>{tr("Gain")}</span>
          <select value={o.gain} onChange={(e) => set("gain", e.target.value)} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={tr("Gain")}><option value="agc">{tr("AGC")}</option><option value="power">{tr("Power (t^p)")}</option><option value="none">{tr("None")}</option></select>
          {o.gain === "agc" && <input type="number" min={0} value={o.agcNs} placeholder={String(auto.agcNs)} onChange={(e) => set("agcNs", e.target.value)} style={{ ...inp, width: 56 }} aria-label={tr("AGC window (ns)")} title={tr("Window (ns)")} />}
          {o.gain === "power" && <input type="number" step={0.1} value={o.power} onChange={(e) => set("power", e.target.value)} style={{ ...inp, width: 56 }} aria-label={tr("Power")} />}
        </div>
        <div style={row} title={tr("Show the radargram only down to this two-way time; blank = the whole window.")}><span style={lbl}>{tr("Show to (ns)")}</span><input type="number" min={1} value={o.tmax} placeholder={String(Math.round((d.nsamp - 1) * d.dt))} onChange={(e) => set("tmax", e.target.value)} style={inp} aria-label={tr("Show to (ns)")} /></div>
        <div style={row} title={tr("Relative dielectric constant of the ground: sets the radar velocity and the depth scale (dry sand ~4, dry rock 5-8, wet soil 15-30, water 81).")}><span style={lbl}>{tr("Dielectric (εr)")}</span><input type="number" min={1} max={81} step={0.5} value={o.epsr} placeholder={String(h.epsr || 9)} onChange={(e) => set("epsr", e.target.value)} style={inp} aria-label={tr("Dielectric constant")} /><span style={small}>{tr("{v} m/ns", { v: v.toFixed(3) })}</span></div>
        <div style={row}><span style={lbl}>{tr("Colours")}</span>
          <select value={o.colors} onChange={(e) => set("colors", e.target.value)} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={tr("Colours")}><option value="grey">{tr("Grey")}</option><option value="bwr">{tr("Blue - white - red")}</option></select>
          <input type="range" min={80} max={99.9} step={0.1} value={o.clip} onChange={(e) => set("clip", e.target.value)} style={{ width: 70 }} aria-label={tr("Contrast")} title={tr("Contrast: the colour scale ends at this percentile of the amplitudes")} />
        </div>
        <div style={{ ...row, justifyContent: "space-between" }}><span style={small}>{busy || !proc ? tr("Processing…") : tr("{t} ns ≈ {m} m deep at εr {e}", { t: proc.timeNs.toFixed(1), m: depthM.toFixed(2), e: epsr })}</span>
          <select value={o.zoom} onChange={(e) => set("zoom", e.target.value)} style={{ ...numInput, width: 70 }} aria-label={tr("Zoom")}><option value="fit">{tr("Fit")}</option>{[0.5, 1, 2].map((z) => <option key={z} value={z}>{`${z * 100}%`}</option>)}</select>
        </div>
        {!mainRef && <div ref={canvasHost} style={{ marginTop: 6, overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: 4, background: "#fff" }} aria-label={tr("Radargram")} role="img" />}
        <button onClick={exportPng} style={{ ...pBtn, marginTop: 6 }}><Download size={14} />{" "}{tr("Export PNG")}</button>
        <div className="ge-section-label" style={{ marginTop: 12 }}>{tr("Place in the 3D view")}</div>
        <div style={row}><span style={lbl}>{tr("Position from")}</span>
          <select value={place.mode} onChange={(e) => setPlace((p) => ({ ...p, mode: e.target.value }))} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={tr("Position from")}>
            <option value="gps" disabled={!(gpr.fixes?.length >= 2)}>{gpr.fixes?.length >= 2 ? tr("GPS track (.DZG)") : tr("GPS track (no .DZG loaded)")}</option>
            <option value="line">{tr("Start and end points")}</option>
          </select>
        </div>
        {place.mode === "line" && (<>
          <div style={row}><span style={lbl}>{tr("Start x / y")}</span><input type="number" value={place.x0} onChange={(e) => setPlace((p) => ({ ...p, x0: e.target.value }))} style={inp} aria-label={tr("Start x")} /><input type="number" value={place.y0} onChange={(e) => setPlace((p) => ({ ...p, y0: e.target.value }))} style={inp} aria-label={tr("Start y")} /></div>
          <div style={row}><span style={lbl}>{tr("End x / y")}</span><input type="number" value={place.x1} onChange={(e) => setPlace((p) => ({ ...p, x1: e.target.value }))} style={inp} aria-label={tr("End x")} /><input type="number" value={place.y1} onChange={(e) => setPlace((p) => ({ ...p, y1: e.target.value }))} style={inp} aria-label={tr("End y")} /></div>
        </>)}
        <div style={row} title={tr("Used where there is no terrain and no GPS altitude.")}><span style={lbl}>{tr("Ground (m)")}</span><input type="number" value={place.ground} placeholder={terrain ? tr("terrain") : ""} onChange={(e) => setPlace((p) => ({ ...p, ground: e.target.value }))} style={inp} aria-label={tr("Ground elevation")} /></div>
        {track?.error && <div style={{ ...small, color: "var(--color-danger-fg)", marginTop: 4 }}>{track.error}</div>}
        {track?.pos && <div style={{ ...small, marginTop: 4 }}>{tr("{len} m along {how}.", { len: trackLen.toFixed(1), how: track.how })}{d.distance && Math.abs(trackLen - d.nscans * d.distance) > 0.1 * trackLen ? ` ${tr("The survey wheel says {m} m.", { m: (d.nscans * d.distance).toFixed(1) })}` : ""}</div>}
        <button onClick={addTo3d} disabled={!track?.pos} style={{ ...pBtn, marginTop: 6, opacity: track?.pos ? 1 : 0.5 }}><Box size={14} />{" "}{tr("Add to the 3D view")}</button>
      </>)}
    </div>
  );
}
