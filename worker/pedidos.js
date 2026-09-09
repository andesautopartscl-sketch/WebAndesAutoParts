/**
 * Pedidos de la tienda directa.
 *
 * Web3Forms solo puede avisarle al buzón dueño de la access key, así que el
 * cliente nunca recibía copia y el correo de "compra confirmada" era
 * imposible: no es un envío de formulario sino algo que Andes dispara después
 * de revisar el abono. Todo eso vive acá.
 *
 * Rutas:
 *   POST /orders               — el checkout crea el pedido (público)
 *   GET  /orders/accion        — página con el botón de confirmar o rechazar
 *   POST /orders/accion        — ejecuta la acción y le escribe al cliente
 *   GET  /orders/lista         — pedidos guardados (requiere el secreto)
 *
 * El correo que le llega a Andes trae dos enlaces firmados con un token
 * propio de ese pedido, no con WORKER_SYNC_SECRET: si uno se filtra, solo
 * compromete ese pedido. Y los enlaces abren una página con un botón en vez
 * de ejecutar la acción al abrirse, porque los antivirus de correo siguen los
 * enlaces y dispararían la confirmación solos.
 */

const KV_PEDIDO = "PEDIDO:";
const KV_CUOTA = "PEDIDOS_DIA:";

/** Tope diario de pedidos: el endpoint es público y Resend regala 100/día. */
const MAX_PEDIDOS_DIA = 60;
const MAX_ADJUNTO_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 50;

/* ============================== Utilidades ============================== */

function esc(valor) {
  return String(valor == null ? "" : valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clp(valor) {
  const n = Number(valor) || 0;
  try {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    }).format(n);
  } catch (err) {
    return "$" + n;
  }
}

function texto(valor, largoMax) {
  return String(valor == null ? "" : valor)
    .trim()
    .slice(0, largoMax);
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

/* ============================== Validación ============================== */

/**
 * El cuerpo llega del navegador, así que nada se da por bueno. Devuelve el
 * pedido ya saneado o un mensaje de error.
 */
function validarPedido(body) {
  if (!body || typeof body !== "object") return { error: "Cuerpo inválido" };

  const numero = texto(body.numero, 32);
  if (!/^AAP-\d{6}-\d{4}$/.test(numero)) return { error: "Número de pedido inválido" };

  const cliente = body.cliente || {};
  const nombre = texto(cliente.nombre, 120);
  const email = texto(cliente.email, 160);
  if (nombre.length < 3) return { error: "Falta el nombre del cliente" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Correo inválido" };

  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  if (!items.length) return { error: "El pedido no trae productos" };

  const limpios = items.map((it) => ({
    id: texto(it.id, 40),
    titulo: texto(it.titulo, 200),
    sku: texto(it.sku, 60),
    qty: Math.max(1, Math.min(999, Number(it.qty) || 1)),
    precio: Math.max(0, Number(it.precio) || 0),
  }));

  const comprobante = body.comprobante || null;
  if (comprobante) {
    const datos = String(comprobante.datos || "");
    // base64 crece un tercio sobre el tamaño real del archivo.
    if (datos.length * 0.75 > MAX_ADJUNTO_BYTES) {
      return { error: "El comprobante supera los 5 MB" };
    }
    if (!/^[A-Za-z0-9+/=]+$/.test(datos)) return { error: "Comprobante ilegible" };
  }

  const entrega = body.entrega || {};
  // El flete propio solo aplica en Gran Santiago bajo el mínimo. Lo acotamos
  // para que un cliente no pueda inventarse un cobro absurdo desde el navegador.
  const costoDespacho = Math.max(0, Math.min(20000, Math.round(Number(entrega.costo) || 0)));
  const subtotal = limpios.reduce((acc, it) => acc + it.precio * it.qty, 0);
  const pago = body.pago || {};

  return {
    pedido: {
      numero,
      creado: new Date().toISOString(),
      estado: "pendiente",
      cliente: {
        nombre,
        email,
        telefono: texto(cliente.telefono, 40),
        rut: texto(cliente.rut, 20),
        documento: cliente.documento === "factura" ? "factura" : "boleta",
        razonSocial: texto(cliente.razonSocial, 160),
        giro: texto(cliente.giro, 160),
      },
      entrega: {
        modo: entrega.modo === "retiro" ? "retiro" : "envio",
        direccion: texto(entrega.direccion, 200),
        comuna: texto(entrega.comuna, 80),
        region: texto(entrega.region, 80),
        despacho: texto(entrega.despacho, 40),
        costo: costoDespacho,
        transporte: texto(entrega.transporte, 80),
      },
      pago: {
        metodo: pago.metodo === "whatsapp" ? "whatsapp" : "transferencia",
        declarado: pago.declarado === true,
      },
      items: limpios,
      subtotal,
      total: subtotal + costoDespacho,
      notas: texto(body.notas, 1000),
      comprobanteNombre: comprobante ? texto(comprobante.nombre, 120) : "",
    },
    comprobante,
  };
}

/* ================================ Correo ================================ */

async function enviarCorreo(env, { para, asunto, html, responderA, adjuntos }) {
  const key = (env.RESEND_API_KEY || "").trim();
  if (!key) throw new Error("RESEND_API_KEY no está configurado en el Worker");

  const cuerpo = {
    from: env.PEDIDOS_FROM || "Andes Auto Parts <pedidos@andesautoparts.cl>",
    to: [para],
    subject: asunto,
    html,
  };
  if (responderA) cuerpo.reply_to = responderA;
  if (adjuntos && adjuntos.length) cuerpo.attachments = adjuntos;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cuerpo),
  });

  if (!res.ok) {
    const detalle = await res.text();
    throw new Error(`Resend respondió ${res.status}: ${detalle.slice(0, 300)}`);
  }
  return res.json();
}

/* ============================== Plantillas ============================== */

const MARCA = "#0f2440";

function totalPedido(pedido) {
  return Number(pedido.total) || Number(pedido.subtotal) || 0;
}

function envoltura(titulo, contenido) {
  return `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f4f6f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e9f0">
<tr><td style="background:${MARCA};padding:18px 24px;color:#fff;font-size:16px;font-weight:700">Andes Auto Parts</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 16px;font-size:19px;color:${MARCA}">${esc(titulo)}</h1>
${contenido}
</td></tr>
<tr><td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e9f0;font-size:12px;color:#6b7280">
Andes Auto Parts · Salas 8973, La Cisterna · andesautoparts.cl
</td></tr>
</table></td></tr></table></body></html>`;
}

function tablaItems(pedido) {
  const filas = pedido.items
    .map(
      (it) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #eef1f5">${esc(it.qty)}× ${esc(
          it.titulo
        )}${it.sku ? `<br><span style="color:#6b7280;font-size:12px">${esc(it.sku)}</span>` : ""}</td>
<td style="padding:6px 0;border-bottom:1px solid #eef1f5;text-align:right;white-space:nowrap">${clp(
          it.precio * it.qty
        )}</td></tr>`
    )
    .join("");

  return `<table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse">
${filas}
<tr><td style="padding:8px 0;border-bottom:1px solid #eef1f5">Subtotal productos</td>
<td style="padding:8px 0;border-bottom:1px solid #eef1f5;text-align:right">${clp(pedido.subtotal)}</td></tr>
${
  pedido.entrega && pedido.entrega.costo > 0
    ? `<tr><td style="padding:8px 0;border-bottom:1px solid #eef1f5">Despacho</td>
<td style="padding:8px 0;border-bottom:1px solid #eef1f5;text-align:right">${clp(pedido.entrega.costo)}</td></tr>`
    : ""
}
<tr><td style="padding:10px 0;font-weight:700">Total</td>
<td style="padding:10px 0;text-align:right;font-weight:700">${clp(pedido.total || pedido.subtotal)}</td></tr>
</table>`;
}

function lineaEntrega(pedido) {
  if (pedido.entrega.modo === "retiro") {
    return "Retiro en Salas 8973, La Cisterna.";
  }
  const destino = [pedido.entrega.direccion, pedido.entrega.comuna, pedido.entrega.region]
    .filter(Boolean)
    .join(", ");
  let flete;
  if (pedido.entrega.despacho === "Gratis") {
    flete =
      "Despacho sin costo. Si el pedido se confirmó antes de las 10:00 am, sale el mismo día entre 14:00 y 22:00; si fue después, al día siguiente.";
  } else if (pedido.entrega.costo > 0) {
    flete = `Despacho ${clp(pedido.entrega.costo)} con IVA incluido (incluido en el total).`;
  } else {
    flete = `Envío por pagar${pedido.entrega.transporte ? " por " + pedido.entrega.transporte : ""}.`;
  }
  return `${destino}. ${flete}`;
}

function correoAndes(pedido, urlBase, token) {
  const enlace = (accion) =>
    `${urlBase}/orders/accion?numero=${encodeURIComponent(pedido.numero)}&token=${token}&accion=${accion}`;

  const cliente = pedido.cliente;
  const datos = [
    ["Cliente", cliente.nombre],
    ["Correo", cliente.email],
    ["Teléfono", cliente.telefono],
    ["Documento", cliente.documento === "factura" ? "Factura" : "Boleta"],
    ["RUT", cliente.rut],
    ["Razón social", cliente.razonSocial],
    ["Giro", cliente.giro],
    ["Entrega", lineaEntrega(pedido)],
    ["Comentarios", pedido.notas],
  ]
    .filter((p) => p[1])
    .map(
      (p) =>
        `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;vertical-align:top">${esc(
          p[0]
        )}</td><td style="padding:3px 0">${esc(p[1])}</td></tr>`
    )
    .join("");

  const pago =
    pedido.pago.metodo === "whatsapp"
      ? '<p style="margin:0;padding:12px;background:#f6f8fb;border-radius:8px;font-size:14px">Pago por coordinar en WhatsApp.</p>'
      : pedido.pago.declarado
      ? `<p style="margin:0;padding:12px;background:#f0fdf4;border-left:3px solid #15803d;border-radius:0 8px 8px 0;font-size:14px"><strong>El cliente declara que ya transfirió ${clp(
          totalPedido(pedido)
        )}.</strong> Verifica el abono con la referencia ${esc(pedido.numero)}.${
          pedido.comprobanteNombre
            ? ` Adjuntó el comprobante <em>${esc(pedido.comprobanteNombre)}</em>.`
            : " No adjuntó comprobante."
        }</p>`
      : '<p style="margin:0;padding:12px;background:#fffbeb;border-left:3px solid #b45309;border-radius:0 8px 8px 0;font-size:14px">Transferencia todavía pendiente.</p>';

  return envoltura(
    `Pedido ${pedido.numero}`,
    `${pago}
<table role="presentation" width="100%" style="margin:18px 0;font-size:14px;border-collapse:collapse">${datos}</table>
${tablaItems(pedido)}
<p style="margin:22px 0 10px;font-size:14px;color:#6b7280">Cuando revises el abono y el stock:</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:10px"><a href="${enlace("confirmar")}" style="display:inline-block;padding:11px 18px;background:#15803d;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Tenemos el repuesto: confirmar</a></td>
<td style="padding-right:10px"><a href="${enlace("despachado")}" style="display:inline-block;padding:11px 18px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Pedido despachado</a></td>
<td><a href="${enlace("rechazar")}" style="display:inline-block;padding:11px 18px;background:#fff;color:#b91c1c;border:1px solid #b91c1c;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Sin stock: reembolsar</a></td>
</tr></table>
<p style="margin:14px 0 0;font-size:12px;color:#9ca3af">Los botones abren una página con la confirmación; nada se envía solo.</p>`
  );
}

function correoClienteRecibido(pedido) {
  const siguiente =
    pedido.pago.metodo === "whatsapp"
      ? "Te escribimos por WhatsApp para coordinar el pago y la entrega."
      : pedido.pago.declarado
      ? "Estamos verificando tu transferencia y el stock. Te avisamos por este mismo correo apenas quede confirmada."
      : `Transfiere ${clp(totalPedido(pedido))} usando <strong>${esc(
          pedido.numero
        )}</strong> como referencia y avísanos con el comprobante.`;

  return envoltura(
    "Recibimos tu pedido",
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Hola ${esc(
      pedido.cliente.nombre.split(" ")[0]
    )}, tu pedido quedó registrado con el número <strong>${esc(pedido.numero)}</strong>.</p>
<p style="margin:0 0 18px;padding:12px;background:#f6f8fb;border-radius:8px;font-size:14px;line-height:1.6">${siguiente}</p>
${tablaItems(pedido)}
<p style="margin:18px 0 0;font-size:14px;line-height:1.6"><strong>Entrega:</strong> ${esc(
      lineaEntrega(pedido)
    )}</p>
<p style="margin:18px 0 0;font-size:13px;color:#6b7280;line-height:1.6">Si no tenemos la pieza te devolvemos el 100% del monto: solo te pediremos tus datos bancarios para hacer la transferencia. Cualquier duda, respóndenos este correo o escríbenos al +56 9 2615 2826.</p>`
  );
}

function correoClienteConfirmado(pedido) {
  const cierre =
    pedido.entrega.modo === "retiro"
      ? "Ya puedes pasar a retirarlo a Salas 8973, La Cisterna. Trae tu número de pedido y tu cédula."
      : pedido.entrega.despacho === "Gratis"
      ? "Lo despachamos a tu dirección sin costo. Si confirmaste antes de las 10:00 am, sale hoy entre 14:00 y 22:00; si fue después, mañana. Te avisamos cuando salga."
      : pedido.entrega.costo > 0
      ? `El despacho (${clp(pedido.entrega.costo)} con IVA incluido) ya estaba en tu transferencia. Te avisamos cuando salga.`
      : `Lo despachamos por ${esc(
          pedido.entrega.transporte || "la empresa que elegiste"
        )} y te enviamos el número de seguimiento. El flete lo pagas al retirar.`;

  return envoltura(
    "Tu compra está confirmada",
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Hola ${esc(
      pedido.cliente.nombre.split(" ")[0]
    )}, verificamos tu pago y tenemos el repuesto disponible.</p>
<p style="margin:0 0 18px;padding:14px;background:#f0fdf4;border-left:3px solid #15803d;border-radius:0 8px 8px 0;font-size:15px;line-height:1.6"><strong>Tu compra ${esc(
      pedido.numero
    )} ha sido confirmada.</strong> ${cierre}</p>
${tablaItems(pedido)}
<p style="margin:18px 0 0;font-size:13px;color:#6b7280;line-height:1.6">Gracias por comprarnos directo. Cualquier duda, responde este correo o escríbenos al +56 9 2615 2826.</p>`
  );
}

function correoClienteRechazado(pedido) {
  return envoltura(
    "No pudimos completar tu pedido",
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Hola ${esc(
      pedido.cliente.nombre.split(" ")[0]
    )}, revisamos tu pedido <strong>${esc(
      pedido.numero
    )}</strong> y lamentablemente no tenemos disponible el repuesto.</p>
<p style="margin:0 0 18px;padding:14px;background:#fffbeb;border-left:3px solid #b45309;border-radius:0 8px 8px 0;font-size:15px;line-height:1.6">Te devolvemos ${clp(
      totalPedido(pedido)
    )} entre 30 minutos y 1 hora después de que nos respondas este correo con tus datos de devolución.</p>
<p style="margin:0 0 18px;font-size:14px;line-height:1.6">Para hacerte la devolución necesitamos tus datos bancarios. <strong>Responde este correo</strong> con:</p>
<ul style="margin:0 0 18px;padding-left:20px;font-size:14px;line-height:1.8;color:#1f2937">
<li>Nombre del titular de la cuenta</li>
<li>RUT del titular</li>
<li>Banco</li>
<li>Tipo de cuenta (corriente, vista, ahorro, RUT)</li>
<li>Número de cuenta</li>
</ul>
<p style="margin:0;font-size:14px;line-height:1.6">Si quieres, también podemos buscar una alternativa compatible con tu vehículo. Escríbenos al +56 9 2615 2826.</p>`
  );
}

function correoClienteDespachado(pedido) {
  const cierre =
    pedido.entrega.modo === "retiro"
      ? "Tu pedido ya está listo para retiro en Salas 8973, La Cisterna. Te esperamos con tu número de pedido y tu cédula."
      : pedido.entrega.costo > 0 || pedido.entrega.despacho === "Gratis"
      ? "Tu pedido ya va en camino hacia la dirección registrada. Si necesitamos una referencia adicional para completar la entrega, te contactaremos a la brevedad."
      : `Tu pedido ya fue entregado a ${esc(
          pedido.entrega.transporte || "la empresa de transporte"
        )}. Te compartiremos el seguimiento apenas quede disponible.`;

  return envoltura(
    "Tu pedido va en camino",
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Hola ${esc(
      pedido.cliente.nombre.split(" ")[0]
    )}, tu pedido <strong>${esc(pedido.numero)}</strong> ya fue despachado.</p>
<p style="margin:0 0 18px;padding:14px;background:#eff6ff;border-left:3px solid #1d4ed8;border-radius:0 8px 8px 0;font-size:15px;line-height:1.6"><strong>Tu compra ya va en camino.</strong> ${cierre}</p>
${tablaItems(pedido)}
<p style="margin:18px 0 0;font-size:13px;color:#6b7280;line-height:1.6">Gracias por comprar en Andes Auto Parts. Si necesitas ayuda con la recepción de tu pedido, responde este correo o escríbenos al +56 9 2615 2826.</p>`
  );
}

/* =============================== Guardado =============================== */

async function dentroDeCuota(env) {
  if (!env.TOKEN_KV) return true;
  const clave = KV_CUOTA + hoy();
  const actual = Number((await env.TOKEN_KV.get(clave)) || 0);
  if (actual >= MAX_PEDIDOS_DIA) return false;
  // 48 h de vida: sobra para cubrir el día en cualquier huso horario.
  await env.TOKEN_KV.put(clave, String(actual + 1), { expirationTtl: 172800 });
  return true;
}

async function leerPedido(env, numero) {
  if (!env.TOKEN_KV) return null;
  const crudo = await env.TOKEN_KV.get(KV_PEDIDO + numero);
  if (!crudo) return null;
  try {
    return JSON.parse(crudo);
  } catch (err) {
    return null;
  }
}

async function guardarPedido(env, pedido) {
  if (!env.TOKEN_KV) return;
  // Un año: los pedidos son respaldo contable, no caché.
  await env.TOKEN_KV.put(KV_PEDIDO + pedido.numero, JSON.stringify(pedido), {
    expirationTtl: 31536000,
  });
}

/* =============================== Handlers =============================== */

async function crearPedido(request, env, json) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ ok: false, error: "JSON_INVALIDO" }, 400);
  }

  const { error, pedido, comprobante } = validarPedido(body);
  if (error) return json({ ok: false, error: "PEDIDO_INVALIDO", message: error }, 400);

  if (!(await dentroDeCuota(env))) {
    return json({ ok: false, error: "CUOTA_DIARIA" }, 429);
  }

  pedido.token = crypto.randomUUID().replace(/-/g, "");
  await guardarPedido(env, pedido);

  const urlBase = new URL(request.url).origin;
  const avisoAndes = env.PEDIDOS_AVISO || "andesautopartscl@gmail.com";
  const adjuntos = comprobante
    ? [{ filename: pedido.comprobanteNombre || "comprobante", content: comprobante.datos }]
    : [];

  // El correo al cliente no puede tumbar el aviso interno ni al revés: un
  // pedido pagado que no nos llega es plata perdida.
  const resultados = await Promise.allSettled([
    enviarCorreo(env, {
      para: avisoAndes,
      asunto: `Pedido ${pedido.numero} · ${clp(totalPedido(pedido))}`,
      html: correoAndes(pedido, urlBase, pedido.token),
      responderA: pedido.cliente.email,
      adjuntos,
    }),
    enviarCorreo(env, {
      para: pedido.cliente.email,
      asunto: `Recibimos tu pedido ${pedido.numero}`,
      html: correoClienteRecibido(pedido),
      responderA: avisoAndes,
    }),
  ]);

  return json({
    ok: true,
    numero: pedido.numero,
    aviso_interno: resultados[0].status === "fulfilled",
    copia_cliente: resultados[1].status === "fulfilled",
    detalle: resultados
      .filter((r) => r.status === "rejected")
      .map((r) => String(r.reason && r.reason.message).slice(0, 200)),
  });
}

function paginaAccion(pedido, accion, urlBase, token) {
  const confirmar = accion === "confirmar";
  const despachado = accion === "despachado";
  const titulo = confirmar
    ? "Confirmar la compra"
    : despachado
    ? "Avisar pedido despachado"
    : "Avisar que no hay stock";
  const detalle = confirmar
    ? `Le vamos a escribir a ${esc(pedido.cliente.email)} diciendo que su compra est? confirmada.`
    : despachado
    ? `Le vamos a escribir a ${esc(pedido.cliente.email)} diciendo que su pedido ya va en camino.`
    : `Le vamos a escribir a ${esc(
        pedido.cliente.email
      )} diciendo que no tenemos la pieza y que le devolvemos ${clp(totalPedido(pedido))}.`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(titulo)} ? ${esc(pedido.numero)}</title></head>
<body style="margin:0;padding:24px;background:#f4f6f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<div style="max-width:460px;margin:0 auto;background:#fff;border:1px solid #e5e9f0;border-radius:12px;padding:24px">
<h1 style="margin:0 0 8px;font-size:19px;color:${MARCA}">${esc(titulo)}</h1>
<p style="margin:0 0 6px;font-size:14px;color:#6b7280">Pedido ${esc(pedido.numero)} ? ${esc(
    pedido.cliente.nombre
  )} ? ${clp(totalPedido(pedido))}</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6">${detalle}</p>
${
  pedido.estado !== "pendiente"
    ? `<p style="margin:0;padding:12px;background:#fffbeb;border-radius:8px;font-size:14px">Este pedido ya est? marcado como <strong>${esc(
        pedido.estado
      )}</strong>. Si env?as de nuevo, el cliente recibir? otro correo.</p><div style="height:14px"></div>`
    : ""
}
<form method="POST" action="${urlBase}/orders/accion">
<input type="hidden" name="numero" value="${esc(pedido.numero)}">
<input type="hidden" name="token" value="${esc(token)}">
<input type="hidden" name="accion" value="${esc(accion)}">
<button type="submit" style="width:100%;padding:14px;border:0;border-radius:10px;background:${
    confirmar ? "#15803d" : despachado ? "#1d4ed8" : "#b91c1c"
  };color:#fff;font-size:15px;font-weight:700;cursor:pointer">
${confirmar ? "Sí, confirmar y avisarle" : despachado ? "Sí, avisarle que va en camino" : "Sí, avisarle del reembolso"}
</button>
</form>
</div></body></html>`;
}

function paginaResultado(titulo, mensaje) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:24px;background:#f4f6f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<div style="max-width:460px;margin:0 auto;background:#fff;border:1px solid #e5e9f0;border-radius:12px;padding:24px;text-align:center">
<h1 style="margin:0 0 10px;font-size:19px;color:${MARCA}">${esc(titulo)}</h1>
<p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563">${esc(mensaje)}</p>
</div></body></html>`;
}

function html(cuerpo, status = 200) {
  return new Response(cuerpo, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function mostrarAccion(url, env) {
  const numero = url.searchParams.get("numero") || "";
  const token = url.searchParams.get("token") || "";
  const accion = url.searchParams.get("accion") || "";

  if (accion !== "confirmar" && accion !== "despachado" && accion !== "rechazar") {
    return html(paginaResultado("Acción desconocida", "El enlace no es válido."), 400);
  }

  const pedido = await leerPedido(env, numero);
  if (!pedido || pedido.token !== token) {
    return html(paginaResultado("Enlace inválido", "No encontramos ese pedido."), 404);
  }

  return html(paginaAccion(pedido, accion, url.origin, token));
}

async function ejecutarAccion(request, env) {
  const form = await request.formData();
  const numero = String(form.get("numero") || "");
  const token = String(form.get("token") || "");
  const accion = String(form.get("accion") || "");

  const pedido = await leerPedido(env, numero);
  if (!pedido || pedido.token !== token) {
    return html(paginaResultado("Enlace inv?lido", "No encontramos ese pedido."), 404);
  }

  const confirmar = accion === "confirmar";
  const despachado = accion === "despachado";
  try {
    await enviarCorreo(env, {
      para: pedido.cliente.email,
      asunto: confirmar
        ? `Tu compra ${pedido.numero} est? confirmada`
        : despachado
        ? `Tu pedido ${pedido.numero} va en camino`
        : `Sobre tu pedido ${pedido.numero}`,
      html: confirmar
        ? correoClienteConfirmado(pedido)
        : despachado
        ? correoClienteDespachado(pedido)
        : correoClienteRechazado(pedido),
      responderA: env.PEDIDOS_AVISO || "andesautopartscl@gmail.com",
    });
  } catch (err) {
    return html(
      paginaResultado("No pudimos enviar el correo", String(err.message).slice(0, 200)),
      502
    );
  }

  pedido.estado = confirmar ? "confirmado" : despachado ? "despachado" : "rechazado";
  pedido.resueltoEn = new Date().toISOString();
  await guardarPedido(env, pedido);

  return html(
    paginaResultado(
      confirmar ? "Compra confirmada" : despachado ? "Pedido despachado" : "Aviso enviado",
      confirmar
        ? `Le avisamos a ${pedido.cliente.email} que su compra est? confirmada.`
        : despachado
        ? `Le avisamos a ${pedido.cliente.email} que su pedido ya va en camino.`
        : `Le avisamos a ${pedido.cliente.email} que no hay stock y que le devuelves ${clp(
            totalPedido(pedido)
          )}.`
    )
  );
}

async function listarPedidos(env, json) {
  if (!env.TOKEN_KV) return json({ ok: false, error: "KV_NO_CONFIGURADO" }, 500);

  const { keys } = await env.TOKEN_KV.list({ prefix: KV_PEDIDO, limit: 200 });
  const pedidos = await Promise.all(
    keys.map(async (k) => {
      const p = await leerPedido(env, k.name.slice(KV_PEDIDO.length));
      if (!p) return null;
      return {
        numero: p.numero,
        creado: p.creado,
        estado: p.estado,
        cliente: p.cliente.nombre,
        email: p.cliente.email,
        subtotal: p.subtotal,
        pagoDeclarado: p.pago.declarado,
      };
    })
  );

  const lista = pedidos.filter(Boolean).sort((a, b) => b.creado.localeCompare(a.creado));
  return json({ ok: true, total: lista.length, pedidos: lista });
}

/* ================================ Router ================================ */

/**
 * Devuelve una Response si la ruta es de pedidos, o null para que worker.js
 * siga con las suyas. `json` y `checkAuth` llegan desde worker.js para no
 * duplicar los encabezados CORS ni el manejo del secreto.
 */
export async function rutearPedidos(path, request, env, { json, checkAuth, unauthorized }) {
  if (path === "/orders" && request.method === "POST") {
    return crearPedido(request, env, json);
  }

  if (path === "/orders/accion" && request.method === "GET") {
    return mostrarAccion(new URL(request.url), env);
  }

  if (path === "/orders/accion" && request.method === "POST") {
    return ejecutarAccion(request, env);
  }

  if (path === "/orders/lista" && request.method === "GET") {
    if (!checkAuth(request, env)) return unauthorized();
    return listarPedidos(env, json);
  }

  return null;
}
