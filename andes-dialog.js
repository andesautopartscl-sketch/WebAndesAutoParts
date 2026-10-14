/**
 * Avisos del sitio. Sustituye alert, confirm y prompt del navegador.
 */
(function () {
  "use strict";

  var abierto = null;

  function css() {
    if (document.getElementById("andes-dialog-css")) return;
    var style = document.createElement("style");
    style.id = "andes-dialog-css";
    style.textContent =
      ".andes-dialog{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(12,22,40,.55);backdrop-filter:blur(4px);font-family:\"Plus Jakarta Sans\",system-ui,sans-serif}" +
      ".andes-dialog[hidden]{display:none}" +
      ".andes-dialog__card{width:min(100%,420px);background:#fff;color:#1a2b4b;border-radius:18px;padding:1.35rem 1.3rem 1.15rem;box-shadow:0 24px 60px rgba(8,18,36,.28);animation:andes-dialog-in .22s ease-out}" +
      "@keyframes andes-dialog-in{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}" +
      ".andes-dialog__icon{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:.85rem}" +
      ".andes-dialog__icon--primary{background:#e8eef8;color:#1a2b4b}" +
      ".andes-dialog__icon--danger{background:#fdecea;color:#c62828}" +
      ".andes-dialog__title{margin:0 0 .4rem;font-size:1.15rem;font-weight:800;letter-spacing:-.02em}" +
      ".andes-dialog__text{margin:0 0 1rem;font-size:.95rem;line-height:1.5;color:#4b5568}" +
      ".andes-dialog__input{width:100%;box-sizing:border-box;margin:0 0 1rem;padding:.7rem .8rem;border:1px solid #d5deea;border-radius:.7rem;font:inherit;font-size:.95rem;color:#1a2b4b}" +
      ".andes-dialog__input:focus{outline:2px solid #1a2b4b;outline-offset:1px}" +
      ".andes-dialog__actions{display:flex;justify-content:flex-end;gap:.5rem}" +
      ".andes-dialog__btn{appearance:none;border:0;border-radius:999px;padding:.65rem 1.05rem;font:inherit;font-size:.9rem;font-weight:700;cursor:pointer}" +
      ".andes-dialog__btn--ghost{background:#fff;color:#1a2b4b;box-shadow:inset 0 0 0 1px #cfd8e6}" +
      ".andes-dialog__btn--primary{background:#1a2b4b;color:#fff}" +
      ".andes-dialog__btn--danger{background:#c62828;color:#fff}" +
      ".andes-dialog__btn:focus-visible{outline:2px solid #1a2b4b;outline-offset:2px}" +
      "@media (prefers-reduced-motion:reduce){.andes-dialog__card{animation:none}}";
    document.head.appendChild(style);
  }

  function icono(tono) {
    if (tono === "danger") {
      return (
        '<span class="andes-dialog__icon andes-dialog__icon--danger" aria-hidden="true">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 4.8 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.8a2 2 0 0 0-3.4 0z"/></svg></span>'
      );
    }
    return (
      '<span class="andes-dialog__icon andes-dialog__icon--primary" aria-hidden="true">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg></span>'
    );
  }

  function cerrar(valor) {
    if (!abierto) return;
    var actual = abierto;
    abierto = null;
    document.removeEventListener("keydown", actual.onKey);
    document.body.style.overflow = actual.overflow;
    if (actual.root.parentNode) actual.root.parentNode.removeChild(actual.root);
    actual.finish(valor);
  }

  function abrir(opciones) {
    css();
    if (abierto) cerrar(opciones.tipo === "alert" ? undefined : null);
    return new Promise(function (resolve) {
      var tono = opciones.tono === "danger" ? "danger" : "primary";
      var root = document.createElement("div");
      root.className = "andes-dialog";
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("aria-labelledby", "andes-dialog-title");

      var acciones =
        '<button type="button" class="andes-dialog__btn andes-dialog__btn--' +
        tono +
        '" data-dialog-ok>' +
        (opciones.confirmar || "Aceptar") +
        "</button>";
      if (opciones.tipo !== "alert") {
        acciones =
          '<button type="button" class="andes-dialog__btn andes-dialog__btn--ghost" data-dialog-cancel>' +
          (opciones.cancelar || "Cancelar") +
          "</button>" +
          acciones;
      }

      var campo = "";
      if (opciones.tipo === "prompt") {
        campo =
          '<input class="andes-dialog__input" id="andes-dialog-input" ' +
          (opciones.inputType === "password" ? 'type="password" autocomplete="off"' : 'type="text"') +
          ' placeholder="' +
          String(opciones.placeholder || "").replace(/"/g, "&quot;") +
          '">';
      }

      root.innerHTML =
        '<div class="andes-dialog__card">' +
        icono(tono) +
        '<h2 class="andes-dialog__title" id="andes-dialog-title"></h2>' +
        '<p class="andes-dialog__text"></p>' +
        campo +
        '<div class="andes-dialog__actions">' +
        acciones +
        "</div></div>";

      root.querySelector(".andes-dialog__title").textContent = opciones.titulo || "Aviso";
      root.querySelector(".andes-dialog__text").textContent = opciones.mensaje || "";

      var overflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.body.appendChild(root);

      function finish(valor) {
        resolve(valor);
      }

      function onKey(e) {
        if (e.key === "Escape") {
          e.preventDefault();
          cerrar(opciones.tipo === "alert" ? undefined : null);
          return;
        }
        if (e.key === "Enter" && e.target && e.target.tagName !== "TEXTAREA") {
          e.preventDefault();
          if (opciones.tipo === "prompt") {
            var input = root.querySelector("#andes-dialog-input");
            cerrar(input ? input.value : "");
            return;
          }
          cerrar(opciones.tipo === "alert" ? undefined : true);
        }
      }

      abierto = { root: root, onKey: onKey, overflow: overflow, finish: finish };
      document.addEventListener("keydown", onKey);

      root.addEventListener("click", function (e) {
        if (e.target === root || e.target.closest("[data-dialog-cancel]")) {
          cerrar(opciones.tipo === "alert" ? undefined : null);
          return;
        }
        if (e.target.closest("[data-dialog-ok]")) {
          if (opciones.tipo === "prompt") {
            var input = root.querySelector("#andes-dialog-input");
            cerrar(input ? input.value : "");
            return;
          }
          cerrar(opciones.tipo === "alert" ? undefined : true);
        }
      });

      var foco = root.querySelector(opciones.tipo === "prompt" ? "#andes-dialog-input" : "[data-dialog-ok]");
      if (foco) foco.focus();
    });
  }

  window.AndesDialog = {
    alert: function (opciones) {
      opciones = opciones || {};
      opciones.tipo = "alert";
      return abrir(opciones);
    },
    confirm: function (opciones) {
      opciones = opciones || {};
      opciones.tipo = "confirm";
      return abrir(opciones);
    },
    prompt: function (opciones) {
      opciones = opciones || {};
      opciones.tipo = "prompt";
      return abrir(opciones);
    },
  };
})();
