/**
 * Carrito de compras de Andes Auto Parts.
 *
 * El sitio es estático (GitHub Pages), así que el carrito vive completo en el
 * navegador: el estado se guarda en localStorage y no hay servidor de por
 * medio. El cobro en línea con Mercado Pago y Webpay todavía no está
 * habilitado, por lo que checkout.html deriva a transferencia bancaria o a
 * WhatsApp. Cuando lleguen las pasarelas, este módulo no cambia: solo se
 * agrega el paso de cobro en el checkout.
 *
 * Este archivo se autoinstala: inyecta el botón del carrito en
 * `.header-actions` y el panel lateral en el `<body>`, así que basta con
 * cargarlo en cualquier página. Expone `window.AndesCart`.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "andes_carrito_v1";
  var MAX_QTY = 99;

  /**
   * El precio de la web es el mismo que en Mercado Libre. Para ofrecer un
   * precio menor por comprar directo (donde no pagamos comisión de ML),
   * baja este factor: 0.95 equivale a un 5% de descuento.
   */
  var PRECIO_WEB_FACTOR = 1;

  var memoria = null;
  var listeners = [];
  var drawer = null;
  var backdrop = null;
  var bodyEl = null;
  var footEl = null;
  var countEls = [];
  var lastFocus = null;

  /* ============================ Utilidades ============================ */

  function formatCLP(valor) {
    var n = Number(valor) || 0;
    try {
      return new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
      }).format(n);
    } catch (err) {
      return "$" + Math.round(n).toLocaleString("es-CL");
    }
  }

  function precioWeb(precioML) {
    var n = Number(precioML) || 0;
    if (PRECIO_WEB_FACTOR === 1) return Math.round(n);
    return Math.round((n * PRECIO_WEB_FACTOR) / 10) * 10;
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ============================== Estado ============================== */

  function normalizar(raw) {
    var stock = Number(raw.stock);
    return {
      id: String(raw.id || "").trim(),
      sku: String(raw.sku || "").trim(),
      titulo: String(raw.titulo || "").trim(),
      precio: Math.round(Number(raw.precio) || 0),
      imagen: String(raw.imagen || "").trim(),
      link: String(raw.link || "").trim(),
      stock: isNaN(stock) ? null : stock,
      qty: clamp(Math.round(Number(raw.qty) || 1), 1, MAX_QTY),
    };
  }

  function esValido(raw) {
    return raw && typeof raw === "object" && String(raw.id || "").trim() !== "";
  }

  function leer() {
    if (memoria) return memoria;
    var items = [];
    try {
      var crudo = window.localStorage.getItem(STORAGE_KEY);
      if (crudo) {
        var parsed = JSON.parse(crudo);
        if (Array.isArray(parsed)) {
          items = parsed.filter(esValido).map(normalizar);
        }
      }
    } catch (err) {
      items = [];
    }
    memoria = items;
    return memoria;
  }

  function guardar(items) {
    memoria = items;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      // Modo privado o cuota llena: el carrito sigue vivo en memoria
      // durante la sesión, que es mejor que perderlo en silencio.
    }
    avisar(items);
    // Si hay sesión, reflejamos el carrito en el perfil (sin bloquear la UI).
    if (window.AndesAuth && window.AndesAuth.haySesion()) {
      window.AndesAuth.sincronizarCarrito().catch(function () {});
    }
  }

  /** Reemplaza el carrito local (p. ej. tras merge con el perfil). */
  function reemplazar(lista) {
    var items = Array.isArray(lista)
      ? lista.filter(esValido).map(normalizar)
      : [];
    // Evita un PUT circular al servidor justo después del merge.
    memoria = items;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      /* noop */
    }
    avisar(items);
  }

  function avisar(items) {
    pintarContador(items);
    pintarPanel(items);
    listeners.forEach(function (cb) {
      try {
        cb(items);
      } catch (err) {
        /* un listener roto no debe romper el carrito */
      }
    });
  }

  function cantidadTotal(items) {
    return (items || leer()).reduce(function (acc, it) {
      return acc + it.qty;
    }, 0);
  }

  function subtotal(items) {
    return (items || leer()).reduce(function (acc, it) {
      return acc + it.precio * it.qty;
    }, 0);
  }

  /* ============================== Acciones ============================== */

  function agregar(producto, cantidad) {
    if (!esValido(producto)) return null;
    var qty = clamp(Math.round(Number(cantidad) || 1), 1, MAX_QTY);
    var items = leer().slice();
    var id = String(producto.id).trim();
    var existente = null;

    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) {
        existente = items[i];
        break;
      }
    }

    var tope = MAX_QTY;
    var stock = Number(producto.stock);
    if (!isNaN(stock) && stock > 0) tope = Math.min(MAX_QTY, stock);

    if (existente) {
      existente.qty = clamp(existente.qty + qty, 1, tope);
    } else {
      var nuevo = normalizar({
        id: id,
        sku: producto.sku,
        titulo: producto.titulo,
        precio: precioWeb(producto.precio),
        imagen: producto.imagen,
        link: producto.link,
        stock: producto.stock,
        qty: clamp(qty, 1, tope),
      });
      items.push(nuevo);
    }

    guardar(items);
    return items;
  }

  function quitar(id) {
    var buscado = String(id || "").trim();
    var items = leer().filter(function (it) {
      return it.id !== buscado;
    });
    guardar(items);
  }

  function definirCantidad(id, cantidad) {
    var buscado = String(id || "").trim();
    var qty = Math.round(Number(cantidad) || 0);
    if (qty <= 0) return quitar(buscado);

    var items = leer().map(function (it) {
      if (it.id !== buscado) return it;
      var tope = MAX_QTY;
      if (it.stock != null && it.stock > 0) tope = Math.min(MAX_QTY, it.stock);
      return Object.assign({}, it, { qty: clamp(qty, 1, tope) });
    });
    guardar(items);
  }

  function vaciar() {
    guardar([]);
  }

  /* ========================= Contador en el header ========================= */

  function pintarContador(items) {
    var total = cantidadTotal(items);
    countEls.forEach(function (el) {
      el.textContent = String(total);
      el.hidden = total === 0;
    });
  }

  /**
   * El botón va en la barra del header y no dentro de `.header-actions`,
   * porque bajo 720px ese bloque queda oculto detrás del menú hamburguesa
   * y el carrito tiene que estar siempre a la vista.
   */
  function crearBotonHeader() {
    var barra = document.querySelector(".header-inner");
    if (!barra || barra.querySelector(".cart-trigger")) return;

    var boton = document.createElement("button");
    boton.type = "button";
    boton.className = "cart-trigger";
    boton.setAttribute("aria-label", "Abrir carrito de compras");
    boton.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>' +
      '<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>' +
      "</svg>" +
      '<span class="cart-trigger__count" hidden>0</span>';

    boton.addEventListener("click", abrir);
    barra.appendChild(boton);

    countEls.push(boton.querySelector(".cart-trigger__count"));
  }

  /* ============================ Panel lateral ============================ */

  function crearPanel() {
    if (drawer) return;

    backdrop = document.createElement("div");
    backdrop.className = "cart-backdrop";
    backdrop.hidden = true;
    backdrop.addEventListener("click", cerrar);

    drawer = document.createElement("aside");
    drawer.className = "cart-drawer";
    drawer.id = "cart-drawer";
    drawer.hidden = true;
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Carrito de compras");
    drawer.innerHTML =
      '<div class="cart-drawer__head">' +
      '<h2 class="cart-drawer__title">Tu carrito</h2>' +
      '<button type="button" class="cart-drawer__close" aria-label="Cerrar carrito">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
      "</button>" +
      "</div>" +
      '<div class="cart-drawer__body"></div>' +
      '<div class="cart-drawer__foot"></div>';

    bodyEl = drawer.querySelector(".cart-drawer__body");
    footEl = drawer.querySelector(".cart-drawer__foot");
    drawer.querySelector(".cart-drawer__close").addEventListener("click", cerrar);

    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);

    bodyEl.addEventListener("click", onPanelClick);
    bodyEl.addEventListener("change", onPanelChange);
  }

  function onPanelClick(e) {
    var accion = e.target.closest("[data-cart-action]");
    if (!accion) return;
    var id = accion.getAttribute("data-cart-id");
    var tipo = accion.getAttribute("data-cart-action");

    if (tipo === "quitar") return quitar(id);
    if (tipo === "mas" || tipo === "menos") {
      var actual = 0;
      leer().forEach(function (it) {
        if (it.id === id) actual = it.qty;
      });
      definirCantidad(id, tipo === "mas" ? actual + 1 : actual - 1);
    }
  }

  function onPanelChange(e) {
    var input = e.target.closest("[data-cart-qty]");
    if (!input) return;
    definirCantidad(input.getAttribute("data-cart-qty"), input.value);
  }

  function filaHtml(item) {
    var tope = item.stock != null && item.stock > 0 ? Math.min(MAX_QTY, item.stock) : MAX_QTY;
    var sinMargen = item.qty >= tope;
    return (
      '<article class="cart-line">' +
      (item.imagen
        ? '<img class="cart-line__img" src="' +
          esc(item.imagen) +
          '" alt="" width="64" height="64" loading="lazy" />'
        : '<div class="cart-line__img cart-line__img--empty" aria-hidden="true"></div>') +
      '<div class="cart-line__info">' +
      '<p class="cart-line__title">' +
      esc(item.titulo) +
      "</p>" +
      (item.sku ? '<p class="cart-line__sku">' + esc(item.sku) + "</p>" : "") +
      '<p class="cart-line__price">' +
      formatCLP(item.precio) +
      ' <span class="cart-line__each">c/u</span></p>' +
      '<div class="cart-line__controls">' +
      '<div class="cart-qty">' +
      '<button type="button" class="cart-qty__btn" data-cart-action="menos" data-cart-id="' +
      esc(item.id) +
      '" aria-label="Quitar una unidad">−</button>' +
      '<input class="cart-qty__input" type="number" min="1" max="' +
      tope +
      '" value="' +
      item.qty +
      '" data-cart-qty="' +
      esc(item.id) +
      '" aria-label="Cantidad" />' +
      '<button type="button" class="cart-qty__btn" data-cart-action="mas" data-cart-id="' +
      esc(item.id) +
      '" aria-label="Agregar una unidad"' +
      (sinMargen ? " disabled" : "") +
      ">+</button>" +
      "</div>" +
      '<button type="button" class="cart-line__remove" data-cart-action="quitar" data-cart-id="' +
      esc(item.id) +
      '">Quitar</button>' +
      "</div>" +
      (item.stock != null && item.stock > 0 && item.stock <= 3
        ? '<p class="cart-line__stock">Últimas ' + item.stock + " unidades</p>"
        : "") +
      "</div>" +
      '<p class="cart-line__total">' +
      formatCLP(item.precio * item.qty) +
      "</p>" +
      "</article>"
    );
  }

  function pintarPanel(items) {
    if (!bodyEl || !footEl) return;
    var lista = items || leer();

    if (!lista.length) {
      bodyEl.innerHTML =
        '<div class="cart-empty">' +
        '<p class="cart-empty__title">Tu carrito está vacío</p>' +
        '<p class="cart-empty__text">Busca tu repuesto en el catálogo y agrégalo desde la tarjeta del producto.</p>' +
        '<a class="btn btn-primary btn-sm" href="index.html#productos">Ver el catálogo</a>' +
        "</div>";
      footEl.innerHTML = "";
      return;
    }

    bodyEl.innerHTML = lista.map(filaHtml).join("");
    footEl.innerHTML =
      '<div class="cart-foot__row">' +
      "<span>Subtotal</span>" +
      '<strong class="cart-foot__total">' +
      formatCLP(subtotal(lista)) +
      "</strong>" +
      "</div>" +
      '<p class="cart-foot__note">El despacho se calcula en el siguiente paso.</p>' +
      '<a class="btn btn-primary btn-lg cart-foot__cta" href="checkout.html">Continuar la compra</a>' +
      '<button type="button" class="cart-foot__clear" data-cart-clear>Vaciar el carrito</button>';

    var limpiar = footEl.querySelector("[data-cart-clear]");
    if (limpiar) {
      limpiar.addEventListener("click", function () {
        vaciar();
      });
    }
  }

  function abrir() {
    crearPanel();
    pintarPanel(leer());
    lastFocus = document.activeElement;
    backdrop.hidden = false;
    drawer.hidden = false;
    // Un frame de espera para que la transición CSS tenga desde dónde animar.
    window.requestAnimationFrame(function () {
      backdrop.classList.add("is-open");
      drawer.classList.add("is-open");
    });
    document.body.classList.add("cart-open");
    var cerrarBtn = drawer.querySelector(".cart-drawer__close");
    if (cerrarBtn) cerrarBtn.focus();
  }

  function cerrar() {
    if (!drawer || drawer.hidden) return;
    backdrop.classList.remove("is-open");
    drawer.classList.remove("is-open");
    document.body.classList.remove("cart-open");
    window.setTimeout(function () {
      if (drawer.classList.contains("is-open")) return;
      drawer.hidden = true;
      backdrop.hidden = true;
    }, 220);
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  /* ================================ Aviso ================================ */

  function toast(mensaje) {
    var previo = document.querySelector(".cart-toast");
    if (previo) previo.remove();

    var el = document.createElement("div");
    el.className = "cart-toast";
    el.setAttribute("role", "status");
    el.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>' +
      "<span>" +
      esc(mensaje) +
      "</span>" +
      '<button type="button" class="cart-toast__link">Ver carrito</button>';
    el.querySelector(".cart-toast__link").addEventListener("click", function () {
      el.remove();
      abrir();
    });

    document.body.appendChild(el);
    window.requestAnimationFrame(function () {
      el.classList.add("is-visible");
    });
    window.setTimeout(function () {
      el.classList.remove("is-visible");
      window.setTimeout(function () {
        el.remove();
      }, 250);
    }, 3600);
  }

  /* =============================== Arranque =============================== */

  function registrarContador(el) {
    if (el && countEls.indexOf(el) === -1) countEls.push(el);
    pintarContador(leer());
  }

  function iniciar() {
    crearBotonHeader();
    crearPanel();
    pintarContador(leer());
    pintarPanel(leer());
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") cerrar();
  });

  // Otra pestaña del mismo sitio pudo cambiar el carrito.
  window.addEventListener("storage", function (e) {
    if (e.key !== STORAGE_KEY) return;
    memoria = null;
    avisar(leer());
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }

  window.AndesCart = {
    agregar: function (producto, cantidad) {
      var resultado = agregar(producto, cantidad);
      if (resultado) toast("Agregado al carrito");
      return resultado;
    },
    quitar: quitar,
    definirCantidad: definirCantidad,
    vaciar: vaciar,
    reemplazar: reemplazar,
    items: function () {
      return leer().slice();
    },
    cantidad: function () {
      return cantidadTotal();
    },
    subtotal: function () {
      return subtotal();
    },
    abrir: abrir,
    cerrar: cerrar,
    formatCLP: formatCLP,
    precioWeb: precioWeb,
    registrarContador: registrarContador,
    onChange: function (cb) {
      if (typeof cb === "function") listeners.push(cb);
    },
  };
})();
