/**
 * Sesión de cliente / vendedor (correo + clave).
 * Token en localStorage; el Worker autentica con Authorization Bearer.
 */
(function () {
  "use strict";

  var TOKEN_KEY = "andes_sesion_v1";
  var USER_KEY = "andes_usuario_v1";
  var listeners = [];

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
    } catch (err) {
      /* modo privado */
    }
    avisar();
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

  function pintarHeader() {
    var slots = document.querySelectorAll("[data-auth-slot]");
    if (!slots.length) return;
    var u = leerUsuario();
    var base = prefijoRutas();
    slots.forEach(function (el) {
      if (u) {
        var nombre = (u.nombre || u.email || "Cuenta").split(" ")[0];
        el.innerHTML =
          '<a class="header-account" href="' +
          base +
          'cuenta.html">' +
          esc(nombre) +
          "</a>" +
          (u.rol === "vendedor" || u.rol === "admin"
            ? ' <a class="header-account header-account--admin" href="' +
              base +
              'admin/clientes.html">Clientes</a>'
            : "");
      } else {
        el.innerHTML =
          '<a class="header-account" href="' + base + 'cuenta.html">Entrar</a>';
      }
    });
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function iniciar() {
    pintarHeader();
    if (leerToken()) refrescarYo().catch(function () {});
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
    onChange: function (cb) {
      if (typeof cb === "function") listeners.push(cb);
    },
    pintarHeader: pintarHeader,
  };
})();
