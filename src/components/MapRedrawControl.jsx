// TASKS.csv #3491 — in Layout's panel of a placed Maps snapshot: the dpi the picture prints at at this frame size, and a button that has the Maps plan draw it
// again at 300 dpi of the frame (lib/planRecapture.js): the same ground and centre, the plan as it is now. Nothing else on the element changes.
import React from "react";
import { useStore } from "../lib/store.jsx";
import { t as tr } from "../lib/i18n.js";
import { requestModuleAction } from "../lib/menuRequests.js";
import { requestPlanRecapture, recaptureSpec, pictureDpi, printTextPt, RECAPTURE_DPI } from "../lib/planRecapture.js";

export default function MapRedrawControl({ sel }) {
  const { goToModule } = useStore();
  if (!sel?.mapsView) return null;
  const spec = recaptureSpec(sel), have = pictureDpi(sel);
  const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45, marginBottom: 4 };
  const go = () => { requestModuleAction("maps-plan"); requestPlanRecapture(spec); goToModule("maps"); };
  const textPt = printTextPt(sel), small = textPt != null && textPt < 6.5; // TASKS.csv #3828 — hole ids at about 3 pt on a sheet: the plan's text drawn at print size
  const goText = () => { const s = recaptureSpec(sel, RECAPTURE_DPI, { printText: true }); if (!s.ok) return; requestModuleAction("maps-plan"); requestPlanRecapture(s); goToModule("maps"); };
  return (
    <div style={{ marginBottom: 6 }}>
      {small && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("The hole ids and labels on this picture print at about {pt} pt.", { pt: textPt })}</div>}
      {textPt != null && <button type="button" onClick={goText} style={{ fontSize: "var(--font-size-sm)", marginBottom: 4 }} title={tr("The Maps plan redraws this view at the frame's own size, so hole ids and call-outs print at their screen size (about 7.5 pt), then Layout opens again.")}>{tr("Draw it again with the text at print size")}</button>}
      {have != null && <div style={note}>{tr("This picture prints at about {dpi} dpi at this size.", { dpi: Math.round(have) })}</div>}
      {spec.ok ? (
        <>
          <button type="button" onClick={go} style={{ fontSize: "var(--font-size-sm)" }}
            title={tr("The Maps plan redraws this view as it is now (layers and colours) at {dpi} dpi for this frame, then Layout opens again.", { dpi: RECAPTURE_DPI })}>
            {tr("Draw it again at {dpi} dpi from Maps", { dpi: RECAPTURE_DPI })}
          </button>
          {spec.capped && <div style={note}>{tr("This frame is larger than a picture can be drawn at {dpi} dpi: it will be drawn at {got} dpi.", { dpi: RECAPTURE_DPI, got: spec.dpi })}</div>}
        </>
      ) : spec.reason === "sharp"
        ? <div style={note}>{tr("That is sharp enough to print at this size.")}</div>
        : <div style={note}>{tr("This snapshot was sent before Layout could ask Maps to draw it again: send it again from Maps to get that.")}</div>}
    </div>
  );
}
