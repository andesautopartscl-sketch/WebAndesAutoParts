#!/usr/bin/env node
/**
 * Sincroniza publicaciones activas de Mercado Libre → data/productos.json
 * Uso: node ml-sync.js  |  npm run sync-ml
 *
 * Primera vez: define ML_AUTH_CODE en .env (código OAuth de un solo uso).
 * Siguientes ejecuciones: usa ML_REFRESH_TOKEN guardado en .env.
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
    "# Obtén ML_AUTH_CODE una sola vez tras autorizar la app en developers.mercadolibre.com",
    "",
  ];
  for (const key of keys) {
    if (vars[key] != null && String(vars[key]).trim() !== "") {
      lines.push(`${key}=${vars[key]}`);
    }
  }
  lines.push("");
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
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

async function getAccessToken(env) {
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
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || env.ML_REFRESH_TOKEN,
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
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    };
  }

  throw new Error(
    "Define ML_REFRESH_TOKEN o ML_AUTH_CODE en .env para autenticar con Mercado Libre"
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

async function fetchItemsBatch(itemIds, accessToken) {
  if (!itemIds.length) return [];
  const attrs = [
    "id",
    "title",
    "price",
    "currency_id",
    "pictures",
    "permalink",
    "category_id",
    "available_quantity",
    "condition",
  ].join(",");
  const url = `${API}/items?ids=${itemIds.join(",")}&attributes=${attrs}`;
  const rows = await apiRequest(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return rows
    .filter((row) => row.code === 200 && row.body)
    .map((row) => row.body);
}

async function fetchAllItemDetails(itemIds, accessToken) {
  const items = [];
  const chunkSize = 20;
  for (let i = 0; i < itemIds.length; i += chunkSize) {
    const chunk = itemIds.slice(i, i + chunkSize);
    const batch = await fetchItemsBatch(chunk, accessToken);
    items.push(...batch);
    console.log(`Detalle: ${items.length} / ${itemIds.length}`);
    if (i + chunkSize < itemIds.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return items;
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

  const tokens = await getAccessToken(env);
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

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(productos, null, 2) + "\n", "utf8");
  console.log(`Escrito: ${OUTPUT_PATH} (${productos.length} productos)`);

  saveEnvFile(ENV_PATH, {
    ML_CLIENT_ID: env.ML_CLIENT_ID,
    ML_CLIENT_SECRET: env.ML_CLIENT_SECRET,
    ML_REDIRECT_URI: env.ML_REDIRECT_URI,
    ML_ACCESS_TOKEN: accessToken,
    ML_REFRESH_TOKEN: refreshToken,
  });
  console.log("Tokens actualizados en .env (ML_AUTH_CODE ya no es necesario).");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
