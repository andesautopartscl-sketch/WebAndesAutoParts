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
        var mensaje = String(fd.get("mensaje") || "").trim();
        var body =
          "Nombre: " +
          nombre +
          "\nEmail: " +
          email +
          "\nTeléfono: " +
          telefono +
          "\n\nMensaje:\n" +
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

  (function initContactFormProduction() {
    var form = document.getElementById("contact-form-home");
    if (!form) return;
    var host = (window.location.hostname || "").toLowerCase();
    var isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "::1";
    if (isLocal) return;

    form.addEventListener(
      "submit",
      function (e) {
        e.preventDefault();
        var fd = new FormData(form);
        var nombre = String(fd.get("nombre") || "").trim();
        var email = String(fd.get("email") || "").trim();
        var telefono = String(fd.get("telefono") || "").trim();
        var mensaje = String(fd.get("mensaje") || "").trim();
        var submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        var cfg =
          typeof window !== "undefined" && window.ANDES_CONTACT
            ? window.ANDES_CONTACT
            : {};
        var key = (cfg.web3formsAccessKey || "").trim();
        var wa = String(cfg.whatsappNumber || "56926152826").replace(/\D/g, "");

        function buildWhatsAppText() {
          return (
            "Hola Andes Auto Parts,\n\n" +
            "Nombre: " +
            nombre +
            "\nEmail: " +
            email +
            "\nTeléfono: " +
            telefono +
            "\n\nMensaje:\n" +
            mensaje
          );
        }

        function whatsAppUrl() {
          return (
            "https://wa.me/" +
            wa +
            "?text=" +
            encodeURIComponent(buildWhatsAppText())
          );
        }

        function openWhatsAppNewTab() {
          window.open(whatsAppUrl(), "_blank", "noopener,noreferrer");
        }

        function openWhatsAppThenGracias() {
          var w = window.open(whatsAppUrl(), "_blank", "noopener,noreferrer");
          if (!w) {
            window.location.href = url;
          } else {
            window.location.href = graciasPageUrl();
          }
        }

        if (key) {
          var waPopup = window.open("about:blank", "_blank", "noopener,noreferrer");
          fetch("https://api.web3forms.com/submit", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              access_key: key,
              subject: "Mensaje web — Andes Auto Parts",
              name: nombre,
              email: email,
              message:
                "Teléfono: " + telefono + "\n\n" + mensaje,
            }),
          })
            .then(function (res) {
              return res.json().then(
                function (data) {
                  if (!res.ok || !data || data.success !== true) {
                    throw new Error("fail");
                  }
                },
                function () {
                  throw new Error("fail");
                }
              );
            })
            .then(function () {
              var url = whatsAppUrl();
              if (waPopup && !waPopup.closed) {
                try {
                  waPopup.location.href = url;
                } catch (err) {
                  openWhatsAppNewTab();
                }
              } else {
                openWhatsAppNewTab();
              }
              window.location.href = graciasPageUrl();
            })
            .catch(function () {
              if (waPopup && !waPopup.closed) {
                try {
                  waPopup.close();
                } catch (err) {}
              }
              openWhatsAppThenGracias();
            })
            .finally(function () {
              if (submitBtn) submitBtn.disabled = false;
            });
        } else {
          try {
            openWhatsAppThenGracias();
          } finally {
            if (submitBtn) submitBtn.disabled = false;
          }
        }
      },
      true
    );
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
    var meta = document.getElementById("catalogo-meta");
    var emptyEl = document.getElementById("catalogo-empty");
    var errEl = document.getElementById("catalogo-error");

    var allProducts = [];
    var PLACEHOLDER_IMG = "logo_andes.png";
    var isLocalHost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    function withCacheBust(url) {
      if (!isLocalHost) return url;
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
      };
    }

    function fillCategories(products) {
      var seen = {};
      var list = [];
      products.forEach(function (p) {
        var c = (p.categoria || "Sin categoría").trim();
        if (!seen[c]) {
          seen[c] = true;
          list.push(c);
        }
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

    function codigoSku(p) {
      return (p.codigo || p.sku || "").trim();
    }

    function primeraImagen(p) {
      if (Array.isArray(p.imagenes) && p.imagenes.length) {
        var u = p.imagenes[0];
        if (typeof u === "string" && u.trim()) return normalizeImagePath(u);
      }
      return normalizeImagePath(p.imagen || "");
    }

    function matches(p, q, cat) {
      if (cat && norm(p.categoria) !== norm(cat)) return false;
      if (!q) return true;
      var blob =
        norm(p.titulo) +
        " " +
        norm(p.descripcion) +
        " " +
        norm(codigoSku(p)) +
        " " +
        norm(p.categoria) +
        " " +
        norm(p.subcategoria) +
        " " +
        norm(p.marca) +
        " " +
        norm(p.origen) +
        " " +
        norm(p.valor);
      return blob.indexOf(norm(q)) !== -1;
    }

    function render(products) {
      grid.innerHTML = "";
      var q = (searchInput && searchInput.value) || "";
      var cat = (catSelect && catSelect.value) || "";
      var filtered = products.filter(function (p) {
        return matches(p, q, cat);
      });

      if (meta) {
        meta.textContent =
          filtered.length === products.length
            ? products.length + " producto" + (products.length !== 1 ? "s" : "")
            : "Mostrando " +
              filtered.length +
              " de " +
              products.length +
              " producto" +
              (products.length !== 1 ? "s" : "");
      }

      if (emptyEl) {
        emptyEl.hidden = filtered.length > 0;
      }

      filtered.forEach(function (p, idx) {
        var titulo = (p.titulo || "Sin título").trim();
        var desc = (p.descripcion || "").trim();
        var img = primeraImagen(p) || PLACEHOLDER_IMG;
        var url = (p.url || "").trim();
        var code = codigoSku(p);
        var marca = (p.marca || "").trim();
        var subcat = (p.subcategoria || "").trim();
        var catLabel = (p.categoria || "").trim();
        var origen = (p.origen || "").trim();
        var valor = (p.valor != null ? String(p.valor) : "").trim();

        var article = document.createElement("article");
        article.className = "card card--photo";

        var headingId = "catalogo-prod-" + idx;

        var link = document.createElement("a");
        link.className = "card-link";
        link.setAttribute("aria-labelledby", headingId);
        if (url) {
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        } else {
          link.href = "#contacto";
        }

        var wrap = document.createElement("div");
        wrap.className = "card-image-wrap";
        var image = document.createElement("img");
        var srcPrimary = absoluteUrl(withCacheBust(img));
        var srcPlain = absoluteUrl(img);
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
        image.alt = "";
        image.width = 800;
        image.height = 480;
        image.loading = "lazy";
        image.decoding = "async";
        wrap.appendChild(image);

        var body = document.createElement("div");
        body.className = "card-body";

        var row = document.createElement("div");
        row.className = "card-title-row";
        var h3 = document.createElement("h3");
        h3.id = headingId;
        h3.textContent = titulo;
        row.appendChild(h3);
        if (code) {
          var badge = document.createElement("span");
          badge.className = "badge-count";
          badge.textContent = code;
          row.appendChild(badge);
        } else if (marca) {
          var badgeM = document.createElement("span");
          badgeM.className = "badge-count badge-count--muted";
          badgeM.textContent = marca;
          row.appendChild(badgeM);
        } else if (catLabel) {
          var badgeCat = document.createElement("span");
          badgeCat.className = "badge-count badge-count--muted";
          badgeCat.textContent = catLabel;
          row.appendChild(badgeCat);
        }

        var metaParts = [];
        if (catLabel) metaParts.push(catLabel);
        if (subcat) metaParts.push(subcat);
        if (marca && !code) metaParts.push(marca);

        var pDesc = document.createElement("p");
        pDesc.className = "card-desc";
        pDesc.textContent = desc || "Consulta disponibilidad y compatibilidad.";

        var cta = document.createElement("span");
        cta.className = "card-cta";
        cta.innerHTML = url ? "Ver en Mercado Libre <span aria-hidden=\"true\">→</span>" : "Cotizar <span aria-hidden=\"true\">→</span>";

        body.appendChild(row);
        if (valor) {
          var price = document.createElement("p");
          price.className = "card-price";
          price.textContent = valor.indexOf("$") !== -1 || valor.indexOf("CLP") !== -1 ? valor : "$ " + valor;
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
        body.appendChild(cta);

        article.appendChild(link);
        article.appendChild(wrap);
        article.appendChild(body);
        grid.appendChild(article);
      });
    }

    fetch(withCacheBust("data/productos.json"), {
      cache: isLocalHost ? "no-store" : "default",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("No se pudo cargar el catálogo.");
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) throw new Error("Formato inválido.");
        allProducts = data;
        fillCategories(allProducts);
        var params = parseParams();
        if (searchInput && params.q) searchInput.value = params.q;
        if (catSelect && params.cat) {
          var wanted = params.cat;
          var found = Array.prototype.slice.call(catSelect.options).find(function (o) {
            return norm(o.value) === norm(wanted);
          });
          if (found) catSelect.value = found.value;
        }
        render(allProducts);
        var heroQ = document.getElementById("q");
        if (heroQ && params.q) heroQ.value = params.q;
        var prodSection = document.getElementById("productos");
        if (
          prodSection &&
          (params.q || params.cat || window.location.hash === "#productos")
        ) {
          prodSection.scrollIntoView({ behavior: "smooth" });
        }
        if (searchInput) {
          searchInput.addEventListener("input", function () {
            render(allProducts);
          });
        }
        if (catSelect) {
          catSelect.addEventListener("change", function () {
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
})();
