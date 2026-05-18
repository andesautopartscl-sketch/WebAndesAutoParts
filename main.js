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
        var patente = String(fd.get("patente") || "").trim();
        var chasis = String(fd.get("chasis") || "").trim();
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
          var lines = [
            "Hola Andes Auto Parts,",
            "",
            "Nombre: " + nombre,
            "Correo: " + email,
            "Teléfono: " + (telefono || "—"),
          ];
          if (patente) lines.push("Patente: " + patente);
          if (chasis) lines.push("Chasis: " + chasis);
          lines.push("", "Consulta:", mensaje);
          return lines.join("\n");
        }

        function buildSellerEmailBody() {
          var t = telefono || "(no indicado)";
          var p = patente || "(no indicada)";
          var c = chasis || "(no indicado)";
          var m = mensaje || "(sin texto)";
          return (
            "Nuevo contacto desde la web — Andes Auto Parts\n\n" +
            "DATOS DEL CLIENTE\n" +
            "────────────────\n" +
            "Nombre: " +
            nombre +
            "\nCorreo: " +
            email +
            "\nTeléfono: " +
            t +
            "\nPatente: " +
            p +
            "\nN° de chasis: " +
            c +
            "\n\n" +
            "CONSULTA\n" +
            "────────\n" +
            m +
            "\n\n" +
            "—\n" +
            "Podés responder a este correo para contestar al cliente (según tu cliente de correo)."
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

        function goGraciasConWhatsApp() {
          var u = whatsAppUrl();
          try {
            sessionStorage.setItem("andes_wa_url", u);
            localStorage.setItem("andes_wa_url", u);
          } catch (err) {}
          var base = graciasPageUrl().split("#")[0].split("?")[0];
          var sep = base.indexOf("?") >= 0 ? "&" : "?";
          window.location.href =
            base + sep + "wa=1#u=" + encodeURIComponent(u);
        }

        if (key) {
          fetch("https://api.web3forms.com/submit", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              access_key: key,
              subject: "Nuevo contacto web — Andes Auto Parts",
              from_name: nombre,
              name: nombre,
              email: email,
              phone: telefono,
              patente: patente,
              chasis: chasis,
              message: buildSellerEmailBody(),
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
              goGraciasConWhatsApp();
            })
            .catch(function () {
              goGraciasConWhatsApp();
            })
            .finally(function () {
              if (submitBtn) submitBtn.disabled = false;
            });
        } else {
          try {
            goGraciasConWhatsApp();
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
    var PAGE_SIZE = 12;
    var currentPage = 1;
    var paginationEl = document.getElementById("catalogo-pagination");
    var pageStatusEl = document.getElementById("catalogo-page-status");
    var prevBtn = document.getElementById("catalogo-prev");
    var nextBtn = document.getElementById("catalogo-next");
    var loadMoreWrap = document.getElementById("catalogo-load-more-wrap");
    var loadMoreBtn = document.getElementById("catalogo-load-more");
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
      return (p.codigo || p.sku || p.id || "").trim();
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
      var q = (searchInput && searchInput.value) || "";
      var cat = (catSelect && catSelect.value) || "";
      return products.filter(function (p) {
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
      if (loadMoreWrap) {
        loadMoreWrap.hidden = !hasMore;
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
      if (loadMoreBtn) {
        loadMoreBtn.disabled = !hasMore;
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
      if (cat && norm(p.categoria) !== norm(cat)) return false;
      if (!q) return true;
      var blob =
        norm(p.titulo) +
        " " +
        norm(p.descripcion) +
        " " +
        norm(codigoSku(p)) +
        " " +
        norm(p.id) +
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
      return blob.indexOf(norm(q)) !== -1;
    }

    function renderProductCard(p, idx) {
        var titulo = (p.titulo || "Sin título").trim();
        var desc = (p.descripcion || "").trim();
        var img = primeraImagen(p) || PLACEHOLDER_IMG;
        var url = productLink(p);
        var code = codigoSku(p);
        var precioFmt = formatPrecio(p);
        var marca = (p.marca || "").trim();
        var subcat = (p.subcategoria || "").trim();
        var catLabel = (p.categoria || "").trim();
        var origen = (p.origen || "").trim();
        var stock =
          p.stock != null && p.stock !== "" ? Number(p.stock) : null;
        var esMl = Boolean(url && /mercadolibre\./i.test(url));

        var article = document.createElement("article");
        article.className = "card card--photo" + (esMl ? " card--catalog-ml" : "");

        var headingId = "catalogo-prod-" + idx;

        var wrap = document.createElement("div");
        wrap.className = "card-image-wrap";
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
        if (desc) {
          pDesc.textContent = desc;
        } else if (stock != null && !isNaN(stock)) {
          pDesc.textContent =
            stock > 0
              ? "Disponible en Mercado Libre · stock: " + stock
              : "Consultar disponibilidad en Mercado Libre";
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

        if (url && esMl) {
          var mlBtn = document.createElement("a");
          mlBtn.className = "btn btn-ml btn-sm card-ml-btn";
          mlBtn.href = url;
          mlBtn.target = "_blank";
          mlBtn.rel = "noopener noreferrer";
          mlBtn.setAttribute("aria-label", "Ver en Mercado Libre: " + titulo);
          mlBtn.textContent = "Ver en Mercado Libre";
          body.appendChild(mlBtn);
        } else if (url) {
          var extBtn = document.createElement("a");
          extBtn.className = "card-cta";
          extBtn.href = url;
          extBtn.target = "_blank";
          extBtn.rel = "noopener noreferrer";
          extBtn.innerHTML = "Ver producto <span aria-hidden=\"true\">→</span>";
          body.appendChild(extBtn);
        } else {
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

      if (meta) {
        var base =
          filtered.length === products.length
            ? products.length + " producto" + (products.length !== 1 ? "s" : "")
            : filtered.length +
              " de " +
              products.length +
              " producto" +
              (products.length !== 1 ? "s" : "");
        if (totalItems > PAGE_SIZE) {
          meta.textContent =
            "Mostrando " +
            (start + 1) +
            "–" +
            (start + visible.length) +
            " de " +
            totalItems +
            " · " +
            base +
            " · Página " +
            currentPage +
            " de " +
            totalPages;
        } else {
          meta.textContent =
            visible.length === filtered.length
              ? base
              : "Mostrando " + visible.length + " de " + base;
        }
      }

      if (emptyEl) {
        emptyEl.hidden = totalItems > 0;
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
        fillCategories(allProducts);
        var params = parseParams();
        if (searchInput) {
          // Avoid stale browser-restored filters hiding products on first load.
          searchInput.value = params.q || "";
        }
        if (catSelect && params.cat) {
          var wanted = params.cat;
          var found = Array.prototype.slice.call(catSelect.options).find(function (o) {
            return norm(o.value) === norm(wanted);
          });
          if (found) catSelect.value = found.value;
        } else if (catSelect) {
          catSelect.value = "";
        }
        render(allProducts, { resetPage: true });
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
            render(allProducts, { resetPage: true });
          });
        }
        if (catSelect) {
          catSelect.addEventListener("change", function () {
            render(allProducts, { resetPage: true });
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
        if (loadMoreBtn) {
          loadMoreBtn.addEventListener("click", function () {
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
})();
