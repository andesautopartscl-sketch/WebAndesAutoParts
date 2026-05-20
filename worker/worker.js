/**
 * Cloudflare Worker — sincroniza catálogo ML → GitHub (data/productos.json)
 * GET  /sync         — sincroniza y commitea vía GitHub API
 * POST /update-token — guarda ML_ACCESS_TOKEN en KV (renovación)
 * GET  /auth-url     — URL de autorización ML para renovar token
 * GET  /health       — estado del servicio
 */

const API = "https://api.mercadolibre.com";
const KV_TOKEN_KEY = "ML_ACCESS_TOKEN";
const KV_SYNC_IDS = "SYNC_ITEM_IDS";
const KV_SYNC_PRODUCTOS = "SYNC_PARTIAL_PRODUCTOS";
const KV_SYNC_META = "SYNC_META";

const ITEMS_PER_INVOCATION = 200;
const MULTI_ITEM_BATCH = 20;
const SEARCH_PAGE_SIZE = 100;
const ML_ITEM_ATTRS =
  "id,title,price,currency_id,thumbnail,permalink,available_quantity,condition,seller_sku,attributes,category_id";

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
  const secret = (env.WORKER_SYNC_SECRET || "").trim();
  if (!secret) return true;
  const auth = request.headers.get("Authorization") || "";
  const token = (auth.startsWith("Bearer ") ? auth.slice(7) : auth).trim();
  return token === secret;
}

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function buildMlAuthUrl(env) {
  const clientId = env.ML_CLIENT_ID || "2004412570250603";
  const redirectUri =
    env.ML_REDIRECT_URI ||
    "https://andesautopartscl-sketch.github.io/WebAndesAutoParts/";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "offline_access read write",
  });
  return `https://auth.mercadolibre.cl/authorization?${params.toString()}`;
}

function handleAuthUrl(env) {
  const authUrl = buildMlAuthUrl(env);
  return json({
    ok: true,
    auth_url: authUrl,
    client_id: env.ML_CLIENT_ID || "2004412570250603",
    redirect_uri:
      env.ML_REDIRECT_URI ||
      "https://andesautopartscl-sketch.github.io/WebAndesAutoParts/",
    scope: "offline_access read write",
    renew_script: "./renew-token-quick.sh",
    instructions: [
      "Abre auth_url en el navegador (cuenta administrador del vendedor ML).",
      "Tras autorizar, copia la URL completa de redirección o solo el parámetro code=TG-...",
      "Ejecuta ./renew-token-quick.sh en tu PC y pega la URL o el código.",
      "El script sube el token al Worker y prueba /sync automáticamente.",
    ],
  });
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

async function kvGetJson(env, key) {
  if (!env.TOKEN_KV) return null;
  const raw = await env.TOKEN_KV.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function kvSetJson(env, key, value) {
  if (!env.TOKEN_KV) throw new Error("TOKEN_KV no configurado en el Worker");
  await env.TOKEN_KV.put(key, JSON.stringify(value));
}

async function clearSyncState(env) {
  if (!env.TOKEN_KV) return;
  await Promise.all([
    env.TOKEN_KV.delete(KV_SYNC_IDS),
    env.TOKEN_KV.delete(KV_SYNC_PRODUCTOS),
    env.TOKEN_KV.delete(KV_SYNC_META),
  ]);
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

async function fetchItemsMulti(itemIds, accessToken) {
  const items = [];
  for (let i = 0; i < itemIds.length; i += MULTI_ITEM_BATCH) {
    const chunk = itemIds.slice(i, i + MULTI_ITEM_BATCH);
    const idsParam = chunk.map(encodeURIComponent).join(",");
    const url =
      `${API}/items?ids=${idsParam}` +
      `&attributes=${encodeURIComponent(ML_ITEM_ATTRS)}`;
    const data = await mlFetch(url, accessToken);
    const entries = Array.isArray(data) ? data : [];
    for (const entry of entries) {
      if (entry && entry.code === 200 && entry.body) {
        items.push(entry.body);
      }
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

function itemImage(item) {
  if (item.thumbnail) return item.thumbnail;
  const pic = item.pictures && item.pictures[0];
  return pic ? pic.secure_url || pic.url || "" : "";
}

function mapItem(item) {
  return {
    id: item.id,
    sku: extractSku(item) || item.seller_sku || "",
    titulo: item.title || "",
    precio: Number(item.price) || 0,
    moneda: item.currency_id || "CLP",
    imagen: itemImage(item),
    link: item.permalink || "",
    categoria: item.category_id || "Sin categoría",
    stock: item.available_quantity != null ? item.available_quantity : 0,
    condicion: item.condition === "used" ? "used" : "new",
  };
}

async function initSyncState(accessToken, env) {
  const { sellerId, nickname } = await fetchSellerId(accessToken);
  const itemIds = await fetchAllActiveItemIds(sellerId, accessToken);
  await kvSetJson(env, KV_SYNC_IDS, itemIds);
  await kvSetJson(env, KV_SYNC_PRODUCTOS, []);
  await kvSetJson(env, KV_SYNC_META, {
    sellerId,
    nickname,
    total: itemIds.length,
    started_at: new Date().toISOString(),
  });
  return { itemIds, sellerId, nickname, total: itemIds.length };
}

async function processSyncBatch(accessToken, env, offset) {
  let itemIds = await kvGetJson(env, KV_SYNC_IDS);
  let meta = await kvGetJson(env, KV_SYNC_META);

  if (offset === 0 && (!itemIds || !itemIds.length)) {
    const init = await initSyncState(accessToken, env);
    itemIds = init.itemIds;
    meta = {
      sellerId: init.sellerId,
      nickname: init.nickname,
      total: init.total,
      started_at: new Date().toISOString(),
    };
  }

  if (!itemIds || !itemIds.length) {
    throw new Error(
      "Estado de sync no inicializado. Llama primero a /sync?offset=0"
    );
  }

  if (!meta) {
    meta = { total: itemIds.length };
  }

  const batchIds = itemIds.slice(offset, offset + ITEMS_PER_INVOCATION);
  const rawItems = await fetchItemsMulti(batchIds, accessToken);
  const mapped = rawItems.map(mapItem);
  const partial = (await kvGetJson(env, KV_SYNC_PRODUCTOS)) || [];
  partial.push(...mapped);
  await kvSetJson(env, KV_SYNC_PRODUCTOS, partial);

  const total = itemIds.length;
  const nextOffset = offset + ITEMS_PER_INVOCATION;
  const done = nextOffset >= total;

  return {
    productos: partial,
    meta,
    total,
    offset,
    processed: mapped.length,
    nextOffset,
    done,
  };
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

async function handleSync(request, env) {
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

  const url = new URL(request.url);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

  try {
    if (offset === 0) {
      await clearSyncState(env);
    } else {
      const existingIds = await kvGetJson(env, KV_SYNC_IDS);
      if (!existingIds || !existingIds.length) {
        return json(
          {
            ok: false,
            error: "SYNC_NOT_INITIALIZED",
            message: "Debes iniciar con /sync?offset=0 antes de continuar",
          },
          400
        );
      }
    }

    const batch = await processSyncBatch(accessToken, env, offset);

    if (!batch.done) {
      return json({
        ok: true,
        done: false,
        offset,
        next_offset: batch.nextOffset,
        total: batch.total,
        accumulated: batch.productos.length,
        processed_this_batch: batch.processed,
        batch_size: ITEMS_PER_INVOCATION,
        message: `Lote procesado. Llama a /sync?offset=${batch.nextOffset}`,
      });
    }

    const productos = [...batch.productos];
    productos.sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));
    const fileContent = JSON.stringify(productos, null, 2) + "\n";
    const gh = await githubCommitCatalog(env, fileContent);
    await clearSyncState(env);

    return json({
      ok: true,
      done: true,
      products: productos.length,
      total: batch.total,
      seller_id: batch.meta.sellerId,
      seller_nickname: batch.meta.nickname,
      github: {
        commit_sha: gh.commit && gh.commit.sha,
        content_sha: gh.content && gh.content.sha,
      },
      synced_at: new Date().toISOString(),
    });
  } catch (err) {
    if (err.code === "TOKEN_EXPIRED") {
      const authUrl = buildMlAuthUrl(env);
      return json(
        {
          ok: false,
          error: "TOKEN_EXPIRED",
          message:
            "Token ML expirado (válido ~6 h). Renueva con ./renew-token-quick.sh",
          auth_url: authUrl,
          renew_script: "./renew-token-quick.sh",
          hint: "Abre auth_url, autoriza, y ejecuta renew-token-quick.sh con el código TG-...",
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
        endpoints: [
          "GET /sync?offset=0 (paginado, máx 200 ítems por llamada)",
          "POST /update-token",
          "GET /auth-url",
          "GET /health",
        ],
      });
    }

    if (path === "/auth-url" && request.method === "GET") {
      return handleAuthUrl(env);
    }

    if (!checkAuth(request, env)) {
      return unauthorized();
    }

    if (path === "/sync" && request.method === "GET") {
      return handleSync(request, env);
    }

    if (path === "/update-token" && request.method === "POST") {
      return handleUpdateToken(request, env);
    }

    return json({ ok: false, error: "NOT_FOUND" }, 404);
  },
};
