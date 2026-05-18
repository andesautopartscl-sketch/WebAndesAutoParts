/**
 * Cloudflare Worker — sincroniza catálogo ML → GitHub (data/productos.json)
 * GET  /sync         — sincroniza y commitea vía GitHub API
 * POST /update-token — guarda ML_ACCESS_TOKEN en KV (renovación)
 * GET  /health       — estado del servicio
 */

const API = "https://api.mercadolibre.com";
const KV_TOKEN_KEY = "ML_ACCESS_TOKEN";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function unauthorized() {
  return json({ ok: false, error: "UNAUTHORIZED", message: "Token de Worker inválido" }, 401);
}

function checkAuth(request, env) {
  const secret = env.WORKER_SYNC_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token === secret;
}

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function getMlAccessToken(env) {
  if (env.TOKEN_KV) {
    const fromKv = await env.TOKEN_KV.get(KV_TOKEN_KEY);
    if (fromKv) return fromKv;
  }
  return env.ML_ACCESS_TOKEN || "";
}

async function setMlAccessToken(env, token) {
  if (!env.TOKEN_KV) {
    throw new Error("TOKEN_KV no configurado en el Worker");
  }
  await env.TOKEN_KV.put(KV_TOKEN_KEY, token);
}

async function mlFetch(url, accessToken) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (res.status === 401) {
    const err = new Error("TOKEN_EXPIRED");
    err.code = "TOKEN_EXPIRED";
    err.status = 401;
    err.details = data.message || data.error || "Unauthorized";
    throw err;
  }
  if (!res.ok) {
    const msg = data.message || data.error || res.statusText;
    throw new Error(`ML API ${res.status}: ${msg}`);
  }
  return data;
}

async function fetchSellerId(accessToken) {
  const me = await mlFetch(`${API}/users/me`, accessToken);
  if (!me.id) throw new Error("No se pudo obtener seller_id");
  return { sellerId: me.id, nickname: me.nickname || "" };
}

async function fetchAllActiveItemIds(sellerId, accessToken) {
  const ids = [];
  const limit = 100;
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const data = await mlFetch(
      `${API}/users/${sellerId}/items/search?status=active&offset=${offset}&limit=${limit}`,
      accessToken
    );
    const batch = data.results || [];
    ids.push(...batch);
    total = data.paging?.total ?? ids.length;
    offset += limit;
    if (!batch.length) break;
  }
  return ids;
}

async function fetchItemDetail(itemId, accessToken) {
  return mlFetch(`${API}/items/${itemId}`, accessToken);
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
    if (i + concurrency < itemIds.length) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  return items;
}

function extractSku(item) {
  const attrs = item.attributes || [];
  for (const attr of attrs) {
    if (attr.id === "SELLER_SKU" || attr.id === "SKU") {
      const val = String(attr.value_name || attr.value_id || "").trim();
      if (val) return val;
    }
  }
  return "";
}

async function getCategoryName(categoryId, accessToken, cache) {
  if (!categoryId) return "Sin categoría";
  if (cache.has(categoryId)) return cache.get(categoryId);
  try {
    const cat = await mlFetch(`${API}/categories/${categoryId}`, accessToken);
    const name = cat.name || categoryId;
    cache.set(categoryId, name);
    return name;
  } catch {
    cache.set(categoryId, categoryId);
    return categoryId;
  }
}

function mainImage(item) {
  const pic = item.pictures && item.pictures[0];
  return pic ? pic.secure_url || pic.url || "" : "";
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

async function buildCatalog(accessToken) {
  const { sellerId, nickname } = await fetchSellerId(accessToken);
  const itemIds = await fetchAllActiveItemIds(sellerId, accessToken);
  const rawItems = await fetchAllItemDetails(itemIds, accessToken);
  const categoryCache = new Map();
  const productos = [];
  for (const item of rawItems) {
    const categoryName = await getCategoryName(
      item.category_id,
      accessToken,
      categoryCache
    );
    productos.push(mapItem(item, categoryName));
  }
  productos.sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));
  return { productos, sellerId, nickname, count: productos.length };
}

async function githubGetFile(env) {
  const filePath = env.GITHUB_FILE_PATH || "data/productos.json";
  const path = encodeURIComponent(filePath);
  const url =
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}` +
    `/contents/${path}?ref=${encodeURIComponent(env.GITHUB_BRANCH || "main")}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "andes-autoparts-ml-sync-worker",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub GET ${res.status}: ${err}`);
  }
  return res.json();
}

async function githubCommitCatalog(env, content) {
  const existing = await githubGetFile(env);
  const filePath = env.GITHUB_FILE_PATH || "data/productos.json";
  const body = {
    message: "chore: actualizar catálogo desde Mercado Libre (Worker)",
    content: toBase64Utf8(content),
    branch: env.GITHUB_BRANCH || "main",
  };
  if (existing && existing.sha) {
    body.sha = existing.sha;
  }
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "andes-autoparts-ml-sync-worker",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub PUT ${res.status}: ${err}`);
  }
  return res.json();
}

async function handleSync(env) {
  const accessToken = await getMlAccessToken(env);
  if (!accessToken) {
    return json(
      {
        ok: false,
        error: "MISSING_TOKEN",
        message: "ML_ACCESS_TOKEN no configurado. Ejecuta renew-token.sh",
      },
      500
    );
  }
  if (!env.GITHUB_TOKEN) {
    return json(
      {
        ok: false,
        error: "MISSING_GITHUB_TOKEN",
        message: "GITHUB_TOKEN no configurado en el Worker",
      },
      500
    );
  }

  try {
    const { productos, sellerId, nickname, count } = await buildCatalog(accessToken);
    const fileContent = JSON.stringify(productos, null, 2) + "\n";
    const gh = await githubCommitCatalog(env, fileContent);
    return json({
      ok: true,
      products: count,
      seller_id: sellerId,
      seller_nickname: nickname,
      github: {
        commit_sha: gh.commit && gh.commit.sha,
        content_sha: gh.content && gh.content.sha,
      },
      synced_at: new Date().toISOString(),
    });
  } catch (err) {
    if (err.code === "TOKEN_EXPIRED") {
      return json(
        {
          ok: false,
          error: "TOKEN_EXPIRED",
          message: "Token ML expirado - renovar manualmente",
          hint: "Ejecuta: ./renew-token.sh",
          details: err.details,
        },
        401
      );
    }
    return json(
      {
        ok: false,
        error: "SYNC_FAILED",
        message: err.message || String(err),
      },
      500
    );
  }
}

async function handleUpdateToken(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "INVALID_JSON" }, 400);
  }
  const token = (body.access_token || body.token || "").trim();
  if (!token) {
    return json(
      {
        ok: false,
        error: "MISSING_TOKEN",
        message: 'Envía JSON: { "access_token": "APP_USR-..." }',
      },
      400
    );
  }

  try {
    await mlFetch(`${API}/users/me`, token);
  } catch (err) {
    if (err.code === "TOKEN_EXPIRED") {
      return json(
        { ok: false, error: "TOKEN_EXPIRED", message: "El token enviado ya expiró" },
        400
      );
    }
    return json(
      { ok: false, error: "INVALID_TOKEN", message: err.message || String(err) },
      400
    );
  }

  try {
    await setMlAccessToken(env, token);
    return json({
      ok: true,
      message: "ML_ACCESS_TOKEN guardado en KV",
      token_preview: token.slice(0, 24) + "...",
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    return json(
      {
        ok: false,
        error: "KV_WRITE_FAILED",
        message: err.message || String(err),
      },
      500
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/health" || (path === "/" && request.method === "GET")) {
      const hasToken = Boolean(await getMlAccessToken(env));
      return json({
        ok: true,
        service: "andes-autoparts-ml-sync",
        token_configured: hasToken,
        endpoints: ["GET /sync", "POST /update-token", "GET /health"],
      });
    }

    if (!checkAuth(request, env)) {
      return unauthorized();
    }

    if (path === "/sync" && request.method === "GET") {
      return handleSync(env);
    }

    if (path === "/update-token" && request.method === "POST") {
      return handleUpdateToken(request, env);
    }

    return json({ ok: false, error: "NOT_FOUND" }, 404);
  },
};
