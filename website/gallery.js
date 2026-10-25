// geostrix.com — the "A look inside" slideshow. Without JavaScript every picture is simply shown in a column.
// One slide at a time, arrows and dots to move, and it moves on by itself every 5 seconds — except while someone is
// moving through it with the keyboard, after the visitor presses Pause, or when the tab is hidden. It does NOT pause
// under the pointer: the slideshow fills most of the screen, so a resting mouse sat over it and it never moved (Matt,
// 2026-10-25); the Pause button is the way to stop it. Clicking an arrow or a dot leaves that button focused, so only
// keyboard focus (:focus-visible) counts as "reading".
// A visitor whose system asks for reduced motion gets an instant switch instead of the fade (style.css). Left / right
// arrow keys work too.
(() => {
  const DELAY = 5000;
  // the page's language (<html lang>) picks the button text: en, es, pt-BR, fr or ar
  const TEXT = {
    en: { pic: (i, n) => `Picture ${i} of ${n}`, play: "Play", pause: "Pause", playL: "Play the slideshow", pauseL: "Pause the slideshow" },
    es: { pic: (i, n) => `Imagen ${i} de ${n}`, play: "Reproducir", pause: "Pausa", playL: "Reproducir la presentación", pauseL: "Pausar la presentación" },
    pt: { pic: (i, n) => `Imagem ${i} de ${n}`, play: "Reproduzir", pause: "Pausar", playL: "Reproduzir a apresentação", pauseL: "Pausar a apresentação" },
    fr: { pic: (i, n) => `Image ${i} sur ${n}`, play: "Lecture", pause: "Pause", playL: "Lancer le diaporama", pauseL: "Mettre le diaporama en pause" },
    ar: { pic: (i, n) => `الصورة ${i} من ${n}`, play: "تشغيل", pause: "إيقاف مؤقت", playL: "تشغيل عرض الصور", pauseL: "إيقاف عرض الصور مؤقتًا" },
  };
  const t = TEXT[document.documentElement.lang.slice(0, 2)] || TEXT.en;
  document.querySelectorAll("[data-carousel]").forEach((root) => {
    const slides = [...root.querySelectorAll(".slide")];
    if (slides.length < 2) return;
    const controls = root.querySelector(".controls");
    const dotsBox = root.querySelector(".dots");
    const pauseBtn = root.querySelector(".pause");
    let index = 0, timer = null, userPaused = false, focus = false;

    root.classList.add("js");
    controls.hidden = false;
    const dots = slides.map((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", t.pic(i + 1, slides.length));
      b.addEventListener("click", () => { show(i); restart(); });
      dotsBox.appendChild(b);
      return b;
    });

    function show(i) {
      index = (i + slides.length) % slides.length;
      slides.forEach((s, k) => {
        const on = k === index;
        s.classList.toggle("active", on);
        s.setAttribute("aria-hidden", on ? "false" : "true");
        s.querySelectorAll("a").forEach((a) => { a.tabIndex = on ? 0 : -1; });
      });
      dots.forEach((d, k) => d.setAttribute("aria-current", k === index ? "true" : "false"));
      // the next picture starts loading before its turn
      slides[(index + 1) % slides.length].querySelectorAll("img[loading=lazy]").forEach((img) => { img.loading = "eager"; });
    }
    function running() { return !userPaused && !focus && !document.hidden; }
    function restart() {
      clearInterval(timer);
      timer = running() ? setInterval(() => show(index + 1), DELAY) : null;
    }
    function setPaused(p) {
      userPaused = p;
      pauseBtn.textContent = p ? t.play : t.pause;
      pauseBtn.setAttribute("aria-label", p ? t.playL : t.pauseL);
      restart();
    }

    root.querySelector(".prev").addEventListener("click", () => { show(index - 1); restart(); });
    root.querySelector(".next").addEventListener("click", () => { show(index + 1); restart(); });
    pauseBtn.addEventListener("click", () => setPaused(!userPaused));
    root.addEventListener("focusin", (e) => { if (e.target.matches(":focus-visible")) { focus = true; restart(); } });
    root.addEventListener("focusout", (e) => { if (!root.contains(e.relatedTarget)) { focus = false; restart(); } });
    root.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { show(index - 1); restart(); }
      if (e.key === "ArrowRight") { show(index + 1); restart(); }
    });
    document.addEventListener("visibilitychange", restart);

    show(0);
    setPaused(userPaused);
  });
})();
