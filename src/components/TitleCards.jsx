// TASKS.csv #3940 (second part, Matt 2026-11-21: "I want this nice pop up info box for every tool") — every other button that
// carries only a native title="…" (the pane toolbars, the view's corner buttons, the small icon buttons) shows the same card as a
// ribbon tool, from ONE listener for the whole window, so a button added later gets it without a change at its call site.
// Mounted once in App.jsx. How it behaves is the ribbon's (HoverToolInfo.jsx): a short delay on hover, keyboard focus
// (:focus-visible) too, Escape / a click / a scroll / a resize hides it, never while the button's own menu is open
// (aria-expanded), text-size tokens, rtl, never off-screen.
// The native title is taken off the button the moment the pointer or focus reaches it (a native tooltip beside the card
// would be the same words twice) and its words move to data-geo-tip, so reading them again needs no title; the button keeps
// its accessible name (an icon-only button gets an aria-label from the title, any other gets an aria-description).
import React, { useEffect, useRef, useState } from "react";
import { ToolInfoCard } from "./HoverToolInfo.jsx";
import { titleCardParts } from "../lib/titleCard.js";

const SEL = "button[title], button[data-geo-tip], [role=button][title], [role=button][data-geo-tip]";
const HOVER_MS = 350, FOCUS_MS = 80;

function adopt(el) { // take the native title off; returns the words
  const t = el.getAttribute("title");
  if (t && t.trim()) {
    el.setAttribute("data-geo-tip", t);
    if (!el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby") && !(el.textContent || "").trim()) el.setAttribute("aria-label", t.split("\n")[0]);
    else if (!el.hasAttribute("aria-description")) el.setAttribute("aria-description", t);
  }
  el.removeAttribute("title");
  return el.getAttribute("data-geo-tip") || "";
}

export default function TitleCards() {
  const [tip, setTip] = useState(null); // { heading, body }
  const anchorRef = useRef(null);
  useEffect(() => {
    let cur = null, off = null, timer = 0;
    const clear = () => { clearTimeout(timer); timer = 0; };
    const hide = () => { clear(); setTip(null); };
    const show = (el, ms) => {
      clear();
      timer = setTimeout(() => {
        if (cur !== el || off === el || !el.isConnected || el.getAttribute("aria-expanded") === "true") return;
        const { heading, body } = titleCardParts({ title: el.getAttribute("data-geo-tip"), ariaLabel: el.getAttribute("aria-label"), text: el.textContent });
        if (!body) return;
        anchorRef.current = el;
        setTip({ heading, body });
      }, ms);
    };
    const enter = (el, ms) => { if (!adopt(el)) return; if (el !== cur) { cur = el; off = null; hide(); } show(el, ms); };
    const onOver = (e) => {
      const el = e.target?.closest?.(SEL);
      if (cur && cur !== el && !(el && cur.contains(el))) { cur = null; off = null; hide(); }
      if (el && el !== cur) enter(el, HOVER_MS);
    };
    const onFocus = (e) => { const el = e.target?.closest?.(SEL); if (el && el.matches(":focus-visible")) enter(el, FOCUS_MS); };
    const onBlur = (e) => { if (cur && e.target === cur) { cur = null; off = null; hide(); } };
    const onDown = () => { if (cur) { off = cur; hide(); } };
    const onKey = (e) => { if (e.key === "Escape" && cur) { off = cur; hide(); } };
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("focusout", onBlur, true);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      clear();
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("focusout", onBlur, true);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);
  return tip ? <ToolInfoCard anchorRef={anchorRef} title={tip.heading} text={tip.body} width={240} align="left" /> : null;
}
