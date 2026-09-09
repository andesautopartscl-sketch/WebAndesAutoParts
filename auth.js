/**
 * Sesión de cliente / vendedor (correo + clave).
 * Token en localStorage; el Worker autentica con Authorization Bearer.
 */
(function () {
  "use strict";

  var TOKEN_KEY = "andes_sesion_v1";
  var USER_KEY = "andes_usuario_v1";
  var ACTIVITY_KEY = "andes_actividad_v1";
  var IDLE_MS = 10 * 60 * 1000;
  var listeners = [];
  var idleTimer = null;
  var lastActivityTouch = 0;

  function workerBase() {
    var cfg = window.ANDES_PEDIDOS || {};
    return String(cfg.workerUrl || "").replace(/\/+$/, "");
  }

  function leerToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch (err) {
      return "";
    }
  }

  function leerUsuario() {
    try {
      var raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function guardarSesion(token, usuario) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
      if (usuario) localStorage.setItem(USER_KEY, JSON.stringify(usuario));
      else localStorage.removeItem(USER_KEY);
      if (!token) localStorage.removeItem(ACTIVITY_KEY);
    } catch (err) {
      /* modo privado */
    }
    avisar();
    if (token) tocarActividad(true);
    else limpiarIdle();
  }

  function limpiarIdle() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function tocarActividad(forzar) {
    if (!leerToken()) {
      limpiarIdle();
      return;
    }
    var ahora = Date.now();
    if (!forzar && ahora - lastActivityTouch < 12000) return;
    lastActivityTouch = ahora;
    try {
      localStorage.setItem(ACTIVITY_KEY, String(ahora));
    } catch (err) {
      /* noop */
    }
    limpiarIdle();
    idleTimer = window.setTimeout(function () {
      if (!leerToken()) return;
      logout().then(function () {
        cerrarMenu();
        if (typeof abrirModal === "function") abrirModal("login");
      });
    }, IDLE_MS);
  }

  function chequearIdleAlCargar() {
    if (!leerToken()) return;
    var last = 0;
    try {
      last = Number(localStorage.getItem(ACTIVITY_KEY) || 0);
    } catch (err) {
      last = 0;
    }
    if (last && Date.now() - last > IDLE_MS) {
      logout();
      return;
    }
    tocarActividad(true);
  }

  function avisar() {
    listeners.forEach(function (cb) {
      try {
        cb(leerUsuario(), leerToken());
      } catch (err) {
        /* noop */
      }
    });
    pintarHeader();
    if (menuEl && !menuEl.hidden) pintarMenu();
  }

  function api(path, opciones) {
    var base = workerBase();
    if (!base) return Promise.reject(new Error("API no configurada"));

    var opts = opciones || {};
    var headers = Object.assign(
      { Accept: "application/json" },
      opts.headers || {}
    );
    if (opts.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    var token = leerToken();
    if (token) headers.Authorization = "Bearer " + token;

    return fetch(base + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      return res.json().then(function (data) {
        data._status = res.status;
        data._ok = res.ok;
        return data;
      });
    });
  }

  function registrar(datos) {
    return api("/auth/registro", { method: "POST", body: datos }).then(function (data) {
      if (data.ok && data.token) {
        guardarSesion(data.token, data.usuario);
        return fusionarCarrito().then(function () {
          return data;
        });
      }
      return data;
    });
  }

  function login(datos) {
    return api("/auth/login", { method: "POST", body: datos }).then(function (data) {
      if (data.ok && data.token) {
        guardarSesion(data.token, data.usuario);
        return fusionarCarrito().then(function () {
          return data;
        });
      }
      return data;
    });
  }

  function logout() {
    return api("/auth/logout", { method: "POST" })
      .catch(function () {
        return {};
      })
      .then(function () {
        guardarSesion("", null);
      });
  }

  function refrescarYo() {
    if (!leerToken()) return Promise.resolve(null);
    return api("/auth/yo").then(function (data) {
      if (data.ok && data.usuario) {
        guardarSesion(leerToken(), data.usuario);
        return data.usuario;
      }
      if (data._status === 401) guardarSesion("", null);
      return null;
    });
  }

  function actualizarYo(datos) {
    return api("/auth/yo", { method: "PATCH", body: datos }).then(function (data) {
      if (data.ok && data.usuario) guardarSesion(leerToken(), data.usuario);
      return data;
    });
  }

  function fusionarCarrito() {
    if (!window.AndesCart || !leerToken()) return Promise.resolve();
    var items = window.AndesCart.items();
    return api("/cart/merge", { method: "POST", body: { items: items } }).then(function (data) {
      if (data.ok && Array.isArray(data.items) && window.AndesCart.reemplazar) {
        window.AndesCart.reemplazar(data.items);
      }
      return data;
    });
  }

  function sincronizarCarrito() {
    if (!window.AndesCart || !leerToken()) return Promise.resolve();
    return api("/cart", {
      method: "PUT",
      body: { items: window.AndesCart.items() },
    });
  }

  function resolverPrecios(items) {
    if (!leerToken() || !items || !items.length) {
      return Promise.resolve({ ok: true, descuento_pct: 0, items: [] });
    }
    return api("/pricing/resolver", {
      method: "POST",
      body: {
        items: items.map(function (it) {
          return { id: it.id, precio: it.precio };
        }),
      },
    });
  }

  function prefijoRutas() {
    try {
      return /\/admin\//.test(location.pathname) ? "../" : "";
    } catch (err) {
      return "";
    }
  }

  var ICONO_USUARIO =
    '<svg class="header-account__icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<circle cx="12" cy="12" r="10.25" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
    '<circle cx="12" cy="9" r="3.15" fill="currentColor"/>' +
    '<path d="M6.2 18.6c1.35-2.55 3.35-3.85 5.8-3.85s4.45 1.3 5.8 3.85" fill="currentColor"/>' +
    "</svg>";

  var ICONO_CHEVRON =
    '<svg class="account-menu__chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>';

  var ICONO_CARET =
    '<svg class="header-account__caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  var modalEl = null;
  var menuEl = null;
  var lastFocus = null;
  var turnstileIds = { login: null, registro: null };
  var turnstileScriptPromise = null;

  function turnstileSiteKey() {
    var cfg = window.ANDES_TURNSTILE || {};
    return String(cfg.siteKey || "").trim();
  }

  function cargarTurnstile() {
    if (!turnstileSiteKey()) return Promise.resolve(null);
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileScriptPromise) return turnstileScriptPromise;
    turnstileScriptPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = function () {
        resolve(window.turnstile || null);
      };
      s.onerror = function () {
        reject(new Error("No se pudo cargar Turnstile"));
      };
      document.head.appendChild(s);
    });
    return turnstileScriptPromise;
  }

  function tokenTurnstile(widgetId) {
    if (!window.turnstile || widgetId == null) return "";
    try {
      return window.turnstile.getResponse(widgetId) || "";
    } catch (err) {
      return "";
    }
  }

  function resetTurnstile(cual) {
    if (!window.turnstile) return;
    var id = turnstileIds[cual];
    if (id == null) return;
    try {
      window.turnstile.reset(id);
    } catch (err) {
      /* noop */
    }
  }

  function montarTurnstile(cual) {
    var key = turnstileSiteKey();
    if (!key) return Promise.resolve();
    var el = document.getElementById("auth-turnstile-" + cual);
    if (!el) return Promise.resolve();
    return cargarTurnstile()
      .then(function (ts) {
        if (!ts) return;
        if (turnstileIds[cual] != null) {
          try {
            ts.reset(turnstileIds[cual]);
          } catch (err) {
            /* noop */
          }
          return;
        }
        turnstileIds[cual] = ts.render(el, {
          sitekey: key,
          theme: "light",
          language: "es",
        });
      })
      .catch(function () {
        /* si falla el script, el Worker puede estar sin secreto y deja pasar */
      });
  }

  function esStaff(u) {
    return u && (u.rol === "vendedor" || u.rol === "admin");
  }

  function pintarHeader() {
    var slots = document.querySelectorAll("[data-auth-slot]");
    if (!slots.length) return;
    var u = leerUsuario();
    slots.forEach(function (el) {
      el.classList.add("header-account-wrap");
      if (u) {
        var nombre = (u.nombre || u.email || "cuenta").trim();
        var corto = nombre.split(" ")[0];
        el.innerHTML =
          '<button type="button" class="header-account is-logged" data-auth-menu aria-haspopup="menu" aria-expanded="false" aria-label="Mi cuenta">' +
          ICONO_USUARIO +
          '<span class="header-account__text">' +
          '<span class="header-account__hola">¡Hola! ' +
          esc(corto) +
          "</span>" +
          '<span class="header-account__sub">Mi cuenta ' +
          ICONO_CARET +
          "</span>" +
          "</span>" +
          "</button>";
      } else {
        el.innerHTML =
          '<button type="button" class="header-account" data-auth-open aria-haspopup="dialog" aria-label="Inicia sesión">' +
          ICONO_USUARIO +
          '<span class="header-account__text">' +
          '<span class="header-account__hola">¡Hola!</span>' +
          '<span class="header-account__sub">Inicia sesión</span>' +
          "</span>" +
          "</button>";
      }
    });
    cerrarMenu();
  }

  function itemMenu(href, label) {
    return (
      '<a class="account-menu__item" href="' +
      esc(href) +
      '"><span>' +
      esc(label) +
      "</span>" +
      ICONO_CHEVRON +
      "</a>"
    );
  }

  function asegurarMenu() {
    if (menuEl) return menuEl;
    menuEl = document.createElement("div");
    menuEl.className = "account-menu";
    menuEl.id = "andes-account-menu";
    menuEl.hidden = true;
    menuEl.setAttribute("role", "menu");
    document.body.appendChild(menuEl);
    return menuEl;
  }

  function pintarMenu() {
    var menu = asegurarMenu();
    var u = leerUsuario();
    var base = prefijoRutas();
    if (!u) {
      menu.hidden = true;
      return;
    }
    var sub = u.rut || u.email || "";
    var items =
      itemMenu(base + "cuenta.html#datos", "Mi cuenta") +
      itemMenu(base + "cuenta.html#compras", "Mis compras") +
      itemMenu(base + "cuenta.html#favoritos", "Productos favoritos") +
      itemMenu(base + "checkout.html", "Mi carrito");
    if (esStaff(u)) {
      items +=
        '<div class="account-menu__sep"></div>' +
        itemMenu(base + "cuenta.html#clientes", "Central de clientes");
    }
    items +=
      '<div class="account-menu__sep"></div>' +
      '<button type="button" class="account-menu__item account-menu__item--btn" data-auth-logout role="menuitem">' +
      "<span>Cerrar sesión</span>" +
      ICONO_CHEVRON +
      "</button>";

    menu.innerHTML =
      '<div class="account-menu__head">' +
      '<p class="account-menu__name">' +
      esc(u.nombre || "Cliente") +
      "</p>" +
      '<p class="account-menu__id">' +
      esc(sub) +
      "</p>" +
      (Number(u.descuento_pct) > 0
        ? '<p class="account-menu__badge">Descuento ' +
          esc(String(u.descuento_pct)) +
          "%</p>"
        : "") +
      "</div>" +
      '<div class="account-menu__list">' +
      items +
      "</div>";
  }

  function posicionarMenu(trigger) {
    var menu = asegurarMenu();
    var rect = trigger.getBoundingClientRect();
    var ancho = Math.max(260, Math.min(300, window.innerWidth - 24));
    var left = Math.min(
      rect.right - ancho,
      window.innerWidth - ancho - 12
    );
    left = Math.max(12, left);
    var top = rect.bottom + 10;
    menu.style.width = ancho + "px";
    menu.style.left = left + "px";
    menu.style.top = top + "px";
  }

  function abrirMenu(trigger) {
    pintarMenu();
    var menu = asegurarMenu();
    posicionarMenu(trigger || document.querySelector("[data-auth-menu]"));
    menu.hidden = false;
    document.querySelectorAll("[data-auth-menu]").forEach(function (btn) {
      btn.setAttribute("aria-expanded", "true");
      btn.classList.add("is-open");
    });
  }

  function cerrarMenu() {
    if (!menuEl) return;
    menuEl.hidden = true;
    document.querySelectorAll("[data-auth-menu]").forEach(function (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("is-open");
    });
  }

  function toggleMenu(trigger) {
    if (menuEl && !menuEl.hidden) cerrarMenu();
    else abrirMenu(trigger);
  }

  function asegurarModal() {
    if (modalEl) return modalEl;
    var base = prefijoRutas();
    var img = base + "images/hero/hero-2.jpg";
    modalEl = document.createElement("div");
    modalEl.className = "auth-modal";
    modalEl.id = "andes-auth-modal";
    modalEl.hidden = true;
    modalEl.setAttribute("role", "dialog");
    modalEl.setAttribute("aria-modal", "true");
    modalEl.setAttribute("aria-labelledby", "auth-modal-title");
    modalEl.innerHTML =
      '<div class="auth-modal__backdrop" data-auth-close tabindex="-1"></div>' +
      '<div class="auth-modal__dialog">' +
      '<div class="auth-modal__media" aria-hidden="true" style="background-image:url(\'' +
      esc(img) +
      "')\"></div>" +
      '<div class="auth-modal__panel">' +
      '<button type="button" class="auth-modal__close" data-auth-close aria-label="Cerrar">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
      "</button>" +
      '<div class="auth-modal__brand">' +
      '<img src="' +
      esc(base + "logo_andes.png") +
      '" alt="Andes Auto Parts" width="150" height="36" />' +
      "</div>" +
      '<div data-auth-pane="login">' +
      '<h2 class="auth-modal__title" id="auth-modal-title">Inicia Sesión</h2>' +
      '<p class="auth-modal__lead">Accede a una experiencia de compra personalizada y ofertas exclusivas.</p>' +
      '<form class="account-form auth-modal__form" id="auth-modal-login" autocomplete="on">' +
      '<div class="field"><label class="visually-hidden" for="auth-login-email">Correo</label>' +
      '<input type="email" id="auth-login-email" name="email" required autocomplete="email" placeholder="Correo electrónico" /></div>' +
      '<div class="field field--password">' +
      '<label class="visually-hidden" for="auth-login-clave">Clave</label>' +
      '<input type="password" id="auth-login-clave" name="clave" required minlength="8" autocomplete="current-password" placeholder="Contraseña" />' +
      '<button type="button" class="auth-modal__eye" data-auth-eye="auth-login-clave" aria-label="Mostrar contraseña">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>' +
      "</button></div>" +
      '<div class="auth-modal__captcha" id="auth-turnstile-login"></div>' +
      '<p class="auth-modal__forgot">¿Olvidaste tu contraseña? <span>Escríbenos por WhatsApp</span></p>' +
      '<p class="account-error" id="auth-login-error" hidden></p>' +
      '<button type="submit" class="btn btn-primary btn-lg auth-modal__submit">Iniciar Sesión</button>' +
      "</form>" +
      '<div class="auth-modal__divider"></div>' +
      '<p class="auth-modal__switch-q">¿No tienes una cuenta?</p>' +
      '<button type="button" class="btn auth-modal__ghost" data-auth-tab="registro">Crear una cuenta</button>' +
      "</div>" +
      '<div data-auth-pane="registro" hidden>' +
      '<h2 class="auth-modal__title">Crear una cuenta</h2>' +
      '<p class="auth-modal__lead">Guarda tus datos y tu carrito para el próximo pedido.</p>' +
      '<form class="account-form auth-modal__form" id="auth-modal-registro" autocomplete="on">' +
      '<div class="field"><label class="visually-hidden" for="auth-reg-nombre">Nombre</label>' +
      '<input type="text" id="auth-reg-nombre" name="nombre" required minlength="2" autocomplete="name" placeholder="Nombre y apellido" /></div>' +
      '<div class="field"><label class="visually-hidden" for="auth-reg-email">Correo</label>' +
      '<input type="email" id="auth-reg-email" name="email" required autocomplete="email" placeholder="Correo electrónico" /></div>' +
      '<div class="field"><label class="visually-hidden" for="auth-reg-telefono">Teléfono</label>' +
      '<input type="tel" id="auth-reg-telefono" name="telefono" autocomplete="tel" placeholder="Teléfono +56 9 …" /></div>' +
      '<div class="field field--password">' +
      '<label class="visually-hidden" for="auth-reg-clave">Clave</label>' +
      '<input type="password" id="auth-reg-clave" name="clave" required minlength="8" autocomplete="new-password" placeholder="Contraseña (mín. 8)" />' +
      '<button type="button" class="auth-modal__eye" data-auth-eye="auth-reg-clave" aria-label="Mostrar contraseña">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>' +
      "</button></div>" +
      '<div class="auth-modal__captcha" id="auth-turnstile-registro"></div>' +
      '<p class="account-error" id="auth-reg-error" hidden></p>' +
      '<button type="submit" class="btn btn-primary btn-lg auth-modal__submit">Crear cuenta</button>' +
      "</form>" +
      '<div class="auth-modal__divider"></div>' +
      '<p class="auth-modal__switch-q">¿Ya tienes cuenta?</p>' +
      '<button type="button" class="btn auth-modal__ghost" data-auth-tab="login">Iniciar Sesión</button>' +
      "</div>" +
      "</div>" +
      "</div>";
    document.body.appendChild(modalEl);
    cablearModal(modalEl);
    return modalEl;
  }

  function mostrarError(el, msg) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
  }

  function setTab(tab) {
    var modal = asegurarModal();
    modal.querySelectorAll("[data-auth-pane]").forEach(function (pane) {
      pane.hidden = pane.getAttribute("data-auth-pane") !== tab;
    });
    var title = modal.querySelector("#auth-modal-title");
    if (title && tab === "login") title.id = "auth-modal-title";
    var focusId = tab === "registro" ? "auth-reg-nombre" : "auth-login-email";
    var focus = document.getElementById(focusId);
    if (focus) focus.focus();
    montarTurnstile(tab === "registro" ? "registro" : "login");
  }

  function abrirModal(tab) {
    cerrarMenu();
    var modal = asegurarModal();
    setTab(tab || "login");
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("auth-modal-open");
    montarTurnstile(tab === "registro" ? "registro" : "login");
  }

  function cerrarModal() {
    if (!modalEl || modalEl.hidden) return;
    modalEl.hidden = true;
    document.body.classList.remove("auth-modal-open");
    mostrarError(document.getElementById("auth-login-error"), "");
    mostrarError(document.getElementById("auth-reg-error"), "");
    if (lastFocus && typeof lastFocus.focus === "function") {
      try {
        lastFocus.focus();
      } catch (err) {
        /* noop */
      }
    }
  }

  function cablearModal(modal) {
    modal.addEventListener("click", function (e) {
      if (e.target.closest("[data-auth-close]")) {
        e.preventDefault();
        cerrarModal();
        return;
      }
      var tabBtn = e.target.closest("[data-auth-tab]");
      if (tabBtn) {
        e.preventDefault();
        setTab(tabBtn.getAttribute("data-auth-tab"));
        return;
      }
      var eye = e.target.closest("[data-auth-eye]");
      if (eye) {
        e.preventDefault();
        var input = document.getElementById(eye.getAttribute("data-auth-eye"));
        if (!input) return;
        input.type = input.type === "password" ? "text" : "password";
      }
    });

    var formLogin = modal.querySelector("#auth-modal-login");
    var formReg = modal.querySelector("#auth-modal-registro");

    if (formLogin) {
      formLogin.addEventListener("submit", function (e) {
        e.preventDefault();
        var err = document.getElementById("auth-login-error");
        mostrarError(err, "");
        var token = tokenTurnstile(turnstileIds.login);
        if (turnstileSiteKey() && !token) {
          mostrarError(err, "Confirma que no eres un robot.");
          return;
        }
        login({
          email: formLogin.email.value,
          clave: formLogin.clave.value,
          turnstileToken: token,
        })
          .then(function (data) {
            if (!data.ok) {
              mostrarError(err, data.message || "No pudimos iniciar sesión.");
              resetTurnstile("login");
              return;
            }
            cerrarModal();
          })
          .catch(function () {
            mostrarError(err, "Error de red. Intenta de nuevo.");
            resetTurnstile("login");
          });
      });
    }

    if (formReg) {
      formReg.addEventListener("submit", function (e) {
        e.preventDefault();
        var err = document.getElementById("auth-reg-error");
        mostrarError(err, "");
        var token = tokenTurnstile(turnstileIds.registro);
        if (turnstileSiteKey() && !token) {
          mostrarError(err, "Confirma que no eres un robot.");
          return;
        }
        registrar({
          nombre: formReg.nombre.value,
          email: formReg.email.value,
          telefono: formReg.telefono.value,
          clave: formReg.clave.value,
          turnstileToken: token,
        })
          .then(function (data) {
            if (!data.ok) {
              mostrarError(err, data.message || "No pudimos crear la cuenta.");
              resetTurnstile("registro");
              return;
            }
            cerrarModal();
          })
          .catch(function () {
            mostrarError(err, "Error de red. Intenta de nuevo.");
            resetTurnstile("registro");
          });
      });
    }
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  document.addEventListener("click", function (e) {
    var openBtn = e.target.closest("[data-auth-open]");
    if (openBtn) {
      e.preventDefault();
      abrirModal("login");
      return;
    }
    var menuBtn = e.target.closest("[data-auth-menu]");
    if (menuBtn) {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu(menuBtn);
      return;
    }
    if (e.target.closest("[data-auth-logout]")) {
      e.preventDefault();
      logout().then(function () {
        cerrarMenu();
      });
      return;
    }
    if (menuEl && !menuEl.hidden && !e.target.closest(".account-menu") && !e.target.closest("[data-auth-menu]")) {
      cerrarMenu();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (modalEl && !modalEl.hidden) cerrarModal();
    else cerrarMenu();
  });

  window.addEventListener("resize", function () {
    if (menuEl && !menuEl.hidden) {
      var t = document.querySelector("[data-auth-menu]");
      if (t) posicionarMenu(t);
    }
  });

  function iniciar() {
    asegurarModal();
    asegurarMenu();
    pintarHeader();
    chequearIdleAlCargar();
    if (leerToken()) refrescarYo().catch(function () {});
    ["click", "keydown", "mousemove", "scroll", "touchstart"].forEach(function (ev) {
      document.addEventListener(ev, function () {
        tocarActividad(false);
      }, { passive: true });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }

  window.AndesAuth = {
    api: api,
    token: leerToken,
    usuario: leerUsuario,
    haySesion: function () {
      return !!leerToken();
    },
    registrar: registrar,
    login: login,
    logout: logout,
    refrescarYo: refrescarYo,
    actualizarYo: actualizarYo,
    fusionarCarrito: fusionarCarrito,
    sincronizarCarrito: sincronizarCarrito,
    resolverPrecios: resolverPrecios,
    abrirModal: abrirModal,
    cerrarModal: cerrarModal,
    onChange: function (cb) {
      if (typeof cb === "function") listeners.push(cb);
    },
    pintarHeader: pintarHeader,
  };
})();
