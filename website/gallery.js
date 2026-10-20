// geostrix.com — the "A look inside" slideshow. Without JavaScript every picture is simply shown in a column.
// One slide at a time, arrows and dots to move, and it moves on by itself every 5 seconds — except while the pointer
// is over it, while something in it has keyboard focus, after the visitor presses Pause, or when the tab is hidden.
// A visitor whose system asks for reduced motion gets an instant switch instead of the fade (style.css). Left / right
// arrow keys work too.
(() => {
  const DELAY = 5000;
  document.querySelectorAll("[data-carousel]").forEach((root) => {
    const slides = [...root.querySelectorAll(".slide")];
    if (slides.length < 2) return;
    const controls = root.querySelector(".controls");
    const dotsBox = root.querySelector(".dots");
    const pauseBtn = root.querySelector(".pause");
    let index = 0, timer = null, userPaused = false, hover = false, focus = false;

    root.classList.add("js");
    controls.hidden = false;
    const dots = slides.map((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", `Picture ${i + 1} of ${slides.length}`);
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
    function running() { return !userPaused && !hover && !focus && !document.hidden; }
    function restart() {
      clearInterval(timer);
      timer = running() ? setInterval(() => show(index + 1), DELAY) : null;
    }
    function setPaused(p) {
      userPaused = p;
      pauseBtn.textContent = p ? "Play" : "Pause";
      pauseBtn.setAttribute("aria-label", p ? "Play the slideshow" : "Pause the slideshow");
      restart();
    }

    root.querySelector(".prev").addEventListener("click", () => { show(index - 1); restart(); });
    root.querySelector(".next").addEventListener("click", () => { show(index + 1); restart(); });
    pauseBtn.addEventListener("click", () => setPaused(!userPaused));
    root.addEventListener("mouseenter", () => { hover = true; restart(); });
    root.addEventListener("mouseleave", () => { hover = false; restart(); });
    root.addEventListener("focusin", () => { focus = true; restart(); });
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
