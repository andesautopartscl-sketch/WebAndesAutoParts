#!/usr/bin/env node
/**
 * Sincroniza publicaciones activas de Mercado Libre → data/productos.json
 * Uso: node ml-sync.js  |  npm run sync-ml
 *
 * Primera vez: define ML_AUTH_CODE en .env (código OAuth de un solo uso).
 * Siguientes ejecuciones: usa ML_REFRESH_TOKEN (renueva el access_token).
 * Si solo tienes ML_ACCESS_TOKEN válido, se usa para sincronizar; el refresh_token
 * solo se obtiene al intercambiar ML_AUTH_CODE en POST /oauth/token (no viene en /users/me).
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const ENV_PATH = path.join(ROOT, ".env");
const OUTPUT_PATH = path.join(ROOT, "data", "productos.json");
const API = "https://api.mercadolibre.com";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

function saveEnvFile(filePath, vars) {
  loadEnvFile(filePath);
  const merged = {
    ML_CLIENT_ID: vars.ML_CLIENT_ID || process.env.ML_CLIENT_ID,
    ML_CLIENT_SECRET: vars.ML_CLIENT_SECRET || process.env.ML_CLIENT_SECRET,
    ML_REDIRECT_URI: vars.ML_REDIRECT_URI || process.env.ML_REDIRECT_URI,
    ML_ACCESS_TOKEN: vars.ML_ACCESS_TOKEN || process.env.ML_ACCESS_TOKEN,
    ML_REFRESH_TOKEN: vars.ML_REFRESH_TOKEN || process.env.ML_REFRESH_TOKEN,
  };
  if (vars.clearAuthCode) {
    delete merged.ML_AUTH_CODE;
  } else if (vars.ML_AUTH_CODE) {
    merged.ML_AUTH_CODE = vars.ML_AUTH_CODE;
  }

  const keys = [
    "ML_CLIENT_ID",
    "ML_CLIENT_SECRET",
    "ML_REDIRECT_URI",
    "ML_AUTH_CODE",
    "ML_ACCESS_TOKEN",
    "ML_REFRESH_TOKEN",
  ];
  const lines = [
    "# Credenciales Mercado Libre — no subir a GitHub",
    "# ML_REFRESH_TOKEN: se obtiene solo al intercambiar ML_AUTH_CODE en POST /oauth/token",
    "",
  ];
  for (const key of keys) {
    if (merged[key] != null && String(merged[key]).trim() !== "") {
      lines.push(`${key}=${merged[key]}`);
    }
  }
  lines.push("");
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

function authUrl(clientId, redirectUri, site = "cl") {
  const host = site === "cl" ? "auth.mercadolibre.cl" : "auth.mercadolibre.com.ar";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "offline_access read write",
  });
  return `https://${host}/authorization?${params}`;
}

async function apiRequest(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      data.message || data.error || data.cause?.[0]?.message || res.statusText;
    throw new Error(`API ${res.status}: ${msg} (${url})`);
  }
  return data;
}

async function exchangeAuthCode({ clientId, clientSecret, code, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });
  return apiRequest(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  return apiRequest(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

async function validateAccessToken(accessToken) {
  const me = await apiRequest(`${API}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!me.id) throw new Error("ML_ACCESS_TOKEN inválido o expirado");
  return me;
}

async function resolveTokens(env) {
  const clientId = env.ML_CLIENT_ID;
  const clientSecret = env.ML_CLIENT_SECRET;
  const redirectUri = env.ML_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    throw new Error("Faltan ML_CLIENT_ID o ML_CLIENT_SECRET en .env");
  }

  if (env.ML_REFRESH_TOKEN) {
    console.log("Renovando access_token con refresh_token…");
    const tokens = await refreshAccessToken({
      clientId,
      clientSecret,
      refreshToken: env.ML_REFRESH_TOKEN,
    });
    if (!tokens.refresh_token) {
      console.warn(
        "La API no devolvió refresh_token; se conserva el anterior en .env."
      );
    }
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || env.ML_REFRESH_TOKEN,
      usedAuthCode: false,
    };
  }

  if (env.ML_AUTH_CODE) {
    if (!redirectUri) {
      throw new Error("Falta ML_REDIRECT_URI para intercambiar el código OAuth");
    }
    console.log("Intercambiando código de autorización por tokens…");
    const tokens = await exchangeAuthCode({
      clientId,
      clientSecret,
      code: env.ML_AUTH_CODE,
      redirectUri,
    });
    if (!tokens.refresh_token) {
      console.warn(
        "Respuesta OAuth sin refresh_token. scope recibido:",
        tokens.scope || "(vacío)"
      );
      console.warn(
        "Para obtener refresh_token, autoriza con scope offline_access (ver URL al final del script)."
      );
    }
    if (!tokens.access_token) {
      throw new Error("Mercado Libre no devolvió access_token.");
    }
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      usedAuthCode: true,
    };
  }

  if (env.ML_ACCESS_TOKEN) {
    console.log("Validando ML_ACCESS_TOKEN con /users/me…");
    const me = await validateAccessToken(env.ML_ACCESS_TOKEN);
    console.log(
      `Token válido para vendedor ${me.id} (${me.nickname || ""}).`
    );
    console.log(
      "Nota: /users/me no incluye refresh_token. Para GitHub Actions necesitas un nuevo ML_AUTH_CODE."
    );
    return {
      access_token: env.ML_ACCESS_TOKEN,
      refresh_token: env.ML_REFRESH_TOKEN || null,
      usedAuthCode: false,
    };
  }

  throw new Error(
    "Define ML_REFRESH_TOKEN, ML_AUTH_CODE o ML_ACCESS_TOKEN en .env"
  );
}

async function fetchSellerId(accessToken) {
  const me = await apiRequest(`${API}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const sellerId = me.id;
  if (!sellerId) throw new Error("No se pudo obtener seller_id desde /users/me");
  console.log(`Vendedor: ${sellerId} (${me.nickname || me.first_name || ""})`);
  return sellerId;
}

async function fetchAllActiveItemIds(sellerId, accessToken) {
  const ids = [];
  const limit = 100;
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const url = `${API}/users/${sellerId}/items/search?status=active&offset=${offset}&limit=${limit}`;
    const data = await apiRequest(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const batch = data.results || [];
    ids.push(...batch);
    total = data.paging?.total ?? ids.length;
    offset += limit;
    console.log(`IDs activos: ${ids.length} / ${total}`);
    if (!batch.length) break;
  }

  return ids;
}

async function fetchItemDetail(itemId, accessToken) {
  return apiRequest(`${API}/items/${itemId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function fetchAllItemDetails(itemIds, accessToken) {
  const items = [];
  const concurrency = 8;
  for (let i = 0; i < itemIds.length; i += concurrency) {
    const chunk = itemIds.slice(i, i + concurrency);
    const batch = await Promise.all(
      chunk.map((id) => fetchItemDetail(id, accessToken))
    );
    items.push(...batch);
    console.log(`Detalle: ${items.length} / ${itemIds.length}`);
    if (i + concurrency < itemIds.length) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  return items;
}

function extractSku(item) {
  const attrs = item.attributes || [];
  const skuAttr = attrs.find(
    (a) =>
      a.id === "SELLER_SKU" ||
      a.id === "SKU" ||
      (a.name && a.name.toLowerCase().includes("sku"))
  );
  if (skuAttr) {
    const val = String(
      skuAttr.value_name || skuAttr.values?.[0]?.name || skuAttr.value_id || ""
    ).trim();
    if (val) return val;
  }
  if (item.seller_custom_field) {
    return String(item.seller_custom_field).trim();
  }
  return "";
}

const categoryCache = new Map();

async function getCategoryName(categoryId, accessToken) {
  if (!categoryId) return "Sin categoría";
  if (categoryCache.has(categoryId)) return categoryCache.get(categoryId);
  try {
    const cat = await apiRequest(`${API}/categories/${categoryId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const name = cat.name || categoryId;
    categoryCache.set(categoryId, name);
    return name;
  } catch {
    categoryCache.set(categoryId, categoryId);
    return categoryId;
  }
}

function mainImage(item) {
  const pic = item.pictures && item.pictures[0];
  if (!pic) return "";
  return pic.secure_url || pic.url || "";
}

function mapItem(item, categoryName) {
  return {
    id: item.id,
    sku: extractSku(item),
    titulo: item.title || "",
    precio: Number(item.price) || 0,
    moneda: item.currency_id || "CLP",
    imagen: mainImage(item),
    link: item.permalink || "",
    categoria: categoryName,
    stock: item.available_quantity != null ? item.available_quantity : 0,
    condicion: item.condition === "used" ? "used" : "new",
  };
}

async function main() {
  loadEnvFile(ENV_PATH);
  const env = { ...process.env };

  const tokens = await resolveTokens(env);
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;

  const sellerId = await fetchSellerId(accessToken);
  const itemIds = await fetchAllActiveItemIds(sellerId, accessToken);
  console.log(`Total publicaciones activas: ${itemIds.length}`);

  const rawItems = await fetchAllItemDetails(itemIds, accessToken);
  const productos = [];

  for (const item of rawItems) {
    const categoryName = await getCategoryName(item.category_id, accessToken);
    productos.push(mapItem(item, categoryName));
  }

  productos.sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));

  const withSku = productos.filter((p) => p.sku).length;
  const withoutSku = productos.length - withSku;
  console.log(`SKU: ${withSku} con SKU, ${withoutSku} sin SKU (${productos.length} total)`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(productos, null, 2) + "\n", "utf8");
  console.log(`Escrito: ${OUTPUT_PATH} (${productos.length} productos)`);

  saveEnvFile(ENV_PATH, {
    ML_CLIENT_ID: env.ML_CLIENT_ID,
    ML_CLIENT_SECRET: env.ML_CLIENT_SECRET,
    ML_REDIRECT_URI: env.ML_REDIRECT_URI,
    ML_ACCESS_TOKEN: accessToken,
    ML_REFRESH_TOKEN: refreshToken,
    clearAuthCode: tokens.usedAuthCode,
  });

  if (refreshToken) {
    console.log("Tokens actualizados en .env (incluye ML_REFRESH_TOKEN).");
  } else {
    console.log("ML_ACCESS_TOKEN actualizado en .env.");
    console.log(
      "Falta ML_REFRESH_TOKEN. Genera uno nuevo autorizando la app y agrega ML_AUTH_CODE al .env:"
    );
    if (env.ML_CLIENT_ID && env.ML_REDIRECT_URI) {
      console.log(authUrl(env.ML_CLIENT_ID, env.ML_REDIRECT_URI, "cl"));
    }
    console.log(
      "Luego ejecuta npm run sync-ml de nuevo para intercambiar el código."
    );
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
