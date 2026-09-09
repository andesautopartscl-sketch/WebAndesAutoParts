/**
 * Configuración del formulario de contacto (sin servidor propio).
 *
 * Opción A — correo al buzón (recomendado):
 *   1) Entra en https://web3forms.com y registra el correo andesautopartscl@gmail.com
 *   2) Copia la "Access Key" y pégala abajo.
 *
 * Opción B — sin clave:
 *   Si dejas web3formsAccessKey vacío, al enviar se abrirá WhatsApp con el texto
 *   y luego la página de gracias (no pasa por FormSubmit ni dominios rotos).
 */
window.ANDES_CONTACT = {
  web3formsAccessKey: "d243c6f5-90d4-492f-b386-83c8c8ab9bdf",
  whatsappNumber: "56926152826",
};

/**
 * Backend de pedidos (Cloudflare Worker + Resend).
 *
 * Web3Forms solo le puede escribir al buzón dueño de la access key, así que
 * con él el cliente nunca recibía copia y el correo de "compra confirmada"
 * era imposible. El Worker manda los dos correos, guarda el pedido y recibe
 * el comprobante adjunto.
 *
 * Si `workerUrl` queda vacío, el checkout vuelve a avisar por Web3Forms: el
 * pedido llega a Andes igual, pero sin copia al cliente ni adjunto.
 */
window.ANDES_PEDIDOS = {
  workerUrl: "https://andes-autoparts-ml-sync.andesautoparts.workers.dev",

  comprobante: {
    habilitado: true,
    maxMb: 5,
    tipos: "image/jpeg,image/png,image/webp,image/heic,application/pdf",
  },
};

/**
 * Cloudflare Turnstile (“No soy un robot”).
 * 1) https://dash.cloudflare.com → Turnstile → Add site (andesautoparts.cl)
 * 2) Pega el Site Key aquí
 * 3) Guarda el Secret Key en el Worker:
 *      cd worker && npx wrangler secret put TURNSTILE_SECRET_KEY
 * Hasta que configures ambos, el login funciona sin el widget (solo rate-limit).
 */
window.ANDES_TURNSTILE = {
  siteKey: "0x4AAAAAAEuORxljI0ZODWBS",
};

/**
 * Datos de pago que usa checkout.html.
 *
 * Los campos de `transferencia` se muestran tal cual al cliente cuando elige
 * pagar por transferencia bancaria, así que cualquier cambio de cuenta se
 * hace acá y en ningún otro lado.
 *
 * `mercadoPago` y `webpay` quedan en false a propósito: mientras estén así,
 * el checkout los muestra con la etiqueta "Próximamente" y deshabilitados.
 * Cuando la integración esté lista, se ponen en true.
 */
window.ANDES_PAGO = {
  transferencia: {
    habilitado: true,
    titular: "Andes Auto Parts Ltda.",
    rut: "78.074.288-7",
    banco: "Banco Mercado Pago",
    tipoCuenta: "Cuenta Vista",
    numeroCuenta: "1011755563",
    email: "finanzasandesautoparts@gmail.com",
  },
  whatsapp: {
    habilitado: true,
  },
  mercadoPago: {
    habilitado: false,
  },
  webpay: {
    habilitado: false,
  },

  textos: {
    antesDePagar:
      "Transfiere el monto exacto y usa tu número de pedido como referencia o " +
      "comentario. Después marca la casilla de abajo y confirma: así nos llega " +
      "el pedido ya pagado y lo preparamos de inmediato.",
    reembolso:
      "Al recibir tu pedido verificamos el pago y el stock. Si por cualquier motivo " +
      "no tenemos la pieza, te devolvemos el 100% del monto a la misma cuenta desde " +
      "la que transferiste, sin trámites.",
  },
};

/**
 * Política de despacho que muestra el checkout.
 *
 * En el Gran Santiago hay dos precios de reparto propio:
 *   - gratis si la compra llega al monto mínimo, y
 *   - $5.990 si todavía no llega (para no perder la venta ni mandar
 *     al cliente a Starken/Chilexpress dentro de nuestra zona).
 *
 * Fuera de esa zona (periurbano RM y regiones) el envío sigue por pagar:
 * el cliente elige la empresa y le paga el flete directamente a ella.
 *
 * El checkout le promete todo esto al cliente en pantalla, así que lo de acá
 * abajo tiene que reflejar la operación real.
 */
window.ANDES_ENVIO = {
  regionGratis: "Metropolitana de Santiago",

  // Retiro en nuestra dirección. Tiene que coincidir con el NAP de index.html
  // y de Google Business Profile: si cambia la dirección, cambia en los tres.
  retiro: {
    direccion: "Salas 8973, La Cisterna",
    ciudad: "Región Metropolitana",
    horario: "Lunes a viernes de 8:00 a 18:00 · Sábado de 9:00 a 14:00",
    mapa: "https://www.google.com/maps/search/?api=1&query=Salas+8973,+La+Cisterna,+Chile",
    aviso:
      "Te avisamos por WhatsApp cuando el pedido esté listo. Trae tu número de " +
      "pedido y tu cédula para retirarlo.",
  },

  // Compra mínima para el despacho gratis. $49.990 en vez de $50.000: se ve
  // más alcanzable y calza con precios terminados en 990.
  montoMinimoGratis: 49990,

  // Lo que cobramos por el reparto propio cuando la compra está en el Gran
  // Santiago pero aún no llega al mínimo. Al cruzar el mínimo, este monto
  // desaparece del total.
  costoDespachoBajoMinimo: 5990,

  // Comunas de la Región Metropolitana que quedan FUERA del despacho propio:
  // todo el periurbano y el sector rural de la región. Lo que queda cubierto
  // es el Gran Santiago, o sea las 32 comunas de la provincia de Santiago más
  // Puente Alto y San Bernardo, que son parte de la mancha urbana continua.
  //
  // Va escrito como exclusión y no como lista de comunas cubiertas porque así
  // se ajusta agregando o borrando un nombre, sin mantener 34.
  comunasSinDespachoGratis: [
    // Provincia de Talagante
    "El Monte",
    "Isla de Maipo",
    "Padre Hurtado",
    "Peñaflor",
    "Talagante",
    // Provincia de Melipilla
    "Alhué",
    "Curacaví",
    "María Pinto",
    "Melipilla",
    "San Pedro",
    // Provincia de Chacabuco
    "Colina",
    "Lampa",
    "Tiltil",
    // Provincia de Maipo. San Bernardo no va acá: es Gran Santiago.
    "Buin",
    "Calera de Tango",
    "Paine",
    // Provincia de Cordillera. Puente Alto no va acá: es Gran Santiago.
    "Pirque",
    "San José de Maipo",
  ],

  // Empresas con las que despachamos habitualmente. Alimentan tanto los textos
  // del checkout como las opciones que ve el cliente, así que basta agregar o
  // quitar una acá para que cambie en todas partes.
  couriers: ["Starken", "Chilexpress"],

  textos: {
    retiro: "Retiras sin costo en {direccion}. {horario}.",
    gratis: "Despacho gratis a tu comuna. No pagas nada por el envío.",
    faltaMonto:
      "El despacho gratis a tu comuna aplica desde {minimo} y te faltan {falta}. " +
      "Si compras así, el envío a domicilio cuesta {costo} (IVA incluido). Al llegar " +
      "al mínimo, ese cobro se quita.",
    periurbano:
      "Tu comuna queda fuera de nuestro reparto. Despachamos por {couriers} " +
      "y el flete lo pagas tú directamente a la empresa al retirar.",
    regiones:
      "Envío por pagar: despachamos por {couriers} y el flete lo pagas tú directamente " +
      "a la empresa al retirar tu pedido.",
    sinRegion: "Selecciona tu región y comuna para saber el costo del despacho.",
    otraEmpresa:
      "No trabajamos con todas las empresas de transporte. Escríbenos para confirmar " +
      "que despachamos por esa antes de que pagues.",
    // Solo aplica al reparto propio en el Gran Santiago (gratis o con el
    // cobro fijo bajo el mínimo). Pedidos confirmados = transferencia hecha
    // y pedido enviado en el checkout.
    plazoGranSantiago:
      "En el Gran Santiago, si confirmas tu pedido antes de las 10:00 am, lo " +
      "despachamos el mismo día entre las 14:00 y las 22:00. Después de las " +
      "10:00 am, la entrega queda para el día siguiente.",
  },
};
