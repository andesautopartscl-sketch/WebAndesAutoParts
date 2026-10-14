/**
 * Métricas propias del sitio (visitas, tiempo, clics).
 * No guarda IP ni correo. El id de visitante lo genera el navegador.
 */

const TIPOS = new Set(["page", "tiempo", "producto", "whatsapp", "carrito", "busqueda"]);
const DISPOSITIVOS = new Set(["móvil", "tablet", "escritorio"]);

function texto(valor, max) {
  return String(valor == null ? "" : valor)
    .trim()
    .slice(0, max);
}

function ahoraIso() {
  return new Date().toISOString();
}

function diasPedidos(request) {
  const n = Number(new URL(request.url).searchParams.get("dias") || 7);
  if (n === 30 || n === 90) return n;
  return 7;
}

export async function registrarEvento(request, env, json, rateLimit) {
  if (!env.CLIENTES_DB) return json({ ok: true });

  let body;
  try {
    body = JSON.parse(await request.text());
  } catch (err) {
    return json({ ok: false, error: "JSON_INVALIDO" }, 400);
  }

  const tipo = String(body.tipo || "");
  if (!TIPOS.has(tipo)) return json({ ok: false, error: "TIPO" }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || "local";
  if (typeof rateLimit === "function" && !(await rateLimit(env, "evt:" + ip, 240))) {
    return json({ ok: true });
  }

  const visitante = texto(body.visitante, 64).replace(/[^a-zA-Z0-9]/g, "");
  const sesion = texto(body.sesion, 64).replace(/[^a-zA-Z0-9]/g, "");
  if (visitante.length < 8 || sesion.length < 8) return json({ ok: true });

  let referrer = texto(body.referrer, 200);
  if (!referrer || /andesautoparts/i.test(referrer)) referrer = "directo";
  else referrer = referrer.replace(/^https?:\/\//i, "").split("/")[0].slice(0, 120);

  const dispositivo = DISPOSITIVOS.has(body.dispositivo) ? body.dispositivo : "escritorio";
  const duracion = Math.max(0, Math.min(30 * 60 * 1000, Math.round(Number(body.duracion_ms) || 0)));

  await env.CLIENTES_DB.prepare(
    `INSERT INTO analitica_eventos (
      visitante, sesion, tipo, path, titulo, producto_id, producto_titulo,
      referrer, dispositivo, duracion_ms, creado_en
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      visitante,
      sesion,
      tipo,
      texto(body.path, 300),
      texto(body.titulo, 180),
      texto(body.producto_id, 40),
      texto(body.producto_titulo, 180),
      referrer,
      dispositivo,
      duracion,
      ahoraIso()
    )
    .run();

  return json({ ok: true });
}

export async function resumenAnalitica(request, env, json, exigirSesion) {
  const r = await exigirSesion(env, request, json);
  if (r.error) return r.error;
  if (r.usuario.rol !== "admin") {
    return json({ ok: false, error: "PROHIBIDO", message: "Solo el administrador" }, 403);
  }
  if (!env.CLIENTES_DB) return json({ ok: false, error: "DB_NO_CONFIGURADA" }, 500);

  const dias = diasPedidos(request);
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const corte = new Date(Date.now() - 180 * 86400000).toISOString();
  await env.CLIENTES_DB.prepare("DELETE FROM analitica_eventos WHERE creado_en < ?")
    .bind(corte)
    .run();

  const db = env.CLIENTES_DB;
  const [paginas, visitantes, sesiones, tiempo, productosN, whatsapp, carritos, busquedas, porDia, topPaginas, topProductos, dispositivos, origenes] =
    await Promise.all([
      db.prepare("SELECT COUNT(*) AS n FROM analitica_eventos WHERE tipo = 'page' AND creado_en >= ?").bind(desde).first(),
      db.prepare("SELECT COUNT(DISTINCT visitante) AS n FROM analitica_eventos WHERE tipo = 'page' AND creado_en >= ?").bind(desde).first(),
      db.prepare("SELECT COUNT(DISTINCT sesion) AS n FROM analitica_eventos WHERE tipo = 'page' AND creado_en >= ?").bind(desde).first(),
      db.prepare(
        "SELECT AVG(duracion_ms) AS n FROM analitica_eventos WHERE tipo = 'tiempo' AND creado_en >= ? AND duracion_ms >= 1000 AND duracion_ms <= 1800000"
      ).bind(desde).first(),
      db.prepare("SELECT COUNT(*) AS n FROM analitica_eventos WHERE tipo = 'producto' AND creado_en >= ?").bind(desde).first(),
      db.prepare("SELECT COUNT(*) AS n FROM analitica_eventos WHERE tipo = 'whatsapp' AND creado_en >= ?").bind(desde).first(),
      db.prepare("SELECT COUNT(*) AS n FROM analitica_eventos WHERE tipo = 'carrito' AND creado_en >= ?").bind(desde).first(),
      db.prepare("SELECT COUNT(*) AS n FROM analitica_eventos WHERE tipo = 'busqueda' AND creado_en >= ?").bind(desde).first(),
      db.prepare(
        `SELECT substr(creado_en, 1, 10) AS dia,
                SUM(CASE WHEN tipo = 'page' THEN 1 ELSE 0 END) AS paginas,
                COUNT(DISTINCT CASE WHEN tipo = 'page' THEN visitante END) AS visitantes
         FROM analitica_eventos
         WHERE creado_en >= ?
         GROUP BY dia
         ORDER BY dia`
      ).bind(desde).all(),
      db.prepare(
        `SELECT path, COUNT(*) AS vistas
         FROM analitica_eventos
         WHERE tipo = 'page' AND creado_en >= ?
         GROUP BY path
         ORDER BY vistas DESC
         LIMIT 8`
      ).bind(desde).all(),
      db.prepare(
        `SELECT producto_id, producto_titulo, COUNT(*) AS clics
         FROM analitica_eventos
         WHERE tipo = 'producto' AND creado_en >= ?
         GROUP BY producto_id, producto_titulo
         ORDER BY clics DESC
         LIMIT 8`
      ).bind(desde).all(),
      db.prepare(
        `SELECT dispositivo, COUNT(DISTINCT sesion) AS sesiones
         FROM analitica_eventos
         WHERE tipo = 'page' AND creado_en >= ?
         GROUP BY dispositivo
         ORDER BY sesiones DESC`
      ).bind(desde).all(),
      db.prepare(
        `SELECT referrer AS origen, COUNT(DISTINCT sesion) AS sesiones
         FROM analitica_eventos
         WHERE tipo = 'page' AND creado_en >= ? AND referrer != ''
         GROUP BY referrer
         ORDER BY sesiones DESC
         LIMIT 6`
      ).bind(desde).all(),
    ]);

  const num = (row) => Number(row && row.n) || 0;
  return json({
    ok: true,
    dias,
    resumen: {
      paginas: num(paginas),
      visitantes: num(visitantes),
      sesiones: num(sesiones),
      tiempo_promedio_ms: Math.round(num(tiempo)),
      clics_producto: num(productosN),
      clics_whatsapp: num(whatsapp),
      carritos: num(carritos),
      busquedas: num(busquedas),
    },
    por_dia: (porDia.results || []).map((row) => ({
      dia: row.dia,
      paginas: Number(row.paginas) || 0,
      visitantes: Number(row.visitantes) || 0,
    })),
    paginas: (topPaginas.results || []).map((row) => ({
      path: row.path || "/",
      vistas: Number(row.vistas) || 0,
    })),
    productos: (topProductos.results || []).map((row) => ({
      producto_id: row.producto_id || "",
      producto_titulo: row.producto_titulo || "Producto",
      clics: Number(row.clics) || 0,
    })),
    dispositivos: (dispositivos.results || []).map((row) => ({
      dispositivo: row.dispositivo || "escritorio",
      sesiones: Number(row.sesiones) || 0,
    })),
    origenes: (origenes.results || []).map((row) => ({
      origen: row.origen || "directo",
      sesiones: Number(row.sesiones) || 0,
    })),
  });
}
