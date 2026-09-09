/**
 * Cuentas de cliente / vendedor, carrito de perfil y descuentos.
 *
 * Vive en D1 (CLIENTES_DB), aislada del KV de Mercado Libre. El sitio estático
 * manda Authorization: Bearer <token de sesión> en cada llamada.
 *
 * Rutas:
 *   POST /auth/registro | /auth/login | /auth/logout | /auth/bootstrap
 *   GET|PATCH /auth/yo
 *   GET|PUT /cart | POST /cart/merge
 *   POST /pricing/resolver
 *   GET|POST /admin/usuarios | PATCH /admin/usuarios/:id
 *   PUT|DELETE /admin/usuarios/:id/precios/:productoId
 */

const SESION_DIAS = 30;
const DIAS_SIN_COMPRA = 30;
const MAX_AUTH_INTENTOS = 12;
const PBKDF2_ITER = 100000;

/* ============================== Utilidades ============================== */

function texto(valor, max) {
  return String(valor == null ? "" : valor)
    .trim()
    .slice(0, max);
}

function emailOk(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
}

function ahoraIso() {
  return new Date().toISOString();
}

function expiraIso(dias) {
  return new Date(Date.now() + dias * 86400000).toISOString();
}

function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const dig = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(dig);
}

async function hashClave(clave, saltHex) {
  const salt = hexToBytes(saltHex);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clave),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITER },
    key,
    256
  );
  return bytesToHex(bits);
}

function nuevoSalt() {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

function nuevoId() {
  return crypto.randomUUID().replace(/-/g, "");
}

function nuevoToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

function bearer(request) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice(7).trim();
}

function perfilPublico(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    rol: u.rol,
    nombre: u.nombre,
    telefono: u.telefono,
    rut: u.rut,
    documento: u.documento,
    razon_social: u.razon_social,
    giro: u.giro,
    direccion: u.direccion,
    comuna: u.comuna,
    region: u.region,
    descuento_pct: Number(u.descuento_pct) || 0,
    activo: !!u.activo,
    creado_en: u.creado_en,
  };
}

function itemCarrito(raw) {
  return {
    id: texto(raw.id || raw.producto_id, 40),
    titulo: texto(raw.titulo, 200),
    sku: texto(raw.sku, 60),
    qty: Math.max(1, Math.min(99, Math.round(Number(raw.qty) || 1))),
    precio: Math.max(0, Math.round(Number(raw.precio ?? raw.precio_lista) || 0)),
    imagen: texto(raw.imagen, 500),
    link: texto(raw.link, 500),
    stock: raw.stock == null || raw.stock === "" ? null : Number(raw.stock),
  };
}

function precioEfectivo(precioLista, descuentoPct, especial) {
  if (especial != null && especial !== "" && !Number.isNaN(Number(especial))) {
    return Math.max(0, Math.round(Number(especial)));
  }
  const lista = Math.max(0, Math.round(Number(precioLista) || 0));
  const pct = Math.max(0, Math.min(100, Number(descuentoPct) || 0));
  if (pct <= 0) return lista;
  return Math.max(0, Math.round(lista * (1 - pct / 100)));
}

/* ================================ Auth ================================ */

async function rateLimit(env, clave) {
  if (!env.CLIENTES_DB) return true;
  const ventana = new Date().toISOString().slice(0, 13); // por hora
  const row = await env.CLIENTES_DB.prepare(
    "SELECT contador, ventana_en FROM auth_rate WHERE clave = ?"
  )
    .bind(clave)
    .first();

  if (!row || row.ventana_en !== ventana) {
    await env.CLIENTES_DB.prepare(
      "INSERT INTO auth_rate (clave, contador, ventana_en) VALUES (?, 1, ?) ON CONFLICT(clave) DO UPDATE SET contador = 1, ventana_en = excluded.ventana_en"
    )
      .bind(clave, ventana)
      .run();
    return true;
  }
  if (row.contador >= MAX_AUTH_INTENTOS) return false;
  await env.CLIENTES_DB.prepare(
    "UPDATE auth_rate SET contador = contador + 1 WHERE clave = ?"
  )
    .bind(clave)
    .run();
  return true;
}

async function crearSesion(env, usuarioId) {
  const token = nuevoToken();
  const tokenHash = await sha256Hex(token);
  await env.CLIENTES_DB.prepare(
    "INSERT INTO sesiones (token_hash, usuario_id, expira_en, creado_en) VALUES (?, ?, ?, ?)"
  )
    .bind(tokenHash, usuarioId, expiraIso(SESION_DIAS), ahoraIso())
    .run();
  return token;
}

/**
 * Clientes dados de alta por vendedor/admin: si pasan DIAS_SIN_COMPRA sin
 * comprar (o desde el alta si nunca compraron), se desactivan.
 */
async function aplicarBloqueoSinCompra(env, u) {
  if (!env.CLIENTES_DB || !u) return null;
  if (u.rol !== "cliente" || !u.creado_por) return null;

  const ref = u.ultima_compra_en || u.creado_en;
  const ms = Date.parse(ref);
  if (!ms || Number.isNaN(ms)) return null;

  const dias = (Date.now() - ms) / 86400000;
  if (dias <= DIAS_SIN_COMPRA) return null;

  await env.CLIENTES_DB.prepare("UPDATE usuarios SET activo = 0 WHERE id = ?")
    .bind(u.id)
    .run();
  await env.CLIENTES_DB.prepare("DELETE FROM sesiones WHERE usuario_id = ?")
    .bind(u.id)
    .run();

  return {
    error: "CUENTA_BLOQUEADA",
    message:
      "Tu cuenta fue bloqueada por seguridad: más de un mes sin compras. Contacta a tu vendedor Andes Auto Parts.",
  };
}

async function usuarioPorSesion(env, request) {
  const token = bearer(request);
  if (!token || !env.CLIENTES_DB) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.CLIENTES_DB.prepare(
    `SELECT u.* FROM sesiones s
     JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token_hash = ? AND s.expira_en > ? AND u.activo = 1`
  )
    .bind(tokenHash, ahoraIso())
    .first();
  if (!row) return null;

  const bloq = await aplicarBloqueoSinCompra(env, row);
  if (bloq) return null;
  return row;
}

async function exigirSesion(env, request, json) {
  const u = await usuarioPorSesion(env, request);
  if (!u) {
    return {
      error: json({ ok: false, error: "NO_AUTENTICADO", message: "Inicia sesión" }, 401),
    };
  }
  return { usuario: u };
}

async function exigirStaff(env, request, json) {
  const r = await exigirSesion(env, request, json);
  if (r.error) return r;
  if (r.usuario.rol !== "vendedor" && r.usuario.rol !== "admin") {
    return {
      error: json({ ok: false, error: "PROHIBIDO", message: "Solo vendedores" }, 403),
    };
  }
  return r;
}

async function verificarTurnstile(env, token, ip) {
  const secret = (env.TURNSTILE_SECRET_KEY || "").trim();
  // Sin secreto: no bloqueamos (permite desplegar antes de crear el widget).
  if (!secret) return { ok: true, skipped: true };
  if (!token) {
    return {
      ok: false,
      message: "Confirma que no eres un robot antes de continuar.",
    };
  }
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: String(token),
        remoteip: ip || "",
      }),
    });
    const data = await res.json();
    if (data && data.success) return { ok: true };
    return {
      ok: false,
      message: "No pudimos verificar que no eres un robot. Intenta de nuevo.",
    };
  } catch (err) {
    return {
      ok: false,
      message: "Error al verificar el captcha. Intenta de nuevo.",
    };
  }
}

async function registrar(request, env, json, { rol = "cliente", creadoPor = null } = {}) {
  if (!env.CLIENTES_DB) {
    return json({ ok: false, error: "DB_NO_CONFIGURADA" }, 500);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "ip";
  if (!(await rateLimit(env, "reg:" + ip))) {
    return json({ ok: false, error: "RATE_LIMIT" }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ ok: false, error: "JSON_INVALIDO" }, 400);
  }

  // Alta pública: exige Turnstile. Alta por vendedor (creadoPor) lo omite.
  if (!creadoPor) {
    const cap = await verificarTurnstile(
      env,
      body.turnstileToken || body["cf-turnstile-response"],
      ip
    );
    if (!cap.ok) {
      return json({ ok: false, error: "CAPTCHA", message: cap.message }, 400);
    }
  }

  const email = texto(body.email, 160).toLowerCase();
  const clave = String(body.clave || body.password || "");
  const nombre = texto(body.nombre, 120);

  if (!emailOk(email)) return json({ ok: false, error: "EMAIL_INVALIDO" }, 400);
  if (clave.length < 8) {
    return json(
      { ok: false, error: "CLAVE_CORTA", message: "La clave debe tener al menos 8 caracteres" },
      400
    );
  }
  if (nombre.length < 2) {
    return json({ ok: false, error: "NOMBRE_INVALIDO" }, 400);
  }

  const existe = await env.CLIENTES_DB.prepare(
    "SELECT id FROM usuarios WHERE email = ? COLLATE NOCASE"
  )
    .bind(email)
    .first();
  if (existe) {
    return json({ ok: false, error: "EMAIL_EN_USO", message: "Ese correo ya tiene cuenta" }, 409);
  }

  const id = nuevoId();
  const salt = nuevoSalt();
  const passwordHash = await hashClave(clave, salt);
  const descuento =
    creadoPor != null
      ? Math.max(0, Math.min(100, Number(body.descuento_pct) || 0))
      : 0;

  await env.CLIENTES_DB.prepare(
    `INSERT INTO usuarios (
      id, email, password_hash, password_salt, rol, nombre, telefono, rut, documento,
      razon_social, giro, direccion, comuna, region, descuento_pct, activo, creado_por, creado_en
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  )
    .bind(
      id,
      email,
      passwordHash,
      salt,
      rol,
      nombre,
      texto(body.telefono, 40),
      texto(body.rut, 20),
      body.documento === "factura" ? "factura" : "boleta",
      texto(body.razon_social, 160),
      texto(body.giro, 160),
      texto(body.direccion, 200),
      texto(body.comuna, 80),
      texto(body.region, 80),
      descuento,
      creadoPor,
      ahoraIso()
    )
    .run();

  const token = await crearSesion(env, id);
  const usuario = await env.CLIENTES_DB.prepare("SELECT * FROM usuarios WHERE id = ?")
    .bind(id)
    .first();

  return json({ ok: true, token, usuario: perfilPublico(usuario) });
}

async function login(request, env, json) {
  if (!env.CLIENTES_DB) return json({ ok: false, error: "DB_NO_CONFIGURADA" }, 500);

  const ip = request.headers.get("CF-Connecting-IP") || "ip";
  if (!(await rateLimit(env, "login:" + ip))) {
    return json({ ok: false, error: "RATE_LIMIT" }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ ok: false, error: "JSON_INVALIDO" }, 400);
  }

  const cap = await verificarTurnstile(
    env,
    body.turnstileToken || body["cf-turnstile-response"],
    ip
  );
  if (!cap.ok) {
    return json({ ok: false, error: "CAPTCHA", message: cap.message }, 400);
  }

  const email = texto(body.email, 160).toLowerCase();
  const clave = String(body.clave || body.password || "");
  if (!(await rateLimit(env, "login-mail:" + email))) {
    return json({ ok: false, error: "RATE_LIMIT", message: "Demasiados intentos. Espera una hora." }, 429);
  }
  const u = await env.CLIENTES_DB.prepare(
    "SELECT * FROM usuarios WHERE email = ? COLLATE NOCASE"
  )
    .bind(email)
    .first();

  if (!u) {
    return json({ ok: false, error: "CREDENCIALES", message: "Correo o clave incorrectos" }, 401);
  }

  const hash = await hashClave(clave, u.password_salt);
  if (hash !== u.password_hash) {
    return json({ ok: false, error: "CREDENCIALES", message: "Correo o clave incorrectos" }, 401);
  }

  if (!u.activo) {
    return json(
      {
        ok: false,
        error: "CUENTA_BLOQUEADA",
        message:
          "Tu cuenta está desactivada. Contacta a tu vendedor Andes Auto Parts para reactivarla.",
      },
      403
    );
  }

  const bloq = await aplicarBloqueoSinCompra(env, u);
  if (bloq) {
    return json({ ok: false, error: bloq.error, message: bloq.message }, 403);
  }

  const token = await crearSesion(env, u.id);
  return json({ ok: true, token, usuario: perfilPublico(u) });
}

async function logout(request, env, json) {
  const token = bearer(request);
  if (token && env.CLIENTES_DB) {
    const tokenHash = await sha256Hex(token);
    await env.CLIENTES_DB.prepare("DELETE FROM sesiones WHERE token_hash = ?")
      .bind(tokenHash)
      .run();
  }
  return json({ ok: true });
}

async function bootstrapAdmin(request, env, json) {
  if (!env.CLIENTES_DB) return json({ ok: false, error: "DB_NO_CONFIGURADA" }, 500);

  const emailBoot = (env.ADMIN_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
  const claveBoot = (env.ADMIN_BOOTSTRAP_PASSWORD || "").trim();
  if (!emailBoot || !claveBoot) {
    return json({ ok: false, error: "BOOTSTRAP_NO_CONFIGURADO" }, 400);
  }

  const yaHay = await env.CLIENTES_DB.prepare(
    "SELECT id FROM usuarios WHERE rol IN ('admin', 'vendedor') LIMIT 1"
  ).first();
  if (yaHay) {
    return json({ ok: false, error: "YA_INICIALIZADO" }, 409);
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    body = {};
  }

  if (
    texto(body.email, 160).toLowerCase() !== emailBoot ||
    String(body.clave || body.password || "") !== claveBoot
  ) {
    return json({ ok: false, error: "CREDENCIALES" }, 401);
  }

  // Reusa el cuerpo para crear el admin.
  const fake = new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: emailBoot,
      clave: claveBoot,
      nombre: texto(body.nombre, 120) || "Administrador",
      telefono: body.telefono || "",
    }),
  });
  return registrar(fake, env, json, { rol: "admin" });
}

async function yo(request, env, json) {
  const r = await exigirSesion(env, request, json);
  if (r.error) return r.error;
  return json({ ok: true, usuario: perfilPublico(r.usuario) });
}

async function actualizarYo(request, env, json) {
  const r = await exigirSesion(env, request, json);
  if (r.error) return r.error;

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ ok: false, error: "JSON_INVALIDO" }, 400);
  }

  const nombre = texto(body.nombre, 120) || r.usuario.nombre;
  await env.CLIENTES_DB.prepare(
    `UPDATE usuarios SET
      nombre = ?, telefono = ?, rut = ?, documento = ?,
      razon_social = ?, giro = ?, direccion = ?, comuna = ?, region = ?
     WHERE id = ?`
  )
    .bind(
      nombre,
      texto(body.telefono, 40),
      texto(body.rut, 20),
      body.documento === "factura" ? "factura" : "boleta",
      texto(body.razon_social, 160),
      texto(body.giro, 160),
      texto(body.direccion, 200),
      texto(body.comuna, 80),
      texto(body.region, 80),
      r.usuario.id
    )
    .run();

  const u = await env.CLIENTES_DB.prepare("SELECT * FROM usuarios WHERE id = ?")
    .bind(r.usuario.id)
    .first();
  return json({ ok: true, usuario: perfilPublico(u) });
}

/* =============================== Carrito =============================== */

async function leerCarritoDb(env, usuarioId) {
  const { results } = await env.CLIENTES_DB.prepare(
    "SELECT * FROM carrito_items WHERE usuario_id = ? ORDER BY actualizado_en DESC"
  )
    .bind(usuarioId)
    .all();
  return (results || []).map((row) => ({
    id: row.producto_id,
    titulo: row.titulo,
    sku: row.sku,
    qty: row.qty,
    precio: row.precio_lista,
    imagen: row.imagen,
    link: row.link,
    stock: row.stock,
  }));
}

async function getCart(request, env, json) {
  const r = await exigirSesion(env, request, json);
  if (r.error) return r.error;
  const items = await leerCarritoDb(env, r.usuario.id);
  return json({ ok: true, items });
}

async function putCart(request, env, json) {
  const r = await exigirSesion(env, request, json);
  if (r.error) return r.error;

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ ok: false, error: "JSON_INVALIDO" }, 400);
  }

  const items = Array.isArray(body.items) ? body.items.map(itemCarrito).filter((i) => i.id) : [];
  await env.CLIENTES_DB.prepare("DELETE FROM carrito_items WHERE usuario_id = ?")
    .bind(r.usuario.id)
    .run();

  const ahora = ahoraIso();
  for (const it of items.slice(0, 100)) {
    await env.CLIENTES_DB.prepare(
      `INSERT INTO carrito_items (
        usuario_id, producto_id, qty, titulo, sku, precio_lista, imagen, link, stock, actualizado_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        r.usuario.id,
        it.id,
        it.qty,
        it.titulo,
        it.sku,
        it.precio,
        it.imagen,
        it.link,
        it.stock,
        ahora
      )
      .run();
  }

  return json({ ok: true, items: await leerCarritoDb(env, r.usuario.id) });
}

async function mergeCart(request, env, json) {
  const r = await exigirSesion(env, request, json);
  if (r.error) return r.error;

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ ok: false, error: "JSON_INVALIDO" }, 400);
  }

  const locales = Array.isArray(body.items) ? body.items.map(itemCarrito).filter((i) => i.id) : [];
  const mapa = new Map();
  const existentes = await leerCarritoDb(env, r.usuario.id);
  existentes.forEach((it) => mapa.set(it.id, it));

  locales.forEach((it) => {
    const prev = mapa.get(it.id);
    if (prev) {
      mapa.set(it.id, {
        ...prev,
        ...it,
        qty: Math.min(99, prev.qty + it.qty),
        precio: it.precio || prev.precio,
        titulo: it.titulo || prev.titulo,
        sku: it.sku || prev.sku,
        imagen: it.imagen || prev.imagen,
        link: it.link || prev.link,
      });
    } else {
      mapa.set(it.id, it);
    }
  });

  const merged = [...mapa.values()];
  const fake = new Request(request.url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: request.headers.get("Authorization") || "",
    },
    body: JSON.stringify({ items: merged }),
  });
  return putCart(fake, env, json);
}

/* ============================== Precios ============================== */

async function resolverPrecios(request, env, json) {
  const r = await exigirSesion(env, request, json);
  if (r.error) return r.error;

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ ok: false, error: "JSON_INVALIDO" }, 400);
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const ids = items.map((it) => texto(it.id, 40)).filter(Boolean);
  const especiales = new Map();

  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const { results } = await env.CLIENTES_DB.prepare(
      `SELECT producto_id, precio FROM precios_especiales
       WHERE usuario_id = ? AND producto_id IN (${placeholders})`
    )
      .bind(r.usuario.id, ...ids)
      .all();
    (results || []).forEach((row) => especiales.set(row.producto_id, row.precio));
  }

  const pct = Number(r.usuario.descuento_pct) || 0;
  const resueltos = items.map((it) => {
    const id = texto(it.id, 40);
    const lista = Math.max(0, Math.round(Number(it.precio) || 0));
    const efectivo = precioEfectivo(lista, pct, especiales.get(id));
    return {
      id,
      precio_lista: lista,
      precio: efectivo,
      descuento_pct: pct,
      precio_especial: especiales.has(id),
    };
  });

  return json({
    ok: true,
    descuento_pct: pct,
    items: resueltos,
  });
}

/** Usado por pedidos.js para recalcular totales autenticados. */
export async function resolverPreciosUsuario(env, usuario, items) {
  if (!env.CLIENTES_DB || !usuario) {
    return items.map((it) => ({
      ...it,
      precio: Math.max(0, Math.round(Number(it.precio) || 0)),
    }));
  }
  const ids = items.map((it) => texto(it.id, 40)).filter(Boolean);
  const especiales = new Map();
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const { results } = await env.CLIENTES_DB.prepare(
      `SELECT producto_id, precio FROM precios_especiales
       WHERE usuario_id = ? AND producto_id IN (${placeholders})`
    )
      .bind(usuario.id, ...ids)
      .all();
    (results || []).forEach((row) => especiales.set(row.producto_id, row.precio));
  }
  const pct = Number(usuario.descuento_pct) || 0;
  return items.map((it) => {
    const lista = Math.max(0, Math.round(Number(it.precio) || 0));
    return {
      ...it,
      precio_lista: lista,
      precio: precioEfectivo(lista, pct, especiales.get(texto(it.id, 40))),
    };
  });
}

export async function usuarioDesdeRequest(env, request) {
  return usuarioPorSesion(env, request);
}

/** Marca la última compra del cliente (reactiva el plazo de 1 mes). */
export async function registrarUltimaCompra(env, usuarioId) {
  if (!env.CLIENTES_DB || !usuarioId) return;
  try {
    await env.CLIENTES_DB.prepare(
      "UPDATE usuarios SET ultima_compra_en = ?, activo = 1 WHERE id = ?"
    )
      .bind(ahoraIso(), usuarioId)
      .run();
  } catch (err) {
    /* columna puede faltar en migraciones viejas: no tumbar el pedido */
  }
}

/* =============================== Admin =============================== */

async function listarUsuarios(request, env, json) {
  const r = await exigirStaff(env, request, json);
  if (r.error) return r.error;

  const url = new URL(request.url);
  const q = texto(url.searchParams.get("q"), 80).toLowerCase();

  let rows;
  if (q) {
    const like = "%" + q + "%";
    const res = await env.CLIENTES_DB.prepare(
      `SELECT * FROM usuarios
       WHERE email LIKE ? OR nombre LIKE ? OR telefono LIKE ? OR rut LIKE ?
       ORDER BY creado_en DESC LIMIT 200`
    )
      .bind(like, like, like, like)
      .all();
    rows = res.results || [];
  } else {
    const res = await env.CLIENTES_DB.prepare(
      "SELECT * FROM usuarios ORDER BY creado_en DESC LIMIT 200"
    ).all();
    rows = res.results || [];
  }

  return json({ ok: true, usuarios: rows.map(perfilPublico) });
}

async function crearUsuarioAdmin(request, env, json) {
  const r = await exigirStaff(env, request, json);
  if (r.error) return r.error;

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ ok: false, error: "JSON_INVALIDO" }, 400);
  }

  const rol =
    r.usuario.rol === "admin" && (body.rol === "vendedor" || body.rol === "admin")
      ? body.rol
      : "cliente";

  const fake = new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // No crear sesión automática del cliente al alta por vendedor: devolvemos perfil.
  const resultado = await registrar(fake, env, json, {
    rol,
    creadoPor: r.usuario.id,
  });

  // registrar() crea sesión; para alta admin preferimos no loguear como el cliente.
  // Invalidamos esa sesión leyendo el token y borrándola.
  try {
    const data = await resultado.clone().json();
    if (data.token) {
      const th = await sha256Hex(data.token);
      await env.CLIENTES_DB.prepare("DELETE FROM sesiones WHERE token_hash = ?")
        .bind(th)
        .run();
      data.token = undefined;
      return json({ ok: true, usuario: data.usuario });
    }
  } catch (err) {
    /* si falló el registro, devolvemos la respuesta original */
  }
  return resultado;
}

async function patchUsuario(request, env, json, id) {
  const r = await exigirStaff(env, request, json);
  if (r.error) return r.error;

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ ok: false, error: "JSON_INVALIDO" }, 400);
  }

  const u = await env.CLIENTES_DB.prepare("SELECT * FROM usuarios WHERE id = ?")
    .bind(id)
    .first();
  if (!u) return json({ ok: false, error: "NO_ENCONTRADO" }, 404);

  // Vendedor solo puede gestionar clientes (no otros vendedores/admins).
  if (r.usuario.rol === "vendedor" && u.rol !== "cliente") {
    return json(
      { ok: false, error: "PROHIBIDO", message: "Solo puedes editar cuentas de cliente" },
      403
    );
  }

  const descuento =
    body.descuento_pct != null
      ? Math.max(0, Math.min(100, Number(body.descuento_pct) || 0))
      : u.descuento_pct;
  const activo = body.activo != null ? (body.activo ? 1 : 0) : u.activo;
  let rol = u.rol;
  if (r.usuario.rol === "admin" && ["cliente", "vendedor", "admin"].includes(body.rol)) {
    rol = body.rol;
  }

  await env.CLIENTES_DB.prepare(
    `UPDATE usuarios SET
      nombre = ?, telefono = ?, rut = ?, documento = ?,
      razon_social = ?, giro = ?, direccion = ?, comuna = ?, region = ?,
      descuento_pct = ?, activo = ?, rol = ?
     WHERE id = ?`
  )
    .bind(
      texto(body.nombre, 120) || u.nombre,
      texto(body.telefono != null ? body.telefono : u.telefono, 40),
      texto(body.rut != null ? body.rut : u.rut, 20),
      body.documento === "factura" || body.documento === "boleta" ? body.documento : u.documento,
      texto(body.razon_social != null ? body.razon_social : u.razon_social, 160),
      texto(body.giro != null ? body.giro : u.giro, 160),
      texto(body.direccion != null ? body.direccion : u.direccion, 200),
      texto(body.comuna != null ? body.comuna : u.comuna, 80),
      texto(body.region != null ? body.region : u.region, 80),
      descuento,
      activo,
      rol,
      id
    )
    .run();

  // Al reactivar, reinicia el plazo de 1 mes sin compras.
  if (activo === 1 && !u.activo) {
    await env.CLIENTES_DB.prepare(
      "UPDATE usuarios SET ultima_compra_en = ? WHERE id = ?"
    )
      .bind(ahoraIso(), id)
      .run();
  }

  const puedeCambiarClave =
    body.clave &&
    String(body.clave).length >= 8 &&
    (r.usuario.rol === "admin" || u.rol === "cliente");
  if (puedeCambiarClave) {
    const salt = nuevoSalt();
    const hash = await hashClave(String(body.clave), salt);
    await env.CLIENTES_DB.prepare(
      "UPDATE usuarios SET password_hash = ?, password_salt = ? WHERE id = ?"
    )
      .bind(hash, salt, id)
      .run();
    await env.CLIENTES_DB.prepare("DELETE FROM sesiones WHERE usuario_id = ?")
      .bind(id)
      .run();
  }

  const actualizado = await env.CLIENTES_DB.prepare("SELECT * FROM usuarios WHERE id = ?")
    .bind(id)
    .first();

  let precios = [];
  if (body.incluir_precios) {
    const res = await env.CLIENTES_DB.prepare(
      "SELECT producto_id, precio FROM precios_especiales WHERE usuario_id = ?"
    )
      .bind(id)
      .all();
    precios = res.results || [];
  }

  return json({ ok: true, usuario: perfilPublico(actualizado), precios });
}

async function putPrecioEspecial(request, env, json, userId, productoId) {
  const r = await exigirStaff(env, request, json);
  if (r.error) return r.error;

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ ok: false, error: "JSON_INVALIDO" }, 400);
  }

  const precio = Math.max(0, Math.round(Number(body.precio) || 0));
  const pid = texto(productoId, 40);
  if (!pid) return json({ ok: false, error: "PRODUCTO_INVALIDO" }, 400);

  await env.CLIENTES_DB.prepare(
    `INSERT INTO precios_especiales (usuario_id, producto_id, precio)
     VALUES (?, ?, ?)
     ON CONFLICT(usuario_id, producto_id) DO UPDATE SET precio = excluded.precio`
  )
    .bind(userId, pid, precio)
    .run();

  return json({ ok: true, producto_id: pid, precio });
}

async function deletePrecioEspecial(env, json, userId, productoId, staffReq) {
  const r = staffReq;
  if (r.error) return r.error;
  await env.CLIENTES_DB.prepare(
    "DELETE FROM precios_especiales WHERE usuario_id = ? AND producto_id = ?"
  )
    .bind(userId, texto(productoId, 40))
    .run();
  return json({ ok: true });
}

async function listarPrecios(request, env, json, userId) {
  const r = await exigirStaff(env, request, json);
  if (r.error) return r.error;
  const res = await env.CLIENTES_DB.prepare(
    "SELECT producto_id, precio FROM precios_especiales WHERE usuario_id = ?"
  )
    .bind(userId)
    .all();
  return json({ ok: true, precios: res.results || [] });
}

/* ================================ Router ================================ */

export async function rutearClientes(path, request, env, { json }) {
  if (!path.startsWith("/auth") && !path.startsWith("/cart") && !path.startsWith("/pricing") && !path.startsWith("/admin")) {
    return null;
  }

  // No chocar con GET /auth-url de Mercado Libre.
  if (path === "/auth-url") return null;

  if (path === "/auth/registro" && request.method === "POST") {
    return registrar(request, env, json, { rol: "cliente" });
  }
  if (path === "/auth/login" && request.method === "POST") {
    return login(request, env, json);
  }
  if (path === "/auth/logout" && request.method === "POST") {
    return logout(request, env, json);
  }
  if (path === "/auth/bootstrap" && request.method === "POST") {
    return bootstrapAdmin(request, env, json);
  }
  if (path === "/auth/yo" && request.method === "GET") {
    return yo(request, env, json);
  }
  if (path === "/auth/yo" && request.method === "PATCH") {
    return actualizarYo(request, env, json);
  }

  if (path === "/cart" && request.method === "GET") {
    return getCart(request, env, json);
  }
  if (path === "/cart" && request.method === "PUT") {
    return putCart(request, env, json);
  }
  if (path === "/cart/merge" && request.method === "POST") {
    return mergeCart(request, env, json);
  }

  if (path === "/pricing/resolver" && request.method === "POST") {
    return resolverPrecios(request, env, json);
  }

  if (path === "/admin/usuarios" && request.method === "GET") {
    return listarUsuarios(request, env, json);
  }
  if (path === "/admin/usuarios" && request.method === "POST") {
    return crearUsuarioAdmin(request, env, json);
  }

  const patchUser = path.match(/^\/admin\/usuarios\/([a-zA-Z0-9]+)$/);
  if (patchUser && request.method === "PATCH") {
    return patchUsuario(request, env, json, patchUser[1]);
  }

  const preciosUser = path.match(/^\/admin\/usuarios\/([a-zA-Z0-9]+)\/precios$/);
  if (preciosUser && request.method === "GET") {
    return listarPrecios(request, env, json, preciosUser[1]);
  }

  const putPrecio = path.match(/^\/admin\/usuarios\/([a-zA-Z0-9]+)\/precios\/([^/]+)$/);
  if (putPrecio && request.method === "PUT") {
    return putPrecioEspecial(request, env, json, putPrecio[1], decodeURIComponent(putPrecio[2]));
  }
  if (putPrecio && request.method === "DELETE") {
    const staff = await exigirStaff(env, request, json);
    return deletePrecioEspecial(env, json, putPrecio[1], decodeURIComponent(putPrecio[2]), staff);
  }

  if (path.startsWith("/auth") || path.startsWith("/cart") || path.startsWith("/pricing") || path.startsWith("/admin")) {
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  }

  return null;
}
