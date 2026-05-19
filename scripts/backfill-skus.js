#!/usr/bin/env node
/**
 * Regenera data/productos.json con SKUs desde la API de ML.
 * Usa ML_ACCESS_TOKEN de .env o de --token=...
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const OUTPUT = path.join(ROOT, "data", "productos.json");
const API = "https://api.mercadolibre.com";

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
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

function tokenFromArg() {
  const arg = process.argv.find((a) => a.startsWith("--token="));
  return arg ? arg.slice("--token=".length) : "";
}

function tokenFromKv() {
  try {
    const out = execSync(
      "npx wrangler kv key get --namespace-id=36d3f5ea6b074512a4906890f596b3ac ML_ACCESS_TOKEN",
      { cwd: path.join(ROOT, "worker"), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    );
    return out.trim();
  } catch {
    return "";
  }
}

async function fetchItem(id, token) {
  const res = await fetch(`${API}/items/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${id} HTTP ${res.status}`);
  return res.json();
}

loadEnv();
const token = tokenFromArg() || tokenFromKv() || process.env.ML_ACCESS_TOKEN;
if (!token) {
  console.error("Sin ML_ACCESS_TOKEN (.env, --token= o KV del Worker)");
  process.exit(1);
}

(async () => {
  const productos = JSON.parse(fs.readFileSync(OUTPUT, "utf8"));
  const concurrency = 8;
  let updated = 0;

  for (let i = 0; i < productos.length; i += concurrency) {
    const chunk = productos.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (p) => {
        const item = await fetchItem(p.id, token);
        const sku = extractSku(item);
        if (sku && sku !== p.sku) {
          p.sku = sku;
          updated++;
        } else if (!p.sku && sku) {
          p.sku = sku;
          updated++;
        } else if (!p.sku) {
          p.sku = sku;
        }
      })
    );
    if ((i + concurrency) % 80 === 0 || i + concurrency >= productos.length) {
      console.log(`Procesados ${Math.min(i + concurrency, productos.length)} / ${productos.length}`);
    }
    if (i + concurrency < productos.length) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(productos, null, 2) + "\n", "utf8");
  const conSku = productos.filter((p) => p.sku && String(p.sku).trim());
  console.log(`Actualizados: ${updated} campos sku`);
  console.log(`Con SKU: ${conSku.length} / ${productos.length}`);
  const vg = productos.filter(
    (p) =>
      String(p.sku || "").toUpperCase().includes("VG3030") ||
      JSON.stringify(p).toLowerCase().includes("vg3030")
  );
  console.log("VG3030:", vg.length, vg.map((p) => ({ id: p.id, sku: p.sku, titulo: p.titulo })));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
