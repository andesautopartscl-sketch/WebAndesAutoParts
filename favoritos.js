/**
 * Favoritos del visitante.
 * Sin sesión viven en localStorage. Con sesión se guardan en la cuenta.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "andes_favoritos_v1";
  var MAX = 80;
  var memoria = null;
  var listeners = [];

  function normalizar(raw) {
    if (!raw || raw.id == null) return null;
    var id = String(raw.id).trim();
    if (!id) return null;
    var precio = Number(raw.precio);
    return {
      id: id.slice(0, 40),
      titulo: String(raw.titulo || "").trim().slice(0, 200),
      sku: String(raw.sku || "").trim().slice(0, 60),
      precio: isFinite(precio) && precio > 0 ? Math.round(precio) : 0,
      imagen: String(raw.imagen || "").trim().slice(0, 500),
      link: String(raw.link || "").trim().slice(0, 500),
    };
  }

  function leer() {
    if (memoria) return memoria;
    var items = [];
    try {
      var crudo = window.localStorage.getItem(STORAGE_KEY);
      if (crudo) {
        var parsed = JSON.parse(crudo);
        if (Array.isArray(parsed)) items = parsed.map(normalizar).filter(Boolean);
      }
    } catch (err) {
      items = [];
    }
    memoria = items.slice(0, MAX);
    return memoria;
  }

  function avisar() {
    pintarBotones();
    listeners.forEach(function (cb) {
      try {
        cb(leer());
      } catch (err) {
        /* un listener roto no debe romper los favoritos */
      }
    });
  }

  function escribirLocal(items) {
    memoria = items.slice(0, MAX);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoria));
    } catch (err) {
      /* modo privado: siguen en memoria */
    }
    avisar();
  }

  function guardar(items) {
    escribirLocal(items);
    if (window.AndesAuth && window.AndesAuth.haySesion() && window.AndesAuth.sincronizarFavoritos) {
      window.AndesAuth.sincronizarFavoritos().catch(function () {});
    }
  }

  function reemplazar(lista) {
    var items = Array.isArray(lista) ? lista.map(normalizar).filter(Boolean) : [];
    escribirLocal(items);
  }

  function tiene(id) {
    var clave = String(id || "");
    return leer().some(function (it) {
      return it.id === clave;
    });
  }

  function alternar(producto) {
    var item = normalizar(producto);
    if (!item) return;
    var resto = leer().filter(function (it) {
      return it.id !== item.id;
    });
    if (tiene(item.id)) guardar(resto);
    else guardar([item].concat(resto));
  }

  function quitar(id) {
    var clave = String(id || "");
    guardar(
      leer().filter(function (it) {
        return it.id !== clave;
      })
    );
  }

  function pintarBotones() {
    document.querySelectorAll(".fav-btn[data-fav-id]").forEach(function (btn) {
      var on = tiene(btn.getAttribute("data-fav-id"));
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      var nombre = btn.getAttribute("data-fav-titulo") || "este repuesto";
      var texto = btn.querySelector(".fav-btn__text");
      if (texto) texto.textContent = on ? "En favoritos" : "Guardar";
      btn.setAttribute("aria-label", (on ? "Quitar de favoritos: " : "Guardar en favoritos: ") + nombre);
    });
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest(".fav-btn[data-fav-id]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    alternar({
      id: btn.getAttribute("data-fav-id"),
      titulo: btn.getAttribute("data-fav-titulo") || "",
      sku: btn.getAttribute("data-fav-sku") || "",
      precio: btn.getAttribute("data-fav-precio") || 0,
      imagen: btn.getAttribute("data-fav-imagen") || "",
      link: btn.getAttribute("data-fav-link") || "",
    });
  });

  function engancharCuenta() {
    if (!window.AndesAuth || !window.AndesAuth.haySesion() || !window.AndesAuth.fusionarFavoritos) return;
    window.AndesAuth.fusionarFavoritos().catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", engancharCuenta);
  } else {
    engancharCuenta();
  }

  window.AndesFavoritos = {
    items: function () {
      return leer().slice();
    },
    tiene: tiene,
    alternar: alternar,
    quitar: quitar,
    reemplazar: reemplazar,
    pintarBotones: pintarBotones,
    onChange: function (cb) {
      if (typeof cb === "function") listeners.push(cb);
    },
  };
})();
