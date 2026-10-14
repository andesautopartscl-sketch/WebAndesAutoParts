(function () {
  "use strict";

  var header = document.querySelector(".site-header");
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  function closeMenu() {
    if (!header || !toggle) return;
    header.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  if (toggle && nav && header) {
    toggle.addEventListener("click", function () {
      var open = !header.classList.contains("is-open");
      header.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });
  }

  function fotoNitida(url) {
    var u = String(url || "");
    if (!u) return "";
    return u.replace(/-O\.(webp|jpe?g|png)(\?.*)?$/i, "-F.$1$2");
  }

  function ponerMeta(attr, clave, valor) {
    var el = document.querySelector('meta[' + attr + '="' + clave + '"]');
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, clave);
      document.head.appendChild(el);
    }
    el.setAttribute("content", valor);
  }

  function textoParaBuscadores(p) {
    var precio = p.precio ? clp(p.precio) : "";
    var texto =
      (p.titulo || "Repuesto") +
      (precio ? " por " + precio : "") +
      ". Andes Auto Parts, La Cisterna. Consulta stock por WhatsApp.";
    if (texto.length > 160) texto = texto.slice(0, 157) + "...";
    return texto;
  }

  function clp(n) {
    return Number(n || 0).toLocaleString("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    });
  }

  function aplicarAutoEnFicha(p, auto) {
    var nota = document.getElementById("product-auto");
    if (nota) {
      nota.textContent = auto
        ? "Cotización para tu " + auto.label + "."
        : "Si nos dices marca, modelo y año, confirmamos si esta pieza sirve.";
    }
    var texto =
      "Hola, me interesa: " +
      (p.titulo || "un repuesto") +
      (p.sku ? " (SKU " + p.sku + ")" : "") +
      ".";
    if (auto) texto += " Mi auto es " + auto.label + ".";
    texto += " ¿Tienen stock?";
    var wa = document.getElementById("product-wa");
    if (wa) wa.href = "https://wa.me/56926152826?text=" + encodeURIComponent(texto);
  }

  function autoGuardado() {
    try {
      var raw = localStorage.getItem("andes_vehiculo_v1");
      if (!raw) return null;
      var data = JSON.parse(raw);
      return data && data.label ? data : null;
    } catch (err) {
      return null;
    }
  }

  function palabras(titulo) {
    var stop = { para: 1, del: 1, de: 1, la: 1, el: 1, los: 1, las: 1, par: 1, con: 1, por: 1, una: 1, kit: 1 };
    return String(titulo || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(function (w) {
        return w.length > 2 && !stop[w];
      });
  }

  function relacionados(todos, actual) {
    var keys = palabras(actual.titulo);
    return todos
      .filter(function (p) {
        return p.id !== actual.id;
      })
      .map(function (p) {
        var otros = palabras(p.titulo);
        var puntos = keys.filter(function (k) {
          return otros.indexOf(k) !== -1;
        }).length;
        return { p: p, puntos: puntos };
      })
      .filter(function (row) {
        return row.puntos >= 2;
      })
      .sort(function (a, b) {
        return b.puntos - a.puntos;
      })
      .slice(0, 4)
      .map(function (row) {
        return row.p;
      });
  }

  function pintar(p, todos) {
    document.title = (p.titulo || "Repuesto") + " | Andes Auto Parts";
    var urlFicha = "https://andesautoparts.cl/producto.html?id=" + encodeURIComponent(p.id);
    var canon = document.getElementById("product-canonical");
    if (canon) canon.href = urlFicha;
    var resumen = textoParaBuscadores(p);
    ponerMeta("name", "description", resumen);
    ponerMeta("property", "og:title", document.title);
    ponerMeta("property", "og:description", resumen);
    ponerMeta("property", "og:url", urlFicha);
    ponerMeta("property", "og:image", fotoNitida(p.imagen) || p.imagen || "https://andesautoparts.cl/images/auth/login-side.png");

    document.getElementById("product-layout").hidden = false;
    document.getElementById("product-title").textContent = p.titulo || "Repuesto";
    document.getElementById("product-sku").textContent = p.sku ? "SKU " + p.sku : p.id || "";
    document.getElementById("product-price").textContent = p.precio ? clp(p.precio) : "Consultar precio";

    var img = document.getElementById("product-img");
    img.alt = p.titulo || "Repuesto";
    var grande = fotoNitida(p.imagen);
    var chica = p.imagen || "";
    var paso = 0;
    img.onerror = function () {
      paso += 1;
      if (paso === 1 && chica && chica !== grande) {
        img.src = chica;
        return;
      }
      img.onerror = null;
      img.src = "logo_andes.png";
    };
    img.src = grande || chica || "logo_andes.png";

    var stock = p.stock != null && p.stock !== "" ? Number(p.stock) : null;
    var stockTxt = stock == null ? "Consultar" : stock > 0 ? stock + " unidades" : "Sin stock";
    var meta = document.getElementById("product-meta");
    meta.innerHTML =
      "<li><strong>Stock:</strong> " + stockTxt + "</li>" +
      "<li><strong>Condición:</strong> " + (p.condicion === "used" ? "Usado" : "Nuevo") + "</li>" +
      "<li><strong>Código:</strong> " + (p.sku || p.id || "—") + "</li>";

    var auto = autoGuardado();
    aplicarAutoEnFicha(p, auto);
    productoActual = p;

    var ml = document.getElementById("product-ml");
    if (p.link) {
      ml.hidden = false;
      ml.href = p.link;
    }

    var favFoto = document.getElementById("product-fav-photo");
    if (favFoto && p.id) {
      favFoto.hidden = false;
      favFoto.setAttribute("data-fav-id", p.id);
      favFoto.setAttribute("data-fav-titulo", p.titulo || "");
      favFoto.setAttribute("data-fav-sku", p.sku || "");
      favFoto.setAttribute("data-fav-precio", p.precio != null ? String(p.precio) : "0");
      favFoto.setAttribute("data-fav-imagen", p.imagen || "");
      favFoto.setAttribute("data-fav-link", "producto.html?id=" + encodeURIComponent(p.id));
    }
    if (window.AndesFavoritos && window.AndesFavoritos.pintarBotones) window.AndesFavoritos.pintarBotones();

    var cartBtn = document.getElementById("product-cart");
    if (stock != null && stock <= 0) {
      cartBtn.disabled = true;
      cartBtn.textContent = "Sin stock";
    } else {
      cartBtn.addEventListener("click", function () {
        if (!window.AndesCart) return;
        window.AndesCart.agregar(
          {
            id: p.id,
            sku: p.sku,
            titulo: p.titulo,
            precio: p.precio,
            imagen: p.imagen,
            link: p.link,
            stock: stock,
          },
          1
        );
        cartBtn.textContent = "Agregado";
      });
    }

    if (window.AndesAnalitica && window.AndesAnalitica.evento) {
      window.AndesAnalitica.evento({
        tipo: "producto",
        producto_id: p.id || "",
        producto_titulo: p.titulo || "",
        path: location.pathname + location.search,
      });
    }

    var otros = relacionados(todos, p);
    var grid = document.getElementById("product-related-grid");
    if (otros.length && grid) {
      document.getElementById("product-related").hidden = false;
      grid.innerHTML = "";
      otros.forEach(function (item) {
        var href = "producto.html?id=" + encodeURIComponent(item.id);
        var card = document.createElement("article");
        card.className = "product-related-card";
        var favBtn = document.createElement("button");
        favBtn.type = "button";
        favBtn.className = "fav-btn";
        favBtn.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z"></path></svg>';
        favBtn.setAttribute("data-fav-id", item.id || "");
        favBtn.setAttribute("data-fav-titulo", item.titulo || "");
        favBtn.setAttribute("data-fav-sku", item.sku || "");
        favBtn.setAttribute("data-fav-precio", item.precio != null ? String(item.precio) : "0");
        favBtn.setAttribute("data-fav-imagen", item.imagen || "");
        favBtn.setAttribute("data-fav-link", href);
        var link = document.createElement("a");
        link.href = href;
        var img = document.createElement("img");
        img.src = item.imagen || "logo_andes.png";
        img.alt = item.titulo || "Repuesto";
        var titulo = document.createElement("p");
        titulo.textContent = item.titulo || "Repuesto";
        link.appendChild(img);
        link.appendChild(titulo);
        card.appendChild(favBtn);
        card.appendChild(link);
        grid.appendChild(card);
      });
      if (window.AndesFavoritos && window.AndesFavoritos.pintarBotones) window.AndesFavoritos.pintarBotones();
    }
  }

  var productoActual = null;
  window.addEventListener("andes-vehiculo", function () {
    if (productoActual) aplicarAutoEnFicha(productoActual, autoGuardado());
  });

  var params = new URLSearchParams(location.search);
  var id = params.get("id") || "";
  fetch("data/productos.json", { cache: "no-store" })
    .then(function (res) {
      return res.json();
    })
    .then(function (lista) {
      var todos = Array.isArray(lista) ? lista : [];
      var p = todos.find(function (item) {
        return String(item.id) === id;
      });
      if (!p) {
        document.getElementById("product-missing").hidden = false;
        return;
      }
      pintar(p, todos);
    })
    .catch(function () {
      document.getElementById("product-missing").hidden = false;
    });
})();
