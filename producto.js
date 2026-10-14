(function () {
  "use strict";

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  function clp(n) {
    return Number(n || 0).toLocaleString("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    });
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
    document.title = p.titulo + " | Andes Auto Parts";
    var canon = document.getElementById("product-canonical");
    if (canon) canon.href = "https://andesautoparts.cl/producto.html?id=" + encodeURIComponent(p.id);
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", p.titulo + ". Repuesto en Andes Auto Parts, La Cisterna.");

    document.getElementById("product-layout").hidden = false;
    document.getElementById("product-title").textContent = p.titulo || "Repuesto";
    document.getElementById("product-sku").textContent = p.sku ? "SKU " + p.sku : p.id || "";
    document.getElementById("product-price").textContent = p.precio ? clp(p.precio) : "Consultar precio";

    var img = document.getElementById("product-img");
    img.alt = p.titulo || "Repuesto";
    img.src = p.imagen || "logo_andes.png";
    img.addEventListener("error", function () {
      img.src = "logo_andes.png";
    });

    var stock = p.stock != null && p.stock !== "" ? Number(p.stock) : null;
    var stockTxt = stock == null ? "Consultar" : stock > 0 ? stock + " unidades" : "Sin stock";
    var meta = document.getElementById("product-meta");
    meta.innerHTML =
      "<li><strong>Stock:</strong> " + stockTxt + "</li>" +
      "<li><strong>Condición:</strong> " + (p.condicion === "used" ? "Usado" : "Nuevo") + "</li>" +
      "<li><strong>Código:</strong> " + (p.sku || p.id || "—") + "</li>";

    var auto = autoGuardado();
    var nota = document.getElementById("product-auto");
    if (auto) nota.textContent = "Cotización para tu " + auto.label + ".";
    else nota.textContent = "Si nos dices marca, modelo y año, confirmamos si esta pieza sirve.";

    var texto =
      "Hola, me interesa: " +
      (p.titulo || "un repuesto") +
      (p.sku ? " (SKU " + p.sku + ")" : "") +
      ".";
    if (auto) texto += " Mi auto es " + auto.label + ".";
    texto += " ¿Tienen stock?";
    document.getElementById("product-wa").href =
      "https://wa.me/56926152826?text=" + encodeURIComponent(texto);

    var ml = document.getElementById("product-ml");
    if (p.link) {
      ml.hidden = false;
      ml.href = p.link;
    }

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
    if (otros.length) {
      document.getElementById("product-related").hidden = false;
      document.getElementById("product-related-grid").innerHTML = otros
        .map(function (item) {
          var href = "producto.html?id=" + encodeURIComponent(item.id);
          return (
            '<a href="' +
            href +
            '"><img src="' +
            (item.imagen || "logo_andes.png") +
            '" alt=""><p>' +
            String(item.titulo || "Repuesto")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;") +
            "</p></a>"
          );
        })
        .join("");
    }
  }

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
