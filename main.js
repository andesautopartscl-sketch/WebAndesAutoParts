(function () {
  var header = document.querySelector(".site-header");
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  var year = document.getElementById("year");

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  document.querySelectorAll(".hero-marcas-logos img").forEach(function (img) {
    img.onerror = function () {
      this.style.display = "none";
    };
  });

  function updateDynamicProductCounts(count) {
    if (!count || count < 1) return;
    document.querySelectorAll("[data-dynamic-count='productos']").forEach(function (el) {
      if (el.classList.contains("hero-lead")) {
        el.textContent = count + "+ productos · Envío 24h · Garantía incluida";
      } else if (el.classList.contains("hero-stat-value")) {
        el.textContent = count + "+";
      } else if (el.classList.contains("stat-number")) {
        el.dataset.target = String(count);
        // Siempre refresca el número visible (aunque la animación ya haya corrido)
        el.textContent = String(count);
        el.dataset.animated = "1";
      } else {
        el.textContent = count + "+";
      }
    });
  }

  // Contador del hero/stats independiente del catálogo (siempre al día con productos.json)
  (function initProductCountFromJson() {
    if (!document.querySelector("[data-dynamic-count='productos']")) return;
    var url = "data/productos.json?v=" + Date.now();
    fetch(url, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("count fetch failed");
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data) || !data.length) return;
        updateDynamicProductCounts(data.length);
      })
      .catch(function () {});
  })();

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

  function graciasPageUrl() {
    try {
      return new URL("gracias.html", new URL(".", window.location.href)).href;
    } catch (err) {
      return "gracias.html";
    }
  }

  (function initContactFormLocalDev() {
    var form = document.getElementById("contact-form-home");
    if (!form) return;

    var host = (window.location.hostname || "").toLowerCase();
    var isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "::1";

    if (!isLocal) return;

    form.addEventListener(
      "submit",
      function (e) {
        e.preventDefault();
        var fd = new FormData(form);
        var nombre = String(fd.get("nombre") || "").trim();
        var email = String(fd.get("email") || "").trim();
        var telefono = String(fd.get("telefono") || "").trim();
        var patente = String(fd.get("patente") || "").trim();
        var chasis = String(fd.get("chasis") || "").trim();
        var mensaje = String(fd.get("mensaje") || "").trim();
        var body =
          "Nuevo mensaje (prueba local)\n\n" +
          "Nombre: " +
          nombre +
          "\nCorreo: " +
          email +
          "\nTeléfono: " +
          (telefono || "—") +
          "\nPatente: " +
          (patente || "—") +
          "\nChasis: " +
          (chasis || "—") +
          "\n\nConsulta:\n" +
          mensaje;
        var subject = encodeURIComponent("Mensaje web — Andes Auto Parts (prueba local)");
        var mailto =
          "mailto:andesautopartscl@gmail.com?subject=" +
          subject +
          "&body=" +
          encodeURIComponent(body);
        alert(
          "Modo local: al aceptar, se abrirá tu correo con el mensaje listo.\n\n" +
            "En GitHub Pages puedes usar Web3Forms (contact-config.js) o WhatsApp."
        );
        window.location.href = mailto;
      },
      true
    );
  })();

  (function initContactFormEmailJS() {
    var form =
      document.getElementById("contact-form-home") ||
      document.querySelector("#contacto form, .contact-form, form[name='contacto']");
    if (!form || typeof emailjs === "undefined") return;

    var host = (window.location.hostname || "").toLowerCase();
    var isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "::1";
    if (isLocal) return;

    emailjs.init("TU_PUBLIC_KEY");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"], input[type="submit"]');
      if (!btn) return;
      var originalText = btn.textContent;
      btn.textContent = "Enviando...";
      btn.disabled = true;

      emailjs
        .sendForm("service_andes", "template_andes", form)
        .then(function () {
          btn.textContent = "✓ Mensaje enviado";
          btn.style.background = "#22c55e";
          form.reset();
          setTimeout(function () {
            btn.textContent = originalText;
            btn.style.background = "";
            btn.disabled = false;
          }, 4000);
        })
        .catch(function () {
          btn.textContent = "Error al enviar";
          btn.style.background = "#ef4444";
          btn.disabled = false;
          setTimeout(function () {
            btn.textContent = originalText;
            btn.style.background = "";
          }, 3000);
        });
    });
  })();

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

  (function initPromoModal() {
    var modal = document.getElementById("promo-modal");
    if (!modal) return;

    var STORAGE_KEY = "andes_promo_fiestas_patrias_session";
    var closing = false;
    var forcePromo = false;
    try {
      forcePromo = new URLSearchParams(window.location.search).get("promo") === "1";
    } catch (err) {}

    // Limpia claves viejas que dejaban el banner oculto para siempre
    try {
      [
        "andes_promo_fiestas_patrias_2026",
        "andes_promo_fiestas_patrias_v2",
        "andes_promo_fiestas_patrias_v3",
        "andes_promo_fiestas_patrias_v4",
        "andes_promo_fiestas_patrias_v5",
      ].forEach(function (k) {
        localStorage.removeItem(k);
      });
    } catch (err) {}

    // ?promo=1 fuerza el banner (start-local). Si no, 1 vez por pestaña/sesión.
    if (!forcePromo) {
      try {
        if (sessionStorage.getItem(STORAGE_KEY) === "1") return;
      } catch (err) {}
    }

    function prefersReducedMotion() {
      try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch (err) {
        return false;
      }
    }

    function finishClose() {
      modal.setAttribute("hidden", "");
      modal.classList.remove("is-closing");
      document.body.style.overflow = "";
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch (err) {}
      document.removeEventListener("keydown", onKey);
      var fx = document.getElementById("promo-fireworks");
      if (fx && fx.parentNode) fx.parentNode.removeChild(fx);
      closing = false;
    }

    /** Fuegos artificiales a pantalla completa (rojo / blanco / azul) */
    function playDelicateFireworks(done) {
      var canvas = document.createElement("canvas");
      canvas.id = "promo-fireworks";
      canvas.className = "promo-fireworks";
      canvas.setAttribute("aria-hidden", "true");
      document.body.appendChild(canvas);

      var ctx = canvas.getContext("2d");
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = window.innerWidth;
      var h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Solo colores de la bandera de Chile
      var colors = [
        "#e63030",
        "#ff4d4d",
        "#ff7a7a",
        "#ffffff",
        "#f0f4ff",
        "#1e4fa3",
        "#3d6ec8",
        "#7eb6ff",
      ];
      var particles = [];
      var scheduled = [];
      var start = performance.now();
      var activeUntil = 2300;
      var fadeMs = 550;
      var fadeStart = null;
      var finished = false;

      function pickColor() {
        return colors[(Math.random() * colors.length) | 0];
      }

      function spawnBurst(ox, oy, count, power, canBranch) {
        var baseColor = pickColor();
        for (var i = 0; i < count; i++) {
          var angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
          var speed = power * (0.55 + Math.random() * 0.95);
          var isSpark = Math.random() > 0.72;
          particles.push({
            x: ox,
            y: oy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.55,
            life: 1,
            decay: 0.0065 + Math.random() * 0.008,
            size: isSpark ? 2.2 + Math.random() * 2.8 : 3.2 + Math.random() * 4.5,
            color: Math.random() > 0.35 ? baseColor : pickColor(),
            gravity: 0.022 + Math.random() * 0.016,
            trail: [],
            spark: isSpark,
            branch: canBranch && Math.random() > 0.82,
            branched: false,
          });
        }
        particles.push({
          x: ox,
          y: oy,
          vx: 0,
          vy: 0,
          life: 1,
          decay: 0.04,
          size: 14 + power * 1.2,
          color: "#ffffff",
          gravity: 0,
          trail: [],
          spark: false,
          branch: false,
          branched: true,
          flash: true,
        });
      }

      function scheduleBurst(delay, ox, oy, count, power, canBranch) {
        scheduled.push({
          at: start + delay,
          ox: ox,
          oy: oy,
          count: count,
          power: power,
          canBranch: canBranch,
        });
      }

      // Estallidos repartidos por TODA la pantalla (duración un poco más corta)
      spawnBurst(w * 0.5, h * 0.42, 72, 5.2, true);
      scheduleBurst(180, w * 0.12, h * 0.22, 52, 4.3, true);
      scheduleBurst(280, w * 0.88, h * 0.2, 52, 4.3, true);
      scheduleBurst(400, w * 0.22, h * 0.55, 46, 3.9, true);
      scheduleBurst(500, w * 0.78, h * 0.52, 46, 3.9, true);
      scheduleBurst(620, w * 0.5, h * 0.18, 58, 4.8, true);
      scheduleBurst(760, w * 0.08, h * 0.7, 40, 3.6, true);
      scheduleBurst(860, w * 0.92, h * 0.68, 40, 3.6, true);
      scheduleBurst(980, w * 0.35, h * 0.35, 44, 4.0, true);
      scheduleBurst(1080, w * 0.65, h * 0.32, 44, 4.0, true);
      scheduleBurst(1220, w * 0.5, h * 0.62, 50, 4.4, true);
      scheduleBurst(1400, w * 0.18, h * 0.4, 38, 3.4, false);
      scheduleBurst(1500, w * 0.82, h * 0.38, 38, 3.4, false);
      scheduleBurst(1650, w * 0.5, h * 0.28, 60, 5.2, true);

      function drawSpark(x, y, size, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, size * 0.35);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x - size, y);
        ctx.lineTo(x + size, y);
        ctx.moveTo(x, y - size);
        ctx.lineTo(x, y + size);
        ctx.stroke();
        ctx.restore();
      }

      function beginFade(now) {
        if (fadeStart != null) return;
        fadeStart = now;
        scheduled.length = 0;
        // Acelera el apagado para que no se sienta “pegado”
        for (var fi = 0; fi < particles.length; fi++) {
          particles[fi].decay *= 2.8;
          particles[fi].branch = false;
          particles[fi].trail = [];
        }
        canvas.classList.add("is-fading");
      }

      function frame(now) {
        if (finished) return;
        var elapsed = now - start;
        var fading = fadeStart != null;

        ctx.clearRect(0, 0, w, h);
        if (!fading) {
          ctx.fillStyle = "rgba(6, 14, 32, 0.12)";
          ctx.fillRect(0, 0, w, h);
        }

        if (!fading) {
          for (var s = scheduled.length - 1; s >= 0; s--) {
            if (now >= scheduled[s].at) {
              var b = scheduled[s];
              spawnBurst(b.ox, b.oy, b.count, b.power, b.canBranch);
              scheduled.splice(s, 1);
            }
          }
        }

        for (var i = particles.length - 1; i >= 0; i--) {
          var p = particles[i];
          if (!fading) {
            p.trail.push({ x: p.x, y: p.y });
            if (p.trail.length > 6) p.trail.shift();
          }

          p.x += p.vx;
          p.y += p.vy;
          p.vy += p.gravity;
          p.vx *= 0.992;
          p.life -= p.decay * (fading ? 1.6 : 1);

          if (!fading && p.branch && !p.branched && p.life < 0.55 && p.life > 0.35) {
            p.branched = true;
            spawnBurst(p.x, p.y, 14 + ((Math.random() * 10) | 0), 2.2 + Math.random() * 1.2, false);
          }

          if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
          }

          var alpha = Math.max(0, p.life * p.life);

          if (!fading && p.trail.length > 1 && !p.flash) {
            ctx.beginPath();
            ctx.strokeStyle = p.color;
            ctx.globalAlpha = alpha * 0.35;
            ctx.lineWidth = Math.max(1, p.size * 0.35);
            ctx.lineCap = "round";
            ctx.moveTo(p.trail[0].x, p.trail[0].y);
            for (var t = 1; t < p.trail.length; t++) {
              ctx.lineTo(p.trail[t].x, p.trail[t].y);
            }
            ctx.stroke();
          }

          if (p.flash) {
            ctx.globalAlpha = alpha * 0.85;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * Math.sqrt(p.life), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = alpha * 0.25;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 2.2 * Math.sqrt(p.life), 0, Math.PI * 2);
            ctx.fill();
          } else if (p.spark) {
            drawSpark(p.x, p.y, p.size * 1.6 * Math.sqrt(p.life), p.color, alpha);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(1, p.size * 0.35), 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.globalAlpha = alpha * 0.95;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (0.45 + 0.55 * p.life), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = alpha * 0.35;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.35, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;

        // Fundido fijo: no espera a que “mueran” todas las partículas (evita lag)
        if (fadeStart == null && elapsed >= activeUntil) {
          beginFade(now);
        }

        if (fadeStart != null) {
          var ft = Math.min(1, (now - fadeStart) / fadeMs);
          var ease = 1 - Math.pow(1 - ft, 2);
          canvas.style.opacity = String(Math.max(0, 1 - ease));
          if (ft >= 1) {
            finished = true;
            particles.length = 0;
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
            done();
            return;
          }
        }

        requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);
    }

    function closePromo() {
      if (closing) return;
      closing = true;
      document.removeEventListener("keydown", onKey);

      if (prefersReducedMotion()) {
        finishClose();
        return;
      }

      modal.classList.add("is-closing");
      playDelicateFireworks(finishClose);
    }

    function onKey(e) {
      if (e.key === "Escape") closePromo();
    }

    function openPromo() {
      modal.removeAttribute("hidden");
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", onKey);
      var closeBtn = modal.querySelector(".promo-modal__close");
      if (closeBtn) {
        try {
          closeBtn.focus();
        } catch (err) {}
      }
    }

    modal.querySelectorAll("[data-promo-close]").forEach(function (el) {
      el.addEventListener("click", closePromo);
    });

    setTimeout(openPromo, 300);
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

  (function initCatalogFromJson() {
    var grid = document.getElementById("catalogo-grid");
    if (!grid) return;

    var searchInput = document.getElementById("catalogo-search");
    var catSelect = document.getElementById("catalogo-cat");
    var categoryBanner = document.getElementById("catalog-category-banner");
    var categoryBannerMsg = document.getElementById("catalog-category-banner-msg");
    var categoryClearBtn = document.getElementById("catalog-category-clear");
    var meta = document.getElementById("catalogo-meta");
    var emptyEl = document.getElementById("catalogo-empty");
    var errEl = document.getElementById("catalogo-error");
    var vehicleForm = document.getElementById("vehicle-search-form");
    var vehicleTextInput = document.getElementById("vehicle-search-text");
    var vehicleBrandSelect = document.getElementById("vehicle-brand");
    var vehicleModelSelect = document.getElementById("vehicle-model");
    var vehicleYearSelect = document.getElementById("vehicle-year");
    var vehicleClearBtn = document.getElementById("vehicle-search-clear");
    var vehicleResultEl = document.getElementById("vehicle-result");
    var vehicleResultMsg = document.getElementById("vehicle-result-msg");
    var vehicleNoResultEl = document.getElementById("vehicle-no-result");
    var vehicleWaLink = document.getElementById("vehicle-wa-link");

    var VEHICLE_BRANDS = {
      "Great Wall": {
        keywords: ["great wall", "gwm", "haval", "wingle", "steed", "poer", "cannon", "pao"],
        models: {
          "Haval H2": ["haval h2", "h2"],
          "Haval H6": ["haval h6", "h6"],
          "Haval Jolion": ["jolion", "haval jolion"],
          "Wingle 5": ["wingle 5", "wingle"],
          "Wingle 7": ["wingle 7", "wingle"],
          Poer: ["poer"],
          Cannon: ["cannon"],
          Steed: ["steed"],
        },
      },
      Chery: {
        keywords: ["chery", "tiggo", "arrizo", "orinoco"],
        models: {
          "Tiggo 2": ["tiggo 2", "tiggo2"],
          "Tiggo 3": ["tiggo 3", "tiggo3"],
          "Tiggo 4": ["tiggo 4", "tiggo4"],
          "Tiggo 7": ["tiggo 7", "tiggo7"],
          "Tiggo 8": ["tiggo 8", "tiggo8"],
          "Arrizo 3": ["arrizo 3", "arrizo"],
          "Arrizo 5": ["arrizo 5", "arrizo"],
          QQ: ["qq", "chery qq"],
        },
      },
      JAC: {
        keywords: ["jac", "t6", "t8", "sei", "frison"],
        models: {
          T6: ["jac t6", "t6"],
          T8: ["jac t8", "t8"],
          T9: ["jac t9", "t9"],
          S2: ["jac s2", "s2"],
          S3: ["jac s3", "s3"],
          S5: ["jac s5", "s5"],
          Refine: ["refine", "jac refine"],
        },
      },
      Changan: {
        keywords: ["changan", "hunter", "alsvin", "uni"],
        models: {
          "CS35 Plus": ["cs35", "changan cs35"],
          "CS55 Plus": ["cs55", "changan cs55"],
          "CS75 Plus": ["cs75", "changan cs75"],
          Hunter: ["hunter", "changan hunter"],
          Alsvin: ["alsvin"],
          "UNI-T": ["uni-t", "unit"],
          "UNI-K": ["uni-k", "unik"],
        },
      },
      Geely: {
        keywords: ["geely", "emgrand", "coolray", "okavango"],
        models: {
          Coolray: ["coolray"],
          Azkarra: ["azkarra"],
          Okavango: ["okavango"],
          Emgrand: ["emgrand"],
          "Geometry C": ["geometry"],
        },
      },
      BYD: {
        keywords: ["byd", "han", "tang", "dolphin", "seal"],
        models: {
          Dolphin: ["dolphin"],
          Seal: ["seal"],
          Han: ["han", "byd han"],
          Tang: ["tang", "byd tang"],
          "Song Plus": ["song plus", "song"],
          "Yuan Plus": ["yuan plus", "yuan"],
        },
      },
      MG: {
        keywords: ["mg", "mg3", "mg5", "zs", "hs"],
        models: {
          MG3: ["mg3"],
          MG5: ["mg5"],
          ZS: ["mg zs", "zs"],
          HS: ["mg hs", "hs"],
          RX5: ["rx5", "mg rx5"],
        },
      },
      Mahindra: {
        keywords: ["mahindra", "scorpio", "bolero", "xuv"],
        models: {
          Scorpio: ["scorpio"],
          "XUV500": ["xuv500", "xuv 500"],
          "XUV300": ["xuv300", "xuv 300"],
          Bolero: ["bolero"],
          KUV100: ["kuv100", "kuv"],
          Pickup: ["mahindra pickup", "pickup mahindra"],
        },
      },
      Tata: {
        keywords: ["tata", "xenon", "safari", "tiago", "indica"],
        models: {
          Xenon: ["xenon", "tata xenon"],
          Safari: ["safari", "tata safari"],
          Tiago: ["tiago"],
          Indica: ["indica"],
        },
      },
      Maxus: {
        keywords: ["maxus", "t60", "t70", "euniq"],
        models: {
          T60: ["maxus t60", "t60"],
          T70: ["maxus t70", "t70"],
          D60: ["maxus d60", "d60"],
          G10: ["maxus g10", "g10"],
          Euniq: ["euniq"],
        },
      },
      Dongfeng: {
        keywords: ["dongfeng", "df", "rich", "joyear", "glory"],
        models: {
          Rich: ["rich", "dongfeng rich"],
          Joyear: ["joyear"],
          AX7: ["ax7", "dongfeng ax7"],
          S30: ["s30"],
        },
      },
      Kaiyi: {
        keywords: ["kaiyi", "x3", "x5", "e5"],
        models: {
          X3: ["kaiyi x3", "x3"],
          "X3 Pro": ["x3 pro", "kaiyi x3"],
          E5: ["kaiyi e5", "e5"],
        },
      },
      JMC: {
        keywords: ["jmc", "vigus", "boarding"],
        models: {
          Vigus: ["vigus", "jmc vigus"],
          Boarding: ["boarding", "jmc boarding"],
          N900: ["n900", "jmc n900"],
        },
      },
    };

    var activeVehicleSearch = null;
    var activeCategoryGroup = null;
    var CATEGORY_GROUP_NAMES = [
      "Frenos",
      "Motor",
      "Suspensión",
      "Eléctrico",
      "Carrocería",
      "Transmisión",
    ];
    var CATEGORY_GROUP_GHOST_VALUE = "__grupo__";
    var BRAND_LOGO_QUICK = {
      Haval: { label: "Haval", keywords: ["haval"] },
    };
    var allProducts = [];
    var PLACEHOLDER_IMG = "logo_andes.png";
    var PAGE_SIZE = 12;
    var currentPage = 1;
    var paginationEl = document.getElementById("catalogo-pagination");
    var pageStatusEl = document.getElementById("catalogo-page-status");
    var prevBtn = document.getElementById("catalogo-prev");
    var nextBtn = document.getElementById("catalogo-next");
    var isLocalHost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    function withCacheBust(url) {
      var sep = url.indexOf("?") === -1 ? "?" : "&";
      return url + sep + "v=" + Date.now();
    }

    function absoluteUrl(url) {
      try {
        return new URL(url, window.location.href).href;
      } catch (err) {
        return url;
      }
    }

    function normalizeImagePath(raw) {
      var s = (raw || "").trim();
      if (!s) return "";
      if (/^(https?:)?\/\//i.test(s)) return s;
      if (/^(data:|blob:)/i.test(s)) return s;
      if (s.charAt(0) === "/") return s;
      if (/^images\//i.test(s)) return s;
      if (s.indexOf("/") === -1) return "images/productos/" + s;
      return s;
    }

    function norm(s) {
      return (s || "").toString().toLowerCase();
    }

    function parseParams() {
      var u = new URL(window.location.href);
      return {
        q: u.searchParams.get("q") || "",
        cat: u.searchParams.get("cat") || "",
        grupo: u.searchParams.get("grupo") || "",
        marca: u.searchParams.get("marca") || "",
        modelo: u.searchParams.get("modelo") || "",
        anio: u.searchParams.get("anio") || "",
        vehiculo: u.searchParams.get("vehiculo") || "",
      };
    }

    function isKnownCategoryGroup(name) {
      if (!name) return false;
      var n = norm(name);
      return CATEGORY_GROUP_NAMES.some(function (g) {
        return norm(g) === n;
      });
    }

    function classifyProductCategory(categoria) {
      var c = (categoria || "").trim();
      if (/freno|balat|pastilla|disco de freno|tambor|cilindro de fren|sensor.*abs/i.test(c)) {
        return "Frenos";
      }
      if (
        /amortiguador|suspensi|bandeja|barra estabilizadora|bieleta|bujes de susp|rotula|rótula|rodamiento|maza de rueda|montante|cazoleta|aislador|retenes de rueda|terminal|axial|balancin/i.test(
          c
        )
      ) {
        return "Suspensión";
      }
      if (/embrague|palier|poly v|tensor poly|volante de embrague|eje palier/i.test(c)) {
        return "Transmisión";
      }
      if (/espejo|parachoques|pisadera|máscara|mascara|manilla|pedal/i.test(c)) {
        return "Carrocería";
      }
      if (/faro|foco|sensor|motor de arranque|interruptor/i.test(c)) {
        return "Eléctrico";
      }
      return "Motor";
    }

    function productMatchesCategoryGroup(p, groupName) {
      return classifyProductCategory(p.categoria) === groupName;
    }

    function syncCategorySelectUi() {
      if (!catSelect) return;
      var ghost = catSelect.querySelector('option[data-group-ghost="1"]');
      if (activeCategoryGroup) {
        if (!ghost) {
          ghost = document.createElement("option");
          ghost.setAttribute("data-group-ghost", "1");
          catSelect.insertBefore(ghost, catSelect.options[1] || null);
        }
        ghost.value = CATEGORY_GROUP_GHOST_VALUE;
        ghost.textContent = "Grupo: " + activeCategoryGroup;
        catSelect.value = CATEGORY_GROUP_GHOST_VALUE;
      } else if (ghost) {
        ghost.remove();
        if (catSelect.value === CATEGORY_GROUP_GHOST_VALUE) {
          catSelect.value = "";
        }
      }
    }

    function syncCategoryUrl() {
      if (!window.history || !window.history.replaceState) return;
      var u = new URL(window.location.href);
      u.searchParams.delete("grupo");
      u.searchParams.delete("cat");
      if (activeCategoryGroup) {
        u.searchParams.set("grupo", activeCategoryGroup);
      } else if (catSelect && catSelect.value && catSelect.value !== CATEGORY_GROUP_GHOST_VALUE) {
        u.searchParams.set("cat", catSelect.value);
      }
      window.history.replaceState({}, "", u.pathname + u.search + u.hash);
    }

    function updateCategoryBannerUi(totalItems) {
      if (!categoryBanner || !categoryBannerMsg) return;
      if (activeCategoryGroup) {
        categoryBanner.hidden = false;
        categoryBannerMsg.textContent =
          totalItems +
          " producto" +
          (totalItems !== 1 ? "s" : "") +
          " en " +
          activeCategoryGroup;
      } else {
        categoryBanner.hidden = true;
        categoryBannerMsg.textContent = "";
      }
    }

    function applyCategoryGroup(groupName) {
      if (!isKnownCategoryGroup(groupName)) return;
      activeCategoryGroup = groupName;
      if (catSelect) catSelect.value = "";
      syncCategorySelectUi();
      syncCategoryUrl();
      render(allProducts, { resetPage: true });
      scrollToCatalogTop();
    }

    function clearCategoryFilter() {
      activeCategoryGroup = null;
      if (catSelect) catSelect.value = "";
      syncCategorySelectUi();
      syncCategoryUrl();
      render(allProducts, { resetPage: true });
    }

    function applyCategoryParamsFromUrl(params) {
      if (!params) return false;
      if (params.grupo && isKnownCategoryGroup(params.grupo)) {
        activeCategoryGroup = params.grupo;
        syncCategorySelectUi();
        return true;
      }
      if (params.cat && isKnownCategoryGroup(params.cat)) {
        activeCategoryGroup = params.cat;
        syncCategorySelectUi();
        return true;
      }
      if (params.cat && catSelect) {
        var wanted = params.cat;
        var found = Array.prototype.slice.call(catSelect.options).find(function (o) {
          return norm(o.value) === norm(wanted);
        });
        if (found) {
          activeCategoryGroup = null;
          catSelect.value = found.value;
          syncCategorySelectUi();
          return true;
        }
      }
      return false;
    }

    function dedupeKeywords(list) {
      var seen = {};
      var out = [];
      list.forEach(function (kw) {
        var k = norm(kw).trim();
        if (!k || seen[k]) return;
        seen[k] = true;
        out.push(k);
      });
      return out;
    }

    function tokenizeSearchText(text) {
      return (text || "")
        .toLowerCase()
        .split(/[\s,;/]+/)
        .map(function (t) {
          return t.trim();
        })
        .filter(Boolean);
    }

    function populateVehicleYears() {
      if (!vehicleYearSelect) return;
      for (var y = 2026; y >= 2010; y -= 1) {
        var opt = document.createElement("option");
        opt.value = String(y);
        opt.textContent = String(y);
        vehicleYearSelect.appendChild(opt);
      }
    }

    function populateVehicleBrandOptions() {
      if (!vehicleBrandSelect) return;
      Object.keys(VEHICLE_BRANDS)
        .sort(function (a, b) {
          return a.localeCompare(b, "es");
        })
        .forEach(function (brand) {
          var opt = document.createElement("option");
          opt.value = brand;
          opt.textContent = brand;
          vehicleBrandSelect.appendChild(opt);
        });
    }

    function populateVehicleModels(brand) {
      if (!vehicleModelSelect) return;
      vehicleModelSelect.innerHTML = "";
      var defaultOpt = document.createElement("option");
      defaultOpt.value = "";
      defaultOpt.textContent = brand ? "Selecciona modelo" : "Primero elige marca";
      vehicleModelSelect.appendChild(defaultOpt);
      vehicleModelSelect.disabled = !brand;
      if (!brand || !VEHICLE_BRANDS[brand]) return;
      Object.keys(VEHICLE_BRANDS[brand].models)
        .sort(function (a, b) {
          return a.localeCompare(b, "es");
        })
        .forEach(function (modelName) {
          var opt = document.createElement("option");
          opt.value = modelName;
          opt.textContent = modelName;
          vehicleModelSelect.appendChild(opt);
        });
    }

    function buildVehicleFilterFromForm() {
      var brand = vehicleBrandSelect ? vehicleBrandSelect.value : "";
      var model = vehicleModelSelect ? vehicleModelSelect.value : "";
      var year = vehicleYearSelect ? vehicleYearSelect.value : "";
      var freeText = vehicleTextInput ? (vehicleTextInput.value || "").trim() : "";
      var keywords = [];
      var labelParts = [];

      if (brand && VEHICLE_BRANDS[brand]) {
        keywords = keywords.concat(VEHICLE_BRANDS[brand].keywords);
        labelParts.push(brand);
      }
      if (brand && model && VEHICLE_BRANDS[brand] && VEHICLE_BRANDS[brand].models[model]) {
        keywords = keywords.concat(VEHICLE_BRANDS[brand].models[model]);
        labelParts.push(model);
      } else if (model) {
        keywords = keywords.concat(tokenizeSearchText(model));
        labelParts.push(model);
      }
      if (freeText) {
        keywords = keywords.concat(tokenizeSearchText(freeText));
        if (!labelParts.length) labelParts.push(freeText);
      }
      if (year) {
        labelParts.push(year);
        keywords.push(year);
      }

      keywords = dedupeKeywords(
        keywords.filter(function (kw) {
          return kw.length >= 2;
        })
      );
      if (!keywords.length) return null;

      return {
        label: labelParts.join(" ") || freeText || brand,
        keywords: keywords,
        year: year || "",
      };
    }

    function matchesVehicleTitle(p, keywords) {
      if (!keywords || !keywords.length) return true;
      var title = norm(p.titulo || "");
      return keywords.some(function (kw) {
        return title.indexOf(kw) !== -1;
      });
    }

    function updateVehicleResultUi(totalItems) {
      var filter = activeVehicleSearch;
      if (!filter) {
        if (vehicleResultEl) vehicleResultEl.hidden = true;
        if (vehicleNoResultEl) vehicleNoResultEl.hidden = true;
        return;
      }
      if (totalItems > 0) {
        if (vehicleResultEl) {
          vehicleResultEl.hidden = false;
          if (vehicleResultMsg) {
            vehicleResultMsg.textContent =
              totalItems +
              " repuesto" +
              (totalItems !== 1 ? "s" : "") +
              " encontrados para " +
              filter.label;
          }
        }
        if (vehicleNoResultEl) vehicleNoResultEl.hidden = true;
      } else {
        if (vehicleResultEl) vehicleResultEl.hidden = true;
        if (vehicleNoResultEl) {
          vehicleNoResultEl.hidden = false;
          if (vehicleWaLink) {
            var waText =
              "Hola, busco repuestos para " +
              filter.label +
              ". ¿Me pueden ayudar a encontrar la pieza correcta?";
            vehicleWaLink.href =
              "https://wa.me/56926152826?text=" + encodeURIComponent(waText);
          }
        }
      }
    }

    function syncVehicleUrl() {
      if (!window.history || !window.history.replaceState) return;
      var u = new URL(window.location.href);
      u.searchParams.delete("marca");
      u.searchParams.delete("modelo");
      u.searchParams.delete("anio");
      u.searchParams.delete("vehiculo");
      if (activeVehicleSearch && vehicleBrandSelect && vehicleBrandSelect.value) {
        u.searchParams.set("marca", vehicleBrandSelect.value);
      }
      if (activeVehicleSearch && vehicleModelSelect && vehicleModelSelect.value) {
        u.searchParams.set("modelo", vehicleModelSelect.value);
      }
      if (activeVehicleSearch && vehicleYearSelect && vehicleYearSelect.value) {
        u.searchParams.set("anio", vehicleYearSelect.value);
      }
      if (activeVehicleSearch && vehicleTextInput && vehicleTextInput.value.trim()) {
        u.searchParams.set("vehiculo", vehicleTextInput.value.trim());
      }
      window.history.replaceState({}, "", u.pathname + u.search + u.hash);
    }

    function clearVehicleSearch(scroll) {
      activeVehicleSearch = null;
      if (vehicleTextInput) vehicleTextInput.value = "";
      if (vehicleBrandSelect) vehicleBrandSelect.value = "";
      populateVehicleModels("");
      if (vehicleYearSelect) vehicleYearSelect.value = "";
      if (searchInput) searchInput.value = "";
      activeCategoryGroup = null;
      if (catSelect) catSelect.value = "";
      syncCategorySelectUi();
      syncVehicleUrl();
      syncCategoryUrl();
      render(allProducts, { resetPage: true });
      if (scroll) scrollToCatalogTop();
    }

    function runVehicleSearch() {
      var filter = buildVehicleFilterFromForm();
      if (!filter) {
        if (vehicleTextInput) vehicleTextInput.focus();
        return;
      }
      activeVehicleSearch = filter;
      syncVehicleUrl();
      render(allProducts, { resetPage: true });
      scrollToCatalogTop();
    }

    function applyBrandLogoFilter(brandKey) {
      if (!brandKey) return;
      if (vehicleTextInput) vehicleTextInput.value = "";
      if (vehicleModelSelect) vehicleModelSelect.value = "";
      if (vehicleYearSelect) vehicleYearSelect.value = "";
      if (searchInput) searchInput.value = "";
      if (catSelect) catSelect.value = "";

      if (VEHICLE_BRANDS[brandKey]) {
        if (vehicleBrandSelect) vehicleBrandSelect.value = brandKey;
        populateVehicleModels(brandKey);
        activeVehicleSearch = buildVehicleFilterFromForm();
      } else if (BRAND_LOGO_QUICK[brandKey]) {
        if (vehicleBrandSelect) vehicleBrandSelect.value = "";
        populateVehicleModels("");
        var quick = BRAND_LOGO_QUICK[brandKey];
        activeVehicleSearch = {
          label: quick.label,
          keywords: dedupeKeywords(quick.keywords),
          year: "",
        };
      } else {
        return;
      }

      syncVehicleUrl();
      render(allProducts, { resetPage: true });
      scrollToCatalogTop();
    }

    function initBrandLogoGrid() {
      var carousel = document.getElementById("brand-carousel");
      if (!carousel) return;

      carousel.querySelectorAll(".brand-logo-card__img").forEach(function (img) {
        img.addEventListener("error", function () {
          var card = img.closest(".brand-logo-card");
          if (card) card.classList.add("brand-logo-card--no-img");
        });
      });

      carousel.addEventListener("click", function (e) {
        var card = e.target.closest("[data-brand]");
        if (!card) return;
        applyBrandLogoFilter(card.getAttribute("data-brand"));
      });
    }

    function initVehicleSearchUi() {
      populateVehicleBrandOptions();
      populateVehicleYears();
      populateVehicleModels("");

      if (vehicleBrandSelect) {
        vehicleBrandSelect.addEventListener("change", function () {
          populateVehicleModels(vehicleBrandSelect.value);
        });
      }
      if (vehicleForm) {
        vehicleForm.addEventListener("submit", function (e) {
          e.preventDefault();
          runVehicleSearch();
        });
      }
      if (vehicleClearBtn) {
        vehicleClearBtn.addEventListener("click", function () {
          clearVehicleSearch(true);
        });
      }
    }

    initVehicleSearchUi();
    initBrandLogoGrid();

    function applyVehicleParamsFromUrl(params) {
      if (!params) return false;
      if (params.vehiculo && vehicleTextInput) {
        vehicleTextInput.value = params.vehiculo;
      }
      if (params.marca && vehicleBrandSelect) {
        vehicleBrandSelect.value = params.marca;
        populateVehicleModels(params.marca);
      }
      if (params.modelo && vehicleModelSelect) {
        vehicleModelSelect.value = params.modelo;
      }
      if (params.anio && vehicleYearSelect) {
        vehicleYearSelect.value = params.anio;
      }
      if (params.marca || params.modelo || params.vehiculo) {
        activeVehicleSearch = buildVehicleFilterFromForm();
        return Boolean(activeVehicleSearch);
      }
      return false;
    }

    function fillCategories(products) {
      if (!catSelect) return;
      while (catSelect.options.length > 1) {
        catSelect.remove(1);
      }
      var seen = {};
      var list = [];
      products.forEach(function (p) {
        var c = (p.categoria || "").trim();
        if (!c || seen[c]) return;
        seen[c] = true;
        list.push(c);
      });
      list.sort(function (a, b) {
        return a.localeCompare(b, "es");
      });
      list.forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        catSelect.appendChild(opt);
      });
    }

    function productSku(p) {
      return (p.sku || p.codigo || "").trim();
    }

    function codigoSku(p) {
      return productSku(p);
    }

    function productMlId(p) {
      return String(p.id || "").trim();
    }

    function isMlCategoryId(label) {
      return /^MLC\d+$/i.test(String(label || "").trim());
    }

    function productLink(p) {
      var url = (p.link || p.url || "").trim();
      if (!url) return "";
      if (!/^https?:\/\//i.test(url)) {
        return "https://" + url.replace(/^\/+/, "");
      }
      return url;
    }

    function resetCatalogView() {
      currentPage = 1;
    }

    function scrollToCatalogTop() {
      var section = document.getElementById("productos");
      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    function getFilteredProducts(products) {
      var list = products;
      if (activeVehicleSearch && activeVehicleSearch.keywords.length) {
        list = list.filter(function (p) {
          return matchesVehicleTitle(p, activeVehicleSearch.keywords);
        });
      }
      var q = (searchInput && searchInput.value) || "";
      var cat = (catSelect && catSelect.value) || "";
      return list.filter(function (p) {
        return matches(p, q, cat);
      });
    }

    function getTotalPages(totalItems) {
      return Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    }

    function updatePaginationUi(totalItems) {
      var totalPages = getTotalPages(totalItems);
      var hasMore = currentPage < totalPages;

      if (paginationEl) {
        paginationEl.hidden = totalItems <= PAGE_SIZE;
      }
      if (pageStatusEl) {
        pageStatusEl.textContent = "Página " + currentPage + " de " + totalPages;
      }
      if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
      }
      if (nextBtn) {
        nextBtn.disabled = !hasMore;
      }
    }

    function goToPrevPage(totalItems, scroll) {
      if (currentPage <= 1) return;
      currentPage -= 1;
      if (scroll) scrollToCatalogTop();
    }

    function goToNextPage(totalItems, scroll) {
      var totalPages = getTotalPages(totalItems);
      if (currentPage >= totalPages) return;
      currentPage += 1;
      if (scroll) scrollToCatalogTop();
    }

    function formatPrecio(p) {
      if (p.precio != null && p.precio !== "") {
        var n = Number(p.precio);
        if (!isNaN(n)) {
          var moneda = (p.moneda || "CLP").toUpperCase();
          try {
            return new Intl.NumberFormat("es-CL", {
              style: "currency",
              currency: moneda,
              maximumFractionDigits: 0,
            }).format(n);
          } catch (err) {
            return "$ " + n.toLocaleString("es-CL");
          }
        }
      }
      var valor = p.valor != null ? String(p.valor) : "";
      valor = valor.trim();
      if (!valor) return "";
      return valor.indexOf("$") !== -1 || valor.indexOf("CLP") !== -1
        ? valor
        : "$ " + valor;
    }

    function primeraImagen(p) {
      if (Array.isArray(p.imagenes) && p.imagenes.length) {
        var u = p.imagenes[0];
        if (typeof u === "string" && u.trim()) return normalizeImagePath(u);
      }
      return normalizeImagePath(p.imagen || "");
    }

    function matches(p, q, cat) {
      if (activeCategoryGroup) {
        if (!productMatchesCategoryGroup(p, activeCategoryGroup)) return false;
      } else if (cat && norm(p.categoria) !== norm(cat)) {
        return false;
      }
      if (!q) return true;
      var nq = norm(q);
      if (norm(p.titulo).indexOf(nq) !== -1) return true;
      var sku = productSku(p);
      if (sku && norm(sku).indexOf(nq) !== -1) return true;
      var blob =
        norm(p.descripcion) +
        " " +
        norm(p.categoria) +
        " " +
        norm(p.subcategoria) +
        " " +
        norm(p.marca) +
        " " +
        norm(p.origen) +
        " " +
        norm(p.valor) +
        " " +
        norm(formatPrecio(p));
      return blob.indexOf(nq) !== -1;
    }

    function renderProductCard(p, idx) {
        var titulo = (p.titulo || "Sin título").trim();
        var desc = (p.descripcion || "").trim();
        var img = primeraImagen(p) || PLACEHOLDER_IMG;
        var url = productLink(p);
        var code = codigoSku(p);
        var mlId = productMlId(p);
        var precioFmt = formatPrecio(p);
        var marca = (p.marca || "").trim();
        var subcat = (p.subcategoria || "").trim();
        var catLabel = (p.categoria || "").trim();
        var origen = (p.origen || "").trim();
        var stock =
          p.stock != null && p.stock !== "" ? Number(p.stock) : null;
        var esMl = Boolean(url && /mercadolibre\./i.test(url));

        var article = document.createElement("article");
        article.className =
          "card card--photo producto-card" + (esMl ? " card--catalog-ml" : "");

        var headingId = "catalogo-prod-" + idx;

        var wrap = document.createElement("div");
        wrap.className = "card-image-wrap producto-imagen-wrapper";
        var image = document.createElement("img");
        var isRemoteImg = /^https?:\/\//i.test(img);
        var srcPrimary = isRemoteImg ? img : absoluteUrl(withCacheBust(img));
        var srcPlain = isRemoteImg ? img : absoluteUrl(img);
        var srcFallback = absoluteUrl(PLACEHOLDER_IMG);
        image.src = srcPrimary;
        image.addEventListener("error", function () {
          if (!image.dataset.retryPlain) {
            image.dataset.retryPlain = "1";
            image.src = srcPlain;
            return;
          }
          if (!image.dataset.retryFallback) {
            image.dataset.retryFallback = "1";
            image.src = srcFallback;
          }
        });
        image.alt = titulo;
        image.width = 800;
        image.height = 480;
        image.loading = idx < 6 ? "eager" : "lazy";
        image.decoding = "async";
        if (url && esMl) {
          var imgLink = document.createElement("a");
          imgLink.className = "card-image-link";
          imgLink.href = url;
          imgLink.target = "_blank";
          imgLink.rel = "noopener noreferrer";
          imgLink.setAttribute("aria-label", "Ver en Mercado Libre: " + titulo);
          imgLink.appendChild(image);
          wrap.appendChild(imgLink);
        } else {
          wrap.appendChild(image);
        }

        var body = document.createElement("div");
        body.className = "card-body producto-info";

        var row = document.createElement("div");
        row.className = "card-title-row";
        var h3 = document.createElement("h3");
        h3.id = headingId;
        h3.className = "producto-titulo";
        h3.textContent = titulo;
        row.appendChild(h3);
        if (code) {
          var badge = document.createElement("span");
          badge.className = "badge-count";
          badge.textContent = code;
          row.appendChild(badge);
        } else if (esMl && mlId) {
          var badgeId = document.createElement("span");
          badgeId.className = "badge-count badge-count--muted";
          badgeId.textContent = mlId;
          row.appendChild(badgeId);
        } else if (marca) {
          var badgeM = document.createElement("span");
          badgeM.className = "badge-count badge-count--muted";
          badgeM.textContent = marca;
          row.appendChild(badgeM);
        } else if (catLabel && !isMlCategoryId(catLabel)) {
          var badgeCat = document.createElement("span");
          badgeCat.className = "badge-count badge-count--muted";
          badgeCat.textContent = catLabel;
          row.appendChild(badgeCat);
        }

        var metaParts = [];
        if (catLabel && !isMlCategoryId(catLabel)) metaParts.push(catLabel);
        if (subcat) metaParts.push(subcat);
        if (marca && !code) metaParts.push(marca);

        var pDesc = document.createElement("p");
        pDesc.className = "card-desc";
        if (desc) {
          pDesc.textContent = desc;
        } else if (stock != null && !isNaN(stock)) {
          if (esMl) {
            pDesc.innerHTML =
              stock > 0
                ? '<span style="color:#22c55e">●</span> En stock (' +
                  stock +
                  " und.)"
                : '<span style="color:#ef4444">●</span> Sin stock';
          } else {
            pDesc.textContent =
              stock > 0
                ? "Disponible · stock: " + stock
                : "Consultar disponibilidad";
          }
        } else {
          pDesc.textContent = "Consulta disponibilidad y compatibilidad.";
        }

        body.appendChild(row);
        if (precioFmt) {
          var price = document.createElement("p");
          price.className = "card-price";
          price.textContent = precioFmt;
          body.appendChild(price);
        }
        if (metaParts.length) {
          var metaLine = document.createElement("p");
          metaLine.className = "card-ml-meta";
          metaLine.textContent = metaParts.join(" · ");
          body.appendChild(metaLine);
        }
        if (origen) {
          var orig = document.createElement("p");
          orig.className = "card-origen";
          orig.textContent = "Origen: " + origen;
          body.appendChild(orig);
        }
        body.appendChild(pDesc);

        if (url && !esMl) {
          var extBtn = document.createElement("a");
          extBtn.className = "card-cta";
          extBtn.href = url;
          extBtn.target = "_blank";
          extBtn.rel = "noopener noreferrer";
          extBtn.innerHTML = "Ver producto <span aria-hidden=\"true\">→</span>";
          body.appendChild(extBtn);
        } else if (!url) {
          var cta = document.createElement("a");
          cta.className = "card-cta";
          cta.href = "#contacto";
          cta.innerHTML = "Cotizar <span aria-hidden=\"true\">→</span>";
          body.appendChild(cta);
        }

        if (!esMl && url) {
          var link = document.createElement("a");
          link.className = "card-link";
          link.setAttribute("aria-labelledby", headingId);
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          article.appendChild(link);
        }

        article.appendChild(wrap);
        article.appendChild(body);

        if (url && esMl) {
          var mlBtn = document.createElement("a");
          mlBtn.className = "btn btn-ml btn-sm card-ml-btn";
          mlBtn.href = url;
          mlBtn.target = "_blank";
          mlBtn.rel = "noopener noreferrer";
          mlBtn.setAttribute("aria-label", "Ver en Mercado Libre: " + titulo);
          mlBtn.textContent = "Ver en Mercado Libre";
          article.appendChild(mlBtn);
        }

        return article;
    }

    function render(products, options) {
      options = options || {};
      grid.innerHTML = "";
      var filtered = getFilteredProducts(products);
      var totalItems = filtered.length;

      if (options.resetPage) {
        resetCatalogView();
      }
      var totalPages = getTotalPages(totalItems);
      if (currentPage > totalPages) {
        currentPage = totalPages;
      }
      if (currentPage < 1) {
        currentPage = 1;
      }

      var start = (currentPage - 1) * PAGE_SIZE;
      var visible = filtered.slice(start, start + PAGE_SIZE);

      updateVehicleResultUi(totalItems);
      updateCategoryBannerUi(totalItems);

      if (meta) {
        if (activeVehicleSearch && totalItems === 0) {
          meta.textContent = "";
          meta.hidden = true;
        } else if (activeCategoryGroup) {
          meta.hidden = true;
          meta.textContent = "";
        } else {
          meta.hidden = false;
        }
        if (totalItems === 0 && !activeVehicleSearch && !activeCategoryGroup) {
          meta.textContent = "Sin productos en el catálogo";
        } else if (totalItems === 0 && activeVehicleSearch) {
          meta.textContent = "";
        } else if (activeCategoryGroup) {
          meta.textContent = "";
        } else if (totalItems > PAGE_SIZE) {
          meta.textContent =
            "Mostrando " +
            (start + 1) +
            "–" +
            (start + visible.length) +
            " de " +
            totalItems;
        } else {
          meta.textContent =
            "Mostrando " + visible.length + " producto" + (visible.length !== 1 ? "s" : "");
        }
      }

      if (emptyEl) {
        emptyEl.hidden = totalItems > 0 || Boolean(activeVehicleSearch);
      }

      visible.forEach(function (p, idx) {
        grid.appendChild(renderProductCard(p, idx));
      });

      updatePaginationUi(totalItems);
    }

    fetch(withCacheBust("data/productos.json"), {
      // Prevent stale CDN/browser cache from showing outdated product lists.
      cache: "no-store",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("No se pudo cargar el catálogo.");
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) throw new Error("Formato inválido.");
        allProducts = data;
        updateDynamicProductCounts(allProducts.length);
        fillCategories(allProducts);
        var params = parseParams();
        var hasVehicleSearch = applyVehicleParamsFromUrl(params);
        var hasCategoryFilter = applyCategoryParamsFromUrl(params);
        if (searchInput) {
          // Avoid stale browser-restored filters hiding products on first load.
          searchInput.value = params.q || "";
        }
        render(allProducts, { resetPage: true });
        var heroQ = document.getElementById("q");
        if (heroQ && params.q) heroQ.value = params.q;
        var prodSection = document.getElementById("productos");
        if (
          prodSection &&
          (params.q ||
            params.grupo ||
            params.cat ||
            hasVehicleSearch ||
            hasCategoryFilter ||
            window.location.hash === "#productos")
        ) {
          prodSection.scrollIntoView({ behavior: "smooth" });
        }
        if (searchInput) {
          searchInput.addEventListener("input", function () {
            render(allProducts, { resetPage: true });
          });
        }
        if (catSelect) {
          catSelect.addEventListener("change", function () {
            if (catSelect.value === CATEGORY_GROUP_GHOST_VALUE) return;
            activeCategoryGroup = null;
            syncCategorySelectUi();
            syncCategoryUrl();
            render(allProducts, { resetPage: true });
          });
        }
        if (categoryClearBtn) {
          categoryClearBtn.addEventListener("click", function () {
            clearCategoryFilter();
            scrollToCatalogTop();
          });
        }
        if (prevBtn) {
          prevBtn.addEventListener("click", function () {
            var total = getFilteredProducts(allProducts).length;
            goToPrevPage(total, true);
            render(allProducts);
          });
        }
        if (nextBtn) {
          nextBtn.addEventListener("click", function () {
            var total = getFilteredProducts(allProducts).length;
            goToNextPage(total, true);
            render(allProducts);
          });
        }
      })
      .catch(function (e) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent =
            e.message ||
            "Error al cargar productos. Revisa data/productos.json y vuelve a intentar.";
        }
        if (emptyEl) emptyEl.hidden = true;
      });
  })();

  function animateCounters() {
    var counters = document.querySelectorAll(".stat-number");
    counters.forEach(function (counter) {
      var target = parseInt(counter.dataset.target, 10);
      var duration = 2000;
      var step = target / (duration / 16);
      var current = 0;
      var timer = setInterval(function () {
        current += step;
        if (current >= target) {
          counter.textContent = String(target);
          counter.dataset.animated = "1";
          clearInterval(timer);
        } else {
          counter.textContent = String(Math.floor(current));
        }
      }, 16);
    });
  }

  var statsObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounters();
          statsObserver.disconnect();
        }
      });
    },
    { threshold: 0.5 }
  );

  var statsBanner = document.querySelector(".stats-banner");
  if (statsBanner) statsObserver.observe(statsBanner);

  var whatsappBtn = document.getElementById("whatsappBtn");
  var whatsappBubble = document.getElementById("whatsappBubble");
  var whatsappClose = document.getElementById("whatsappClose");
  var whatsappBadge = document.getElementById("whatsappBadge");
  var whatsappLink = document.getElementById("whatsappLink");
  var waNumber =
    typeof window !== "undefined" &&
    window.ANDES_CONTACT &&
    window.ANDES_CONTACT.whatsappNumber
      ? String(window.ANDES_CONTACT.whatsappNumber).replace(/\D/g, "")
      : "56926152826";

  function setWhatsappBubbleOpen(open) {
    if (!whatsappBubble || !whatsappBtn) return;
    whatsappBubble.classList.toggle("open", open);
    whatsappBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  if (whatsappBtn && whatsappBubble) {
    whatsappBtn.addEventListener("click", function () {
      var willOpen = !whatsappBubble.classList.contains("open");
      setWhatsappBubbleOpen(willOpen);
      if (whatsappBadge) whatsappBadge.style.display = "none";
    });
  }

  if (whatsappClose) {
    whatsappClose.addEventListener("click", function (e) {
      e.stopPropagation();
      setWhatsappBubbleOpen(false);
    });
  }

  function updateWhatsappMessage() {
    var searchInput =
      document.getElementById("busqueda") ||
      document.getElementById("catalogo-search") ||
      document.getElementById("q") ||
      document.querySelector('input[type="search"], input[placeholder*="Buscar"]');
    var searchValue = searchInput && searchInput.value ? searchInput.value.trim() : "";

    var mensaje = "Hola, necesito un repuesto para mi auto.";
    if (searchValue.length > 2) {
      mensaje =
        "Hola, busco repuestos de: " +
        searchValue +
        ". ¿Tienen disponibilidad?";
    }

    if (whatsappLink) {
      whatsappLink.href =
        "https://wa.me/" + waNumber + "?text=" + encodeURIComponent(mensaje);
    }
  }

  document.addEventListener("input", updateWhatsappMessage);
  updateWhatsappMessage();

  setTimeout(function () {
    if (whatsappBubble && !whatsappBubble.classList.contains("open")) {
      setWhatsappBubbleOpen(true);
      if (whatsappBadge) whatsappBadge.style.display = "none";
    }
  }, 8000);
})();
