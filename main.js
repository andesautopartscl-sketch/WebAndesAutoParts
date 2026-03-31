(function () {
  var header = document.querySelector(".site-header");
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  var year = document.getElementById("year");

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  function closeMenu() {
    if (!header || !toggle) return;
    header.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = !header.classList.contains("is-open");
      header.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
    });

    nav.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });

    nav.querySelectorAll('a[href$=".html"]').forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenu();
  });

  function bindContactForm(form) {
    if (!form) return;
    var action = (form.getAttribute("action") || "").trim();
    if (action.indexOf("formsubmit.co") !== -1) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      alert("Gracias por tu mensaje. En un sitio en producción esto se enviaría al servidor.");
    });
  }

  bindContactForm(document.getElementById("contact-form"));
  bindContactForm(document.getElementById("contact-form-home"));

  (function initCookieBanner() {
    var banner = document.getElementById("cookie-banner");
    var btn = document.getElementById("cookie-accept");
    if (!banner || !btn) return;
    try {
      if (localStorage.getItem("andes_cookie_consent") === "1") return;
    } catch (err) {}
    banner.removeAttribute("hidden");
    btn.addEventListener("click", function () {
      try {
        localStorage.setItem("andes_cookie_consent", "1");
      } catch (err) {}
      banner.setAttribute("hidden", "");
    });
  })();

  (function initHeroCarousel() {
    var root = document.querySelector(".hero-carousel");
    if (!root) return;
    var slides = root.querySelectorAll(".hero-slide");
    var dots = document.querySelectorAll(".hero-dot");
    if (!slides.length || slides.length !== dots.length) return;

    var i = 0;
    var timer;

    function go(n) {
      i = ((n % slides.length) + slides.length) % slides.length;
      slides.forEach(function (slide, j) {
        slide.classList.toggle("is-active", j === i);
      });
      dots.forEach(function (dot, j) {
        var on = j === i;
        dot.classList.toggle("is-active", on);
        dot.setAttribute("aria-selected", on ? "true" : "false");
      });
    }

    function next() {
      go(i + 1);
    }

    function schedule() {
      clearInterval(timer);
      timer = setInterval(next, 6500);
    }

    dots.forEach(function (dot, j) {
      dot.addEventListener("click", function () {
        go(j);
        schedule();
      });
    });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    schedule();
  })();
})();
