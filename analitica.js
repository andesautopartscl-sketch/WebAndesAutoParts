/**
 * Medición propia del sitio. No envía correo ni IP.
 * El id de visitante vive en este navegador.
 */
(function () {
  "use strict";

  var VISITANTE_KEY = "andes_visitante_v1";
  var SESION_KEY = "andes_sesion_analitica";
  var inicio = Date.now();
  var acumulado = 0;
  var tiempoEnviado = false;
  var ultimaBusqueda = "";
  var timerBusqueda = null;

  function workerBase() {
    var cfg = window.ANDES_PEDIDOS || {};
    var url = String(cfg.workerUrl || "").replace(/\/+$/, "");
    return url || "https://andes-autoparts-ml-sync.andesautoparts.workers.dev";
  }

  function idEn(storage, key) {
    try {
      var actual = storage.getItem(key);
      if (actual && actual.length >= 8) return actual;
      var nuevo = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random())
        .replace(/-/g, "");
      storage.setItem(key, nuevo);
      return nuevo;
    } catch (err) {
      return "";
    }
  }

  function dispositivo() {
    var w = window.innerWidth || 1200;
    if (w < 760) return "móvil";
    if (w < 1100) return "tablet";
    return "escritorio";
  }

  function origen() {
    var ref = document.referrer || "";
    if (!ref || /andesautoparts/i.test(ref)) return "";
    return ref;
  }

  function paginaPropia() {
    return /cuenta\.html|renovar-token|editor-catalogo/i.test(location.pathname);
  }

  function enviar(extra, beacon) {
    var visitante = idEn(localStorage, VISITANTE_KEY);
    var sesion = idEn(sessionStorage, SESION_KEY);
    if (!visitante || !sesion) return;
    var cuerpo = {
      visitante: visitante,
      sesion: sesion,
      path: (location.pathname || "/") + (location.hash || ""),
      titulo: document.title || "",
      referrer: origen(),
      dispositivo: dispositivo(),
    };
    if (extra) {
      Object.keys(extra).forEach(function (k) {
        cuerpo[k] = extra[k];
      });
    }
    var url = workerBase() + "/analitica/evento";
    var raw = JSON.stringify(cuerpo);
    if (beacon && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(url, new Blob([raw], { type: "application/json" }));
        return;
      } catch (err) {
        /* sigue con fetch */
      }
    }
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw,
      keepalive: true,
    }).catch(function () {});
  }

  function msVisibles() {
    var extra = document.visibilityState === "hidden" ? 0 : Date.now() - inicio;
    return acumulado + extra;
  }

  function enviarTiempo() {
    if (tiempoEnviado || paginaPropia()) return;
    tiempoEnviado = true;
    var ms = msVisibles();
    if (ms < 1000) return;
    enviar({ tipo: "tiempo", duracion_ms: Math.min(ms, 30 * 60 * 1000) }, true);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") acumulado += Date.now() - inicio;
    else inicio = Date.now();
  });
  window.addEventListener("pagehide", enviarTiempo);

  if (!paginaPropia()) {
    enviar({ tipo: "page" });
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a") : null;
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (/wa\.me|api\.whatsapp|whatsapp/i.test(href)) {
      enviar({ tipo: "whatsapp", titulo: "WhatsApp" });
      return;
    }
    if (/mercadolibre\./i.test(href)) {
      var card = a.closest("article");
      var tituloEl = card && card.querySelector(".producto-titulo, h3");
      var titulo = tituloEl ? tituloEl.textContent.trim() : a.getAttribute("aria-label") || "";
      var idMatch = href.match(/ML[A-Z]-?\d+/i);
      enviar({
        tipo: "producto",
        producto_id: idMatch ? idMatch[0].replace("-", "") : "",
        producto_titulo: titulo.replace(/^Ver en Mercado Libre:\s*/i, ""),
        path: href.slice(0, 300),
      });
    }
  });

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || form.id !== "vehicle-search-form") return;
    var input = document.getElementById("vehicle-search-text");
    var q = input ? input.value.trim() : "";
    if (q.length < 2) return;
    enviar({ tipo: "busqueda", titulo: q.slice(0, 80) });
  });

  document.addEventListener("input", function (e) {
    if (!e.target || e.target.id !== "catalogo-search") return;
    var q = e.target.value.trim();
    clearTimeout(timerBusqueda);
    timerBusqueda = setTimeout(function () {
      if (q.length < 2 || q === ultimaBusqueda) return;
      ultimaBusqueda = q;
      enviar({ tipo: "busqueda", titulo: q.slice(0, 80) });
    }, 900);
  });

  window.AndesAnalitica = { evento: enviar };
})();
