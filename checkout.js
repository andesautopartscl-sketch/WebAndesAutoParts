/**
 * Checkout de Andes Auto Parts.
 *
 * Todavía no hay cobro en línea: Mercado Pago y Webpay aparecen como
 * "Próximamente" y el pedido se cierra por transferencia bancaria o
 * coordinando por WhatsApp. El aviso del pedido sale por Web3Forms, el mismo
 * servicio que ya usa el formulario de contacto, porque el sitio es estático
 * y no tenemos servidor propio.
 *
 * Cuando el Worker exponga /orders y las pasarelas estén integradas, lo único
 * que cambia acá es la función `enviarPedido`.
 */
(function () {
  "use strict";

  var cfg = window.ANDES_PAGO || {};
  var contacto = window.ANDES_CONTACT || {};
  var envio = window.ANDES_ENVIO || {};
  var textosEnvio = envio.textos || {};
  var textosPago = cfg.textos || {};
  var cfgPedidos = window.ANDES_PEDIDOS || {};
  var cfgComprobante = cfgPedidos.comprobante || {};
  var retiro = envio.retiro || {};
  var couriers = envio.couriers || ["Starken", "Chilexpress"];
  var waNumber = String(contacto.whatsappNumber || "56926152826").replace(/\D/g, "");

  /** Las 52 comunas de la Región Metropolitana. */
  var COMUNAS_RM = [
    "Alhué", "Buin", "Calera de Tango", "Cerrillos", "Cerro Navia", "Colina",
    "Conchalí", "Curacaví", "El Bosque", "El Monte", "Estación Central",
    "Huechuraba", "Independencia", "Isla de Maipo", "La Cisterna", "La Florida",
    "La Granja", "La Pintana", "La Reina", "Lampa", "Las Condes",
    "Lo Barnechea", "Lo Espejo", "Lo Prado", "Macul", "Maipú", "María Pinto",
    "Melipilla", "Ñuñoa", "Padre Hurtado", "Paine", "Pedro Aguirre Cerda",
    "Peñaflor", "Peñalolén", "Pirque", "Providencia", "Pudahuel",
    "Puente Alto", "Quilicura", "Quinta Normal", "Recoleta", "Renca",
    "San Bernardo", "San Joaquín", "San José de Maipo", "San Miguel",
    "San Pedro", "San Ramón", "Santiago", "Talagante", "Tiltil", "Vitacura",
  ];

  var form = document.getElementById("checkout-form");
  var grid = document.getElementById("checkout-grid");
  var blank = document.getElementById("checkout-blank");
  var done = document.getElementById("checkout-done");
  var itemsEl = document.getElementById("summary-items");
  var subtotalEl = document.getElementById("summary-subtotal");
  var totalEl = document.getElementById("summary-total");
  var envioEl = document.getElementById("summary-envio");
  var errorEl = document.getElementById("checkout-error");
  var submitBtn = document.getElementById("checkout-submit");
  var soonNote = document.getElementById("pay-soon-note");
  var payOptions = document.getElementById("pay-options");
  var shipNote = document.getElementById("ship-note");
  var courierWrap = document.getElementById("ship-courier");
  var courierOptions = document.getElementById("courier-options");
  var courierOtraWrap = document.getElementById("courier-otra");
  var courierOtraInput = document.getElementById("co-transporte-otra");
  var courierAviso = document.getElementById("courier-aviso");
  var docHint = document.getElementById("doc-hint");
  var comunaRmWrap = document.querySelector('[data-comuna="rm"]');
  var comunaLibreWrap = document.querySelector('[data-comuna="libre"]');
  var comunaRmSelect = document.getElementById("co-comuna-rm");
  var comunaLibreInput = document.getElementById("co-comuna");
  var envioBlock = document.getElementById("envio-block");
  var pickupCard = document.getElementById("pickup-card");
  var payTransfer = document.getElementById("pay-transfer");
  var pagadoCheck = document.getElementById("co-pagado");
  var fileWrap = document.getElementById("pay-file");
  var fileInput = document.getElementById("co-comprobante");
  var fileHint = document.getElementById("pay-file-hint");
  var descuentoRow = document.getElementById("summary-descuento-row");
  var descuentoEl = document.getElementById("summary-descuento");
  var descuentoLabel = document.getElementById("summary-descuento-label");

  var finalizado = false;
  /** Subtotal con precios de cuenta (descuento / especial); 0 = usar carrito. */
  var subtotalCuenta = 0;
  /** id → precio efectivo resuelto por el Worker. */
  var preciosCuenta = {};
  var preciosFirma = "";
  var preciosCargando = false;

  /* ============================= Utilidades ============================= */

  function fmt(valor) {
    return window.AndesCart ? window.AndesCart.formatCLP(valor) : "$" + valor;
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  /** Compara nombres de comuna sin importar acentos ni mayúsculas. */
  function norm(str) {
    return String(str || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  /**
   * Sin servidor no hay secuencia global, así que el número combina la fecha
   * con un sufijo aleatorio. Cuando exista la API de órdenes, el número lo
   * asignará el backend.
   */
  function generarNumeroPedido() {
    var d = new Date();
    var fecha =
      String(d.getFullYear()).slice(-2) + pad2(d.getMonth() + 1) + pad2(d.getDate());
    var azar = String(Math.floor(1000 + Math.random() * 9000));
    return "AAP-" + fecha + "-" + azar;
  }

  var CLAVE_PEDIDO = "andes_pedido_ref";

  /**
   * El número se reserva al entrar al checkout, no al enviarlo, porque el
   * cliente lo necesita como referencia de la transferencia antes de
   * confirmar. Queda en sessionStorage para que recargar la página no le
   * cambie la referencia de una transferencia que quizá ya hizo.
   */
  function numeroPedido() {
    var guardado = "";
    try {
      guardado = window.sessionStorage.getItem(CLAVE_PEDIDO) || "";
    } catch (e) {
      guardado = "";
    }
    if (guardado) return guardado;

    var nuevo = generarNumeroPedido();
    try {
      window.sessionStorage.setItem(CLAVE_PEDIDO, nuevo);
    } catch (e) {
      /* Modo privado o storage lleno: seguimos con el número en memoria. */
    }
    return nuevo;
  }

  function liberarNumeroPedido() {
    try {
      window.sessionStorage.removeItem(CLAVE_PEDIDO);
    } catch (e) {
      /* Nada que limpiar. */
    }
  }

  /** Validación de RUT chileno con módulo 11. */
  function rutValido(valor) {
    var limpio = String(valor || "").replace(/[^0-9kK]/g, "").toUpperCase();
    if (limpio.length < 8 || limpio.length > 9) return false;
    var cuerpo = limpio.slice(0, -1);
    var dv = limpio.slice(-1);
    if (!/^\d+$/.test(cuerpo)) return false;

    var suma = 0;
    var multiplo = 2;
    for (var i = cuerpo.length - 1; i >= 0; i--) {
      suma += Number(cuerpo.charAt(i)) * multiplo;
      multiplo = multiplo === 7 ? 2 : multiplo + 1;
    }
    var resto = 11 - (suma % 11);
    var esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
    return dv === esperado;
  }

  function formatearRut(valor) {
    var limpio = String(valor || "").replace(/[^0-9kK]/g, "").toUpperCase();
    if (limpio.length < 2) return limpio;
    return limpio.slice(0, -1) + "-" + limpio.slice(-1);
  }

  function emailValido(valor) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(valor || "").trim());
  }

  function telefonoValido(valor) {
    return String(valor || "").replace(/\D/g, "").length >= 8;
  }

  /* ========================= Documento tributario ========================= */

  function documentoSeleccionado() {
    var marcado = form.querySelector('input[name="documento"]:checked');
    return marcado ? marcado.value : "boleta";
  }

  /**
   * La boleta electrónica al consumidor final no exige el RUT del comprador;
   * la factura sí, junto con razón social y giro. Por eso el RUT de empresa
   * y los campos extra solo aparecen cuando el cliente pide factura.
   */
  function actualizarDocumentoUi() {
    var factura = documentoSeleccionado() === "factura";

    document.querySelectorAll("[data-factura]").forEach(function (el) {
      el.hidden = !factura;
    });

    var rutPersona = document.querySelector("[data-rut-persona]");
    if (rutPersona) rutPersona.hidden = factura;

    ["razon_social", "giro", "rut_factura"].forEach(function (name) {
      var campo = form.elements[name];
      if (campo) campo.required = factura;
    });

    var campoRut = form.elements.rut;
    if (campoRut) campoRut.required = false;

    if (docHint) {
      docHint.textContent = factura
        ? "Para emitir la factura necesitamos el RUT, la razón social y el giro de la empresa."
        : "La boleta electrónica llega a tu correo. Si la quieres con tu RUT, escríbelo arriba.";
    }
  }

  /* ============================== Entrega ============================== */

  function entregaSeleccionada() {
    var marcado = form.querySelector('input[name="entrega"]:checked');
    return marcado ? marcado.value : "envio";
  }

  function esRetiro() {
    return entregaSeleccionada() === "retiro";
  }

  function pintarRetiro() {
    var direccionCompleta = [retiro.direccion, retiro.ciudad].filter(Boolean).join(" · ");

    var addr = document.getElementById("pickup-addr");
    if (addr) addr.textContent = direccionCompleta;

    var horas = document.getElementById("pickup-hours");
    if (horas) horas.textContent = retiro.horario || "";

    var mapa = document.getElementById("pickup-map");
    if (mapa) {
      mapa.href = retiro.mapa || "#";
      mapa.hidden = !retiro.mapa;
    }

    var nota = document.getElementById("pickup-note");
    if (nota) nota.textContent = retiro.aviso || "";

    var descRetiro = document.getElementById("entrega-retiro-desc");
    if (descRetiro) {
      descRetiro.textContent = interpolar(textosEnvio.retiro, {
        direccion: retiro.direccion || "nuestra dirección",
        horario: retiro.horario || "",
      });
    }

    // El precio del envío va en el título ($5.990), no en un párrafo largo.
    var descEnvio = document.getElementById("entrega-envio-desc");
    if (descEnvio) {
      descEnvio.textContent =
        "Fuera del Gran Santiago: por pagar por " + couriersTexto() + ".";
    }
    actualizarTituloEnvio();
  }

  /**
   * Si el carrito no llega al mínimo, el título lleva el cobro fijo.
   * Al cruzarlo, queda solo "Envío a domicilio".
   */
  function actualizarTituloEnvio() {
    var titulo = document.getElementById("entrega-envio-title");
    if (!titulo) return;

    var minimo = Number(envio.montoMinimoGratis) || 0;
    var costoBajo = Number(envio.costoDespachoBajoMinimo) || 0;
    var sub = subtotalPedido();

    titulo.textContent =
      minimo > 0 && sub < minimo && costoBajo > 0
        ? "Envío a domicilio " + fmt(costoBajo)
        : "Envío a domicilio";
  }

  /** Con retiro no pedimos dirección: no hay nada que despachar. */
  function actualizarEntregaUi() {
    var retirar = esRetiro();
    if (pickupCard) pickupCard.hidden = !retirar;
    if (envioBlock) envioBlock.hidden = retirar;
  }

  /* ============================== Despacho ============================== */

  function esRegionGratis(region) {
    return norm(region) === norm(envio.regionGratis || "Metropolitana de Santiago");
  }

  function comunaControl() {
    return comunaRmWrap && !comunaRmWrap.hidden ? comunaRmSelect : comunaLibreInput;
  }

  function comunaValor() {
    var control = comunaControl();
    return control ? (control.value || "").trim() : "";
  }

  function poblarComunasRM() {
    if (!comunaRmSelect) return;
    COMUNAS_RM.forEach(function (nombre) {
      var opt = document.createElement("option");
      opt.textContent = nombre;
      comunaRmSelect.appendChild(opt);
    });
  }

  /** En la RM la comuna se elige de la lista; fuera de la RM va como texto. */
  function actualizarComunaUi() {
    if (!comunaRmWrap || !comunaLibreWrap) return;
    var rm = esRegionGratis(form.elements.region.value);
    comunaRmWrap.hidden = !rm;
    comunaLibreWrap.hidden = rm;
  }

  /** "Starken o Chilexpress", o "A, B o C" si algún día son más de dos. */
  function couriersTexto() {
    if (couriers.length < 2) return couriers[0] || "";
    return couriers.slice(0, -1).join(", ") + " o " + couriers[couriers.length - 1];
  }

  function interpolar(texto, valores) {
    return String(texto || "").replace(/\{(\w+)\}/g, function (todo, clave) {
      return clave in valores ? valores[clave] : todo;
    });
  }

  /**
   * En el Gran Santiago el reparto es nuestro: gratis al llegar al mínimo, o
   * con un flete fijo si todavía falta. Fuera de esa zona no cotizamos: el
   * envío va por pagar y el cliente le paga a Starken o Chilexpress.
   */
  function precioLinea(it) {
    if (preciosCuenta[it.id] != null) return Number(preciosCuenta[it.id]) || 0;
    return Number(it.precio) || 0;
  }

  function subtotalPedido(items) {
    if (subtotalCuenta > 0) return subtotalCuenta;
    if (!items) {
      return window.AndesCart ? window.AndesCart.subtotal() : 0;
    }
    return items.reduce(function (acc, it) {
      return acc + precioLinea(it) * it.qty;
    }, 0);
  }

  function refrescarPreciosCuenta(items) {
    if (!window.AndesAuth || !window.AndesAuth.haySesion() || !items.length) {
      preciosCuenta = {};
      preciosFirma = "";
      subtotalCuenta = 0;
      return Promise.resolve();
    }
    var firma = items
      .map(function (it) {
        return it.id + ":" + it.qty + ":" + it.precio;
      })
      .join("|");
    if (firma === preciosFirma || preciosCargando) return Promise.resolve();
    preciosCargando = true;
    return window.AndesAuth.resolverPrecios(items)
      .then(function (data) {
        preciosCargando = false;
        if (!data || !data.ok) return;
        preciosFirma = firma;
        preciosCuenta = {};
        var efe = 0;
        var lista = 0;
        (data.items || []).forEach(function (row) {
          var p = Math.round(Number(row.precio) || 0);
          preciosCuenta[row.id] = p;
        });
        items.forEach(function (it) {
          lista += (Number(it.precio) || 0) * it.qty;
          efe += precioLinea(it) * it.qty;
        });
        subtotalCuenta = efe;
        if (lista !== efe || Number(data.descuento_pct) > 0) {
          pintarResumen();
        }
      })
      .catch(function () {
        preciosCargando = false;
      });
  }

  function evaluarDespacho() {
    var region = (form.elements.region.value || "").trim();
    var comuna = comunaValor();
    var minimo = Number(envio.montoMinimoGratis) || 0;
    var costoBajo = Number(envio.costoDespachoBajoMinimo) || 0;
    var sub = subtotalPedido();
    var valores = {
      couriers: couriersTexto(),
      minimo: fmt(minimo),
      falta: fmt(Math.max(minimo - sub, 0)),
      costo: fmt(costoBajo),
      direccion: retiro.direccion || "nuestra dirección",
      horario: retiro.horario || "",
    };

    function resultado(estado, resumen, courier, plantilla, costo) {
      return {
        estado: estado,
        resumen: resumen,
        courier: courier,
        costo: Number(costo) || 0,
        texto: interpolar(plantilla, valores),
      };
    }

    if (esRetiro()) {
      return resultado("retiro", "Retiro en tienda", false, textosEnvio.retiro, 0);
    }

    if (!region || !comuna) {
      return resultado("pendiente", "Por confirmar", false, textosEnvio.sinRegion, 0);
    }

    if (!esRegionGratis(region)) {
      return resultado("por-pagar", "Por pagar", true, textosEnvio.regiones, 0);
    }

    var excluidas = envio.comunasSinDespachoGratis || [];
    var periurbana = excluidas.some(function (c) {
      return norm(c) === norm(comuna);
    });
    if (periurbana) {
      return resultado("periurbano", "Por pagar", true, textosEnvio.periurbano, 0);
    }

    if (minimo > 0 && sub < minimo) {
      // Reparto propio con cobro fijo: no pedimos courier porque lo llevamos
      // nosotros. El monto se suma al total y a la transferencia.
      return resultado(
        "falta-monto",
        fmt(costoBajo),
        false,
        textosEnvio.faltaMonto,
        costoBajo
      );
    }

    return resultado("gratis", "Gratis", false, textosEnvio.gratis, 0);
  }

  /** Productos + el flete propio cuando aplica. */
  function totalAPagar() {
    var sub = subtotalPedido();
    return sub + (evaluarDespacho().costo || 0);
  }

  function pintarDespacho() {
    var r = evaluarDespacho();
    var sub = subtotalPedido();

    if (shipNote) {
      var texto = r.texto || "";
      // El plazo de mismo día solo aplica a nuestro reparto en el Gran Santiago.
      if (
        (r.estado === "gratis" || r.estado === "falta-monto") &&
        textosEnvio.plazoGranSantiago
      ) {
        texto = (texto ? texto + " " : "") + textosEnvio.plazoGranSantiago;
      }
      shipNote.textContent = texto;
      shipNote.hidden = !texto;
      shipNote.className = "ship-note ship-note--" + r.estado;
    }
    if (envioEl) envioEl.textContent = r.resumen;
    if (totalEl) totalEl.textContent = fmt(sub + (r.costo || 0));

    if (courierWrap) {
      var estabaVisible = !courierWrap.hidden;
      courierWrap.hidden = !r.courier;
      // Si el destino dejó de necesitar courier, la elección anterior ya no
      // corresponde y no debe viajar en el pedido.
      if (estabaVisible && !r.courier) limpiarTransporte();
      actualizarTransporteUi();
    }

    // El monto de la transferencia incluye el flete propio cuando aplica.
    if (payTransfer && !payTransfer.hidden) pintarBloquePago();
  }

  /* ======================== Empresa de transporte ======================== */

  function poblarCouriers() {
    if (!courierOptions) return;
    var opciones = couriers.concat(["otra"]);

    courierOptions.innerHTML = opciones
      .map(function (nombre) {
        var esOtra = nombre === "otra";
        return (
          '<label class="doc-option">' +
          '<input type="radio" name="transporte" value="' +
          esc(nombre) +
          '" />' +
          '<span class="doc-option__label">' +
          (esOtra ? "Otra empresa" : esc(nombre)) +
          "</span>" +
          "</label>"
        );
      })
      .join("");
  }

  function transporteSeleccionado() {
    var marcado = form.querySelector('input[name="transporte"]:checked');
    return marcado ? marcado.value : "";
  }

  /** Lo que finalmente se le informa a la empresa: el nombre, no el valor. */
  function transporteValor() {
    var elegido = transporteSeleccionado();
    if (!elegido) return "";
    if (elegido !== "otra") return elegido;
    var libre = (courierOtraInput.value || "").trim();
    return libre ? libre + " (por confirmar)" : "";
  }

  function limpiarTransporte() {
    form.querySelectorAll('input[name="transporte"]').forEach(function (radio) {
      radio.checked = false;
    });
    if (courierOtraInput) courierOtraInput.value = "";
  }

  function actualizarTransporteUi() {
    var visible = courierWrap && !courierWrap.hidden;
    var otra = visible && transporteSeleccionado() === "otra";

    if (courierOtraWrap) courierOtraWrap.hidden = !otra;
    if (courierOtraInput) courierOtraInput.required = otra;
    if (courierAviso) {
      courierAviso.textContent = otra ? textosEnvio.otraEmpresa || "" : "";
      courierAviso.hidden = !otra;
    }
  }

  /* ============================== Resumen ============================== */

  function pintarResumen() {
    if (finalizado || !window.AndesCart) return;
    var items = window.AndesCart.items();

    if (!items.length) {
      preciosCuenta = {};
      preciosFirma = "";
      subtotalCuenta = 0;
      if (itemsEl) itemsEl.innerHTML = "";
      if (subtotalEl) subtotalEl.textContent = fmt(0);
      if (totalEl) totalEl.textContent = fmt(0);
      if (envioEl) envioEl.textContent = "—";
      if (descuentoRow) descuentoRow.hidden = true;
      actualizarTituloEnvio();
      grid.hidden = true;
      blank.hidden = false;
      return;
    }

    blank.hidden = true;
    grid.hidden = false;

    refrescarPreciosCuenta(items);

    var listaSub = window.AndesCart.subtotal();
    var sub = subtotalPedido(items);
    if (!subtotalCuenta && Object.keys(preciosCuenta).length) {
      sub = items.reduce(function (acc, it) {
        return acc + precioLinea(it) * it.qty;
      }, 0);
      subtotalCuenta = sub;
    }

    itemsEl.innerHTML = items
      .map(function (it) {
        var tope = it.stock != null && it.stock > 0 ? it.stock : 99;
        var unit = precioLinea(it);
        return (
          '<article class="summary-item">' +
          (it.imagen
            ? '<img class="summary-item__img" src="' +
              esc(it.imagen) +
              '" alt="" width="52" height="52" loading="lazy" />'
            : '<div class="summary-item__img" aria-hidden="true"></div>') +
          '<div class="summary-item__info">' +
          '<p class="summary-item__title">' + esc(it.titulo) + "</p>" +
          (it.sku ? '<p class="summary-item__sku">' + esc(it.sku) + "</p>" : "") +
          '<div class="summary-item__controls">' +
          '<div class="cart-qty">' +
          '<button type="button" class="cart-qty__btn" data-co-action="menos" data-co-id="' +
          esc(it.id) +
          '" aria-label="Quitar una unidad">−</button>' +
          '<input class="cart-qty__input" type="number" min="1" max="' +
          tope +
          '" value="' +
          it.qty +
          '" data-co-qty="' +
          esc(it.id) +
          '" aria-label="Cantidad" />' +
          '<button type="button" class="cart-qty__btn" data-co-action="mas" data-co-id="' +
          esc(it.id) +
          '" aria-label="Agregar una unidad"' +
          (it.qty >= tope ? " disabled" : "") +
          ">+</button>" +
          "</div>" +
          '<button type="button" class="summary-item__remove" data-co-action="quitar" data-co-id="' +
          esc(it.id) +
          '">Quitar</button>' +
          "</div>" +
          "</div>" +
          '<p class="summary-item__total">' + fmt(unit * it.qty) + "</p>" +
          "</article>"
        );
      })
      .join("");

    var despacho = evaluarDespacho();
    subtotalEl.textContent = fmt(sub);
    if (envioEl) envioEl.textContent = despacho.resumen;
    totalEl.textContent = fmt(sub + (despacho.costo || 0));

    if (descuentoRow && descuentoEl) {
      var ahorro = Math.max(0, listaSub - sub);
      if (ahorro > 0) {
        descuentoRow.hidden = false;
        var u = window.AndesAuth && window.AndesAuth.usuario();
        var pct = u && Number(u.descuento_pct) > 0 ? u.descuento_pct + "% · " : "";
        if (descuentoLabel) descuentoLabel.textContent = "Descuento cuenta";
        descuentoEl.textContent = "−" + fmt(ahorro) + (pct ? " (" + pct.trim() + ")" : "");
      } else {
        descuentoRow.hidden = true;
      }
    }

    // Cambiar cantidades mueve el subtotal, y el subtotal decide tanto si se
    // cumple el mínimo para el despacho gratis como cuánto tiene que
    // transferir el cliente.
    actualizarTituloEnvio();
    pintarDespacho();
    if (payTransfer && !payTransfer.hidden) pintarBloquePago();
  }

  if (itemsEl) {
    itemsEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-co-action]");
      if (!btn || !window.AndesCart) return;
      var id = btn.getAttribute("data-co-id");
      var accion = btn.getAttribute("data-co-action");

      if (accion === "quitar") return window.AndesCart.quitar(id);

      var actual = 0;
      window.AndesCart.items().forEach(function (it) {
        if (it.id === id) actual = it.qty;
      });
      window.AndesCart.definirCantidad(id, accion === "mas" ? actual + 1 : actual - 1);
    });

    itemsEl.addEventListener("change", function (e) {
      var input = e.target.closest("[data-co-qty]");
      if (!input || !window.AndesCart) return;
      window.AndesCart.definirCantidad(input.getAttribute("data-co-qty"), input.value);
    });
  }

  /* =========================== Forma de pago =========================== */

  function metodoSeleccionado() {
    var marcado = form.querySelector('input[name="pago"]:checked');
    return marcado ? marcado.value : "transferencia";
  }

  /**
   * Con retiro no hay dirección que pedir, y con WhatsApp el despacho se
   * acuerda en el chat, así que tampoco bloqueamos al cliente con ella.
   */
  function requiereDireccion() {
    return !esRetiro() && metodoSeleccionado() === "transferencia";
  }

  function datosBancariosHtml(conMonto) {
    var banco = cfg.transferencia || {};
    var total = totalAPagar();
    var pares = conMonto
      ? [
          ["Monto a transferir", fmt(total)],
          ["Referencia", numeroPedido()],
        ]
      : [];

    return pares
      .concat([
        ["Titular", banco.titular],
        ["RUT", banco.rut],
        ["Banco", banco.banco],
        ["Tipo de cuenta", banco.tipoCuenta],
        ["Número de cuenta", banco.numeroCuenta],
        ["Correo para el comprobante", banco.email],
      ])
      .filter(function (par) {
        return par[1];
      })
      .map(function (par) {
        return "<dt>" + esc(par[0]) + "</dt><dd>" + esc(par[1]) + "</dd>";
      })
      .join("");
  }

  /** Los datos de la cuenta van en el formulario: se paga antes de confirmar. */
  function pintarBloquePago() {
    // Con el pedido cerrado el formulario ya no se ve, y repintarlo reservaría
    // una referencia nueva sin que nadie la haya pedido.
    if (finalizado) return;

    var lista = document.getElementById("bank-list-form");
    if (lista) lista.innerHTML = datosBancariosHtml(true);

    var monto = document.getElementById("pay-check-monto");
    if (monto) monto.textContent = fmt(totalAPagar());

    var antes = document.getElementById("pay-before-note");
    if (antes) antes.textContent = textosPago.antesDePagar || "";

    var reembolso = document.getElementById("pay-refund");
    if (reembolso) reembolso.textContent = textosPago.reembolso || "";
  }

  function actualizarRequisitos() {
    var metodo = metodoSeleccionado();
    var conDireccion = requiereDireccion();

    ["direccion", "region"].forEach(function (name) {
      var campo = form.elements[name];
      if (campo) campo.required = conDireccion;
    });
    var comuna = comunaControl();
    if (comuna) comuna.required = conDireccion;

    document.querySelectorAll("[data-req-envio]").forEach(function (el) {
      el.hidden = !conDireccion;
    });

    var transferencia = metodo === "transferencia";
    if (payTransfer) payTransfer.hidden = !transferencia;
    if (pagadoCheck) {
      pagadoCheck.required = transferencia;
      // Si se va a WhatsApp, la declaración de pago deja de tener sentido.
      if (!transferencia) pagadoCheck.checked = false;
    }
    if (transferencia) pintarBloquePago();

    submitBtn.textContent =
      metodo === "whatsapp"
        ? "Enviar el pedido por WhatsApp"
        : "Ya transferí, confirmar mi pedido";

    actualizarComprobanteUi();
  }

  /* ============================= Comprobante ============================= */

  var maxComprobanteMb = Number(cfgComprobante.maxMb) || 5;
  var maxComprobanteBytes = maxComprobanteMb * 1024 * 1024;

  function comprobanteHabilitado() {
    return cfgComprobante.habilitado !== false && !!fileInput;
  }

  function prepararComprobante() {
    if (!comprobanteHabilitado()) return;
    if (cfgComprobante.tipos) fileInput.accept = cfgComprobante.tipos;
    if (fileHint) {
      fileHint.textContent =
        "Foto o PDF de la transferencia, hasta " +
        maxComprobanteMb +
        " MB. Nos ahorra buscarla en la cuenta y agiliza tu despacho.";
    }
  }

  /** Pedir el comprobante antes de que declare el pago no tiene sentido. */
  function actualizarComprobanteUi() {
    if (!fileWrap) return;
    var mostrar =
      comprobanteHabilitado() &&
      payTransfer &&
      !payTransfer.hidden &&
      pagadoCheck &&
      pagadoCheck.checked;

    fileWrap.hidden = !mostrar;
    if (!mostrar && fileInput) fileInput.value = "";
  }

  function archivoComprobante() {
    if (!comprobanteHabilitado() || !fileWrap || fileWrap.hidden) return null;
    return fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
  }

  /** El adjunto viaja en base64 dentro del JSON del pedido. */
  function leerComprobante() {
    var file = archivoComprobante();
    if (!file) return Promise.resolve(null);

    return new Promise(function (resolve) {
      var lector = new FileReader();
      lector.onload = function () {
        var url = String(lector.result || "");
        var coma = url.indexOf(",");
        resolve(
          coma < 0
            ? null
            : { nombre: file.name, tipo: file.type, datos: url.slice(coma + 1) }
        );
      };
      // Si el archivo no se puede leer seguimos igual: el comprobante es
      // opcional y el pedido no se puede perder por eso.
      lector.onerror = function () {
        resolve(null);
      };
      lector.readAsDataURL(file);
    });
  }

  if (payOptions) {
    payOptions.addEventListener("change", function () {
      limpiarErrores();
      actualizarRequisitos();
    });

    // Un radio deshabilitado no emite eventos, por eso escuchamos la etiqueta.
    payOptions.querySelectorAll(".pay-option--soon").forEach(function (label) {
      label.addEventListener("click", function () {
        var nombre = label.getAttribute("data-soon") || "Este medio de pago";
        soonNote.hidden = false;
        soonNote.textContent =
          nombre +
          " todavía no está habilitado: estamos terminando la integración. " +
          "Mientras tanto puedes pagar por transferencia bancaria o coordinar por WhatsApp.";
      });
    });
  }

  /* ============================ Validación ============================ */

  function mostrarError(name, mensaje, elemento) {
    var campo = elemento || form.elements[name];
    var contenedor = campo && campo.closest ? campo.closest(".field") : null;
    var aviso = contenedor
      ? contenedor.querySelector(".field-error")
      : document.querySelector('[data-error-for="' + name + '"]');

    if (aviso) {
      aviso.textContent = mensaje;
      aviso.hidden = false;
    }
    // form.elements de un grupo de radios devuelve una RadioNodeList, que no
    // tiene setAttribute ni classList.
    if (campo && campo.setAttribute) {
      campo.setAttribute("aria-invalid", "true");
      campo.classList.add("is-invalid");
    }
    return campo;
  }

  function limpiarErrores() {
    document.querySelectorAll(".field-error").forEach(function (el) {
      el.hidden = true;
      el.textContent = "";
    });
    document.querySelectorAll(".is-invalid").forEach(function (el) {
      el.classList.remove("is-invalid");
      el.removeAttribute("aria-invalid");
    });
    errorEl.hidden = true;
    errorEl.textContent = "";
  }

  function leerDatos() {
    return {
      nombre: (form.elements.nombre.value || "").trim(),
      email: (form.elements.email.value || "").trim(),
      telefono: (form.elements.telefono.value || "").trim(),
      rut:
        documentoSeleccionado() === "factura"
          ? (form.elements.rut_factura.value || "").trim()
          : (form.elements.rut.value || "").trim(),
      documento: documentoSeleccionado(),
      razonSocial: (form.elements.razon_social.value || "").trim(),
      giro: (form.elements.giro.value || "").trim(),
      direccion: (form.elements.direccion.value || "").trim(),
      region: (form.elements.region.value || "").trim(),
      comuna: comunaValor(),
      notas: (form.elements.notas.value || "").trim(),
      entrega: entregaSeleccionada(),
      pagado: !!(pagadoCheck && pagadoCheck.checked),
      metodo: metodoSeleccionado(),
      despacho: evaluarDespacho(),
      transporte: transporteValor(),
      transporteAConfirmar: transporteSeleccionado() === "otra",
    };
  }

  function validar(datos) {
    limpiarErrores();
    var primero = null;

    function marcar(name, mensaje, elemento) {
      var campo = mostrarError(name, mensaje, elemento);
      if (!primero) primero = campo;
    }

    if (datos.nombre.length < 3) {
      marcar("nombre", "Escribe tu nombre y apellido.");
    }
    if (!emailValido(datos.email)) {
      marcar("email", "Revisa el correo: ahí te enviamos la confirmación.");
    }
    if (!telefonoValido(datos.telefono)) {
      marcar("telefono", "Necesitamos un teléfono de contacto válido.");
    }

    var esFactura = datos.documento === "factura";
    if (datos.rut || esFactura) {
      if (!rutValido(datos.rut)) {
        marcar(
          esFactura ? "rut_factura" : "rut",
          esFactura
            ? "Para la factura necesitamos el RUT de la empresa. Escríbelo como 76.123.456-7."
            : "El RUT no es válido. Escríbelo como 12345678-5.",
          esFactura ? form.elements.rut_factura : form.elements.rut
        );
      }
    }
    if (esFactura) {
      if (datos.razonSocial.length < 3) {
        marcar("razon_social", "Indica la razón social que va en la factura.");
      }
      if (datos.giro.length < 3) {
        marcar("giro", "Indica el giro de la empresa.");
      }
    }

    if (requiereDireccion()) {
      if (datos.direccion.length < 5) {
        marcar("direccion", "Indica la calle y el número del despacho.");
      }
      if (!datos.region) {
        marcar("region", "Selecciona tu región.");
      }
      if (datos.comuna.length < 3) {
        marcar("comuna", "Indica tu comuna.", comunaControl());
      }
    }

    if (datos.despacho.courier) {
      var elegido = transporteSeleccionado();
      if (!elegido) {
        marcar(
          "transporte",
          "Elige por qué empresa despachamos tu pedido.",
          form.querySelector('input[name="transporte"]')
        );
      } else if (elegido === "otra" && (form.elements.transporte_otra.value || "").trim().length < 3) {
        marcar("transporte_otra", "Escribe el nombre de la empresa de transporte.");
      }
    }

    // El pedido tiene que llegarnos ya pagado: esa es la razón de mostrar los
    // datos de la cuenta antes del botón y no después.
    if (datos.metodo === "transferencia" && !datos.pagado) {
      marcar(
        "pagado",
        "Transfiere con los datos de arriba y marca la casilla para confirmar tu pedido.",
        pagadoCheck
      );
    }

    var archivo = archivoComprobante();
    if (archivo && archivo.size > maxComprobanteBytes) {
      marcar(
        "comprobante",
        "El comprobante pesa más de " +
          maxComprobanteMb +
          " MB. Sube una foto más liviana o el PDF del banco.",
        fileInput
      );
    }

    if (primero && typeof primero.focus === "function") primero.focus();
    return primero === null;
  }

  /* ============================== Envío ============================== */

  function textoPedido(numero, datos, items, sub) {
    var lineas = [];
    lineas.push("Pedido " + numero);
    lineas.push("");
    items.forEach(function (it) {
      lineas.push(
        "• " +
          it.qty +
          "x " +
          it.titulo +
          (it.sku ? " [" + it.sku + "]" : "") +
          " — " +
          fmt(it.precio * it.qty)
      );
    });
    lineas.push("");
    lineas.push("Subtotal productos: " + fmt(sub));
    lineas.push(
      "Entrega: " +
        (datos.entrega === "retiro"
          ? "retira en " + (retiro.direccion || "nuestra dirección")
          : "envío a domicilio")
    );
    lineas.push("Despacho: " + datos.despacho.resumen);
    if (datos.despacho.costo > 0) {
      lineas.push("Costo despacho: " + fmt(datos.despacho.costo));
      lineas.push("Total a transferir: " + fmt(sub + datos.despacho.costo));
    }
    if (datos.transporte) lineas.push("Transporte: " + datos.transporte);
    lineas.push("");
    lineas.push("Cliente: " + datos.nombre);
    lineas.push("Correo: " + datos.email);
    lineas.push("Teléfono: " + datos.telefono);
    if (datos.documento === "factura") {
      lineas.push("Documento: factura");
      lineas.push("Razón social: " + datos.razonSocial);
      lineas.push("Giro: " + datos.giro);
      lineas.push("RUT: " + formatearRut(datos.rut));
    } else {
      lineas.push("Documento: boleta");
      if (datos.rut) lineas.push("RUT: " + formatearRut(datos.rut));
    }
    if (datos.entrega === "envio" && (datos.direccion || datos.comuna || datos.region)) {
      lineas.push(
        "Despacho a: " +
          [datos.direccion, datos.comuna, datos.region].filter(Boolean).join(", ")
      );
    }
    if (datos.notas) lineas.push("Comentarios: " + datos.notas);
    lineas.push("");
    if (datos.metodo === "whatsapp") {
      lineas.push("Forma de pago: por coordinar en este chat");
    } else {
      lineas.push("Forma de pago: transferencia bancaria");
      lineas.push(
        datos.pagado
          ? "*** El cliente declara que YA TRANSFIRIÓ. Verificar el abono. ***"
          : "Transferencia todavía pendiente."
      );
    }
    return lineas.join("\n");
  }

  /** Si la red se cuelga mostramos igual la confirmación: el cliente ya tiene
   *  su número de pedido y nunca debe quedarse esperando. */
  function conLimite(promesa, ms) {
    return Promise.race([
      promesa,
      new Promise(function (resolve) {
        window.setTimeout(function () {
          resolve(false);
        }, ms);
      }),
    ]);
  }

  function cuerpoPedido(numero, datos, items, comprobante) {
    var conEnvio = datos.entrega === "envio";
    return {
      numero: numero,
      cliente: {
        nombre: datos.nombre,
        email: datos.email,
        telefono: datos.telefono,
        rut: datos.rut ? formatearRut(datos.rut) : "",
        documento: datos.documento,
        razonSocial: datos.razonSocial,
        giro: datos.giro,
      },
      entrega: {
        modo: datos.entrega,
        direccion: conEnvio ? datos.direccion : "",
        comuna: conEnvio ? datos.comuna : "",
        region: conEnvio ? datos.region : "",
        despacho: datos.despacho.resumen,
        costo: datos.despacho.costo || 0,
        transporte: datos.transporte,
      },
      pago: { metodo: datos.metodo, declarado: datos.pagado },
      // El Worker recalcula el total con estos precios; no le mandamos el
      // subtotal ya sumado desde el navegador.
      items: items.map(function (it) {
        return {
          id: it.id,
          titulo: it.titulo,
          sku: it.sku,
          qty: it.qty,
          precio: it.precio,
        };
      }),
      notas: datos.notas,
      comprobante: comprobante,
    };
  }

  /**
   * Vía principal: el Worker guarda el pedido, le manda la copia al cliente y
   * nos avisa con el comprobante adjunto.
   */
  function enviarAlWorker(numero, datos, items, comprobante) {
    var base = String(cfgPedidos.workerUrl || "").replace(/\/+$/, "");
    if (!base) return Promise.resolve(false);

    var headers = { "Content-Type": "application/json" };
    if (window.AndesAuth && window.AndesAuth.token()) {
      headers.Authorization = "Bearer " + window.AndesAuth.token();
    }

    var envioRed = fetch(base + "/orders", {
      method: "POST",
      headers: headers,
      body: JSON.stringify(cuerpoPedido(numero, datos, items, comprobante)),
    })
      .then(function (res) {
        return res.ok;
      })
      .catch(function () {
        return false;
      });

    return conLimite(envioRed, comprobante ? 30000 : 12000);
  }

  /**
   * Respaldo. Web3Forms no le puede escribir al cliente ni recibir adjuntos
   * en el plan gratuito, pero si el Worker falla al menos el pedido nos
   * llega: una venta pagada que se pierde es plata.
   */
  function enviarPorWeb3Forms(numero, datos, resumen) {
    var key = contacto.web3formsAccessKey;
    if (!key) return Promise.resolve(false);

    var envioRed = fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        access_key: key,
        subject: "Nuevo pedido web " + numero,
        from_name: "Tienda Andes Auto Parts",
        numero_pedido: numero,
        nombre: datos.nombre,
        email: datos.email,
        telefono: datos.telefono,
        documento: datos.documento === "factura" ? "Factura" : "Boleta",
        rut: datos.rut ? formatearRut(datos.rut) : "",
        razon_social: datos.razonSocial,
        giro: datos.giro,
        direccion: datos.direccion,
        comuna: datos.comuna,
        region: datos.region,
        entrega: datos.entrega === "retiro" ? "Retiro en tienda" : "Envío a domicilio",
        despacho: datos.despacho.resumen,
        transporte: datos.transporte,
        forma_pago: datos.metodo === "whatsapp" ? "WhatsApp" : "Transferencia",
        pago_declarado: datos.pagado ? "SÍ, verificar abono" : "Pendiente",
        comentarios: datos.notas,
        pedido: resumen,
      }),
    })
      .then(function (res) {
        return res.ok;
      })
      .catch(function () {
        return false;
      });

    return conLimite(envioRed, 8000);
  }

  function enviarPedido(numero, datos, items, resumen, comprobante) {
    return enviarAlWorker(numero, datos, items, comprobante).then(function (ok) {
      return ok ? true : enviarPorWeb3Forms(numero, datos, resumen);
    });
  }

  function textoEntrega(datos) {
    if (datos.entrega === "retiro") {
      return (
        " Lo dejamos listo para retirar en " +
        (retiro.direccion || "nuestra dirección") +
        " y te avisamos cuando puedas venir."
      );
    }
    if (datos.despacho.estado === "gratis") {
      return (
        " El despacho a " +
        datos.comuna +
        " va sin costo. Si confirmaste antes de las 10:00 am, lo enviamos hoy entre " +
        "14:00 y 22:00; si fue después, mañana."
      );
    }
    if (datos.despacho.estado === "falta-monto" && datos.despacho.costo > 0) {
      return (
        " El envío a " +
        datos.comuna +
        " cuesta " +
        fmt(datos.despacho.costo) +
        " con IVA incluido, sumado al total a transferir."
      );
    }
    if (datos.despacho.courier) {
      var texto =
        " El envío va por pagar" +
        (datos.transporte ? " por " + datos.transporte.replace(" (por confirmar)", "") : "") +
        ": el flete lo pagas tú al retirar.";
      if (datos.transporteAConfirmar) {
        texto += " Escríbenos para confirmar que despachamos por esa empresa.";
      }
      return texto;
    }
    return "";
  }

  function mostrarConfirmacion(numero, datos, resumen) {
    finalizado = true;
    grid.hidden = true;
    blank.hidden = true;
    done.hidden = false;

    document.getElementById("done-order").textContent = numero;

    var entrega = textoEntrega(datos);
    var texto = document.getElementById("done-text");
    if (datos.metodo === "whatsapp") {
      texto.textContent =
        "Te abrimos WhatsApp con el detalle de tu pedido. Si no se abrió solo, " +
        "usa el botón de abajo: el mensaje ya viene escrito." +
        entrega;
    } else if (datos.pagado) {
      texto.textContent =
        "Guarda tu número de pedido. Ahora verificamos la transferencia y el " +
        "stock, y te confirmamos a " +
        datos.email +
        " o por WhatsApp." +
        entrega;
    } else {
      texto.textContent =
        "Guarda tu número de pedido y úsalo como referencia al transferir. " +
        "Avísanos con el comprobante por WhatsApp y lo preparamos." +
        entrega;
    }

    // Los datos bancarios ya se mostraron en el paso 3, antes de confirmar.
    // Si el cliente ya declaró el pago, repetirlos acá solo ensucia la pantalla.
    var bankCard = document.getElementById("bank-card");
    if (bankCard) {
      var mostrarBanco =
        datos.metodo === "transferencia" && !datos.pagado;
      if (mostrarBanco) {
        var lista = document.getElementById("bank-list");
        if (lista) lista.innerHTML = datosBancariosHtml(false);
      }
      bankCard.hidden = !mostrarBanco;
    }

    if (datos.metodo === "transferencia") {
      var reembolso = document.getElementById("done-refund");
      if (reembolso) {
        reembolso.textContent = textosPago.reembolso || "";
        reembolso.hidden = !reembolso.textContent;
      }
    }

    var wa = document.getElementById("done-wa");
    wa.href = "https://wa.me/" + waNumber + "?text=" + encodeURIComponent(resumen);
    wa.textContent =
      datos.metodo === "whatsapp"
        ? "Abrir WhatsApp con mi pedido"
        : "Enviar el comprobante por WhatsApp";

    // El siguiente pedido tiene que llevar una referencia nueva.
    liberarNumeroPedido();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!window.AndesCart) return;

      var items = window.AndesCart.items();
      if (!items.length) {
        pintarResumen();
        return;
      }

      var datos = leerDatos();
      if (!validar(datos)) {
        errorEl.hidden = false;
        errorEl.textContent = "Revisa los campos marcados para poder continuar.";
        return;
      }

      var sub = subtotalPedido(items);
      // El mismo número que ya vio como referencia de la transferencia.
      var numero = numeroPedido();
      var resumen = textoPedido(numero, datos, items, sub);

      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando…";

      // WhatsApp se abre de inmediato: si esperamos la respuesta de la red,
      // el navegador bloquea la ventana por no venir de un clic directo.
      if (datos.metodo === "whatsapp") {
        window.open(
          "https://wa.me/" + waNumber + "?text=" + encodeURIComponent(resumen),
          "_blank",
          "noopener"
        );
      }

      leerComprobante()
        .then(function (comprobante) {
          return enviarPedido(numero, datos, items, resumen, comprobante);
        })
        .then(function () {
          mostrarConfirmacion(numero, datos, resumen);
          window.AndesCart.vaciar();
          submitBtn.disabled = false;
          actualizarRequisitos();
        });
    });

    form.addEventListener("change", function (e) {
      if (!e.target.name) return;
      if (e.target.name === "documento") {
        limpiarErrores();
        actualizarDocumentoUi();
        return;
      }
      if (e.target.name === "entrega") {
        limpiarErrores();
        actualizarEntregaUi();
        actualizarRequisitos();
        pintarDespacho();
        return;
      }
      if (e.target.name === "pagado") {
        limpiarErrores();
        actualizarComprobanteUi();
        return;
      }
      if (e.target.name === "comprobante") {
        limpiarErrores();
        return;
      }
      if (e.target.name === "region") {
        actualizarComunaUi();
        actualizarRequisitos();
        pintarDespacho();
        return;
      }
      if (e.target.name === "transporte") {
        limpiarErrores();
        actualizarTransporteUi();
        return;
      }
      if (e.target.name === "comuna" || e.target.name === "comuna_rm") {
        pintarDespacho();
      }
    });

    // La comuna libre se escribe, no se selecciona: reaccionamos al tipeo.
    if (comunaLibreInput) {
      comunaLibreInput.addEventListener("input", pintarDespacho);
    }
  }

  /* ============================= Arranque ============================= */

  var year = document.getElementById("year");
  function precargarPerfil(u) {
    if (!form || !u) return;

    function setSiVacio(id, valor) {
      var el = document.getElementById(id);
      if (!el || valor == null || valor === "") return;
      if (String(el.value || "").trim()) return;
      el.value = valor;
    }

    setSiVacio("co-nombre", u.nombre);
    setSiVacio("co-email", u.email);
    setSiVacio("co-telefono", u.telefono);
    setSiVacio("co-rut", u.rut);
    setSiVacio("co-rut-factura", u.rut);
    setSiVacio("co-razon", u.razon_social);
    setSiVacio("co-giro", u.giro);
    setSiVacio("co-direccion", u.direccion);

    var regionEl = document.getElementById("co-region");
    if (regionEl && u.region && !String(regionEl.value || "").trim()) {
      var match = Array.prototype.find.call(regionEl.options, function (opt) {
        return norm(opt.value) === norm(u.region) || norm(opt.text) === norm(u.region);
      });
      if (match) regionEl.value = match.value;
      else regionEl.value = u.region;
      actualizarComunaUi();
    }

    if (u.comuna) {
      var rm = document.getElementById("co-comuna-rm");
      var libre = document.getElementById("co-comuna");
      if (rm && !rm.value) {
        var opt = Array.prototype.find.call(rm.options, function (o) {
          return norm(o.value) === norm(u.comuna);
        });
        if (opt) rm.value = opt.value;
        else if (libre && !libre.value) libre.value = u.comuna;
      } else if (libre && !libre.value) {
        libre.value = u.comuna;
      }
    }

    if (u.documento === "factura" || u.documento === "boleta") {
      var radio = form.querySelector('input[name="documento"][value="' + u.documento + '"]');
      if (radio && !form.querySelector('input[name="documento"]:checked')) {
        radio.checked = true;
        actualizarDocumentoUi();
      }
    }

    actualizarRequisitos();
    pintarDespacho();
  }

  if (year) year.textContent = new Date().getFullYear();

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var abierto = document.querySelector(".site-header").classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", abierto ? "true" : "false");
    });
  }

  // El monto mínimo y las empresas de transporte los manda la configuración,
  // no el texto del HTML.
  var minimoEl = document.getElementById("envio-minimo");
  if (minimoEl && Number(envio.montoMinimoGratis) > 0) {
    minimoEl.textContent = fmt(Number(envio.montoMinimoGratis));
  }
  var couriersEl = document.getElementById("envio-couriers");
  if (couriersEl) couriersEl.textContent = couriersTexto();

  if (form) {
    poblarComunasRM();
    poblarCouriers();
    prepararComprobante();
    pintarRetiro();
    actualizarEntregaUi();
    actualizarComunaUi();
    actualizarDocumentoUi();
    actualizarRequisitos();
    pintarDespacho();
  }

  if (window.AndesCart) {
    window.AndesCart.onChange(function () {
      preciosFirma = "";
      preciosCargando = false;
      subtotalCuenta = 0;
      pintarResumen();
    });
    pintarResumen();
  }

  if (window.AndesAuth) {
    var uLocal = window.AndesAuth.usuario();
    if (uLocal) precargarPerfil(uLocal);
    window.AndesAuth.onChange(function (u) {
      preciosFirma = "";
      if (u) precargarPerfil(u);
      pintarResumen();
    });
    if (window.AndesAuth.haySesion()) {
      window.AndesAuth.refrescarYo().then(function (u) {
        if (u) precargarPerfil(u);
        preciosFirma = "";
        pintarResumen();
      });
    }
  }
})();
