# Andes Auto Parts — Web + sync Mercado Libre

Sitio estático en GitHub Pages con catálogo sincronizado desde Mercado Libre.

## Arquitectura de sincronización

```
GitHub Actions (cron 8:00 Chile)
        │
        ▼  GET /sync
Cloudflare Worker  ──►  API Mercado Libre
        │
        ▼  commit vía GitHub API
data/productos.json  en rama main  ──►  GitHub Pages
```

Mercado Libre **no entrega `refresh_token`** para esta aplicación, por lo que el token se renueva manualmente con `renew-token.sh` cuando expire (~6 horas de uso activo; en la práctica conviene renovar si el sync falla).

---

## Credenciales que debes obtener

### 1. GitHub — Personal Access Token (`GITHUB_TOKEN`)

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
2. **Generate new token (classic)**.
3. Permisos mínimos: **`repo`** (o solo el repo `WebAndesAutoParts` con **Contents: Read and write**).
4. Copia el token (`ghp_...`). No se vuelve a mostrar.

También crea estos **secrets** en el repo (**Settings → Secrets and variables → Actions**):

| Secreto | Valor |
|---------|--------|
| `WORKER_SYNC_URL` | URL del Worker, ej. `https://andes-autoparts-ml-sync.TU_SUBDOMINIO.workers.dev` |
| `WORKER_SYNC_SECRET` | Clave larga aleatoria (la misma que en el Worker) |

Opcional (solo para `npm run sync-ml` local): `ML_ACCESS_TOKEN`, `ML_CLIENT_SECRET`, etc.

### 2. Cloudflare — API Token (`CLOUDFLARE_API_TOKEN`)

1. Entra en [dash.cloudflare.com](https://dash.cloudflare.com).
2. **My Profile** → **API Tokens** → **Create Token**.
3. Usa la plantilla **Edit Cloudflare Workers** o permisos:
   - Account → **Workers Scripts** → Edit
   - Account → **Workers KV Storage** → Edit
4. Copia el token.

### 3. Cloudflare — Account ID (`CLOUDFLARE_ACCOUNT_ID`)

En el dashboard de Cloudflare, dominio o Workers → columna derecha **Account ID**.

### 4. Mercado Libre

Ya configurados en el proyecto:

- `ML_CLIENT_ID=2004412570250603`
- `ML_CLIENT_SECRET` (panel [developers.mercadolibre.com](https://developers.mercadolibre.com/))
- `ML_REDIRECT_URI=https://andesautopartscl-sketch.github.io/WebAndesAutoParts/`

---

## Despliegue del Worker (primera vez)

### Requisitos

- Node.js 18+
- Cuenta Cloudflare (plan gratuito basta)

### Pasos

```bash
# 1. Instalar dependencias del worker
cd worker
npm install

# 2. Crear namespace KV y copiar los id en wrangler.toml
npm run kv:create
# Edita worker/wrangler.toml → reemplaza REPLACE_WITH_KV_NAMESPACE_ID y preview_id

# 3. Login en Cloudflare
npx wrangler login

# 4. Configurar secrets del Worker
npx wrangler secret put ML_ACCESS_TOKEN      # APP_USR-... actual
npx wrangler secret put ML_CLIENT_SECRET
npx wrangler secret put GITHUB_TOKEN         # ghp_...
npx wrangler secret put WORKER_SYNC_SECRET   # clave aleatoria larga

# 5. Desplegar
npm run deploy
# Anota la URL: https://andes-autoparts-ml-sync.<subdominio>.workers.dev
```

Desde la raíz del proyecto:

```bash
npm run deploy-worker
```

### 6. Completar GitHub

En **Settings → Secrets → Actions** del repo:

- `WORKER_SYNC_URL` = URL del worker (sin barra final)
- `WORKER_SYNC_SECRET` = mismo valor que pusiste en el Worker

### 7. Probar

```bash
curl -sS -H "Authorization: Bearer TU_WORKER_SYNC_SECRET" \
  "https://andes-autoparts-ml-sync.TU_SUBDOMINIO.workers.dev/sync" | head
```

Debe responder `"ok": true` y `"products": 516` (aprox.).

---

## Renovación del token ML

Cuando GitHub Actions falle con **"Token ML expirado - renovar manualmente"**:

### Opción rápida (recomendada)

1. Copia `.env.example` a `.env` y completa `ML_CLIENT_SECRET`, `WORKER_SYNC_URL`, `WORKER_SYNC_SECRET`.
2. En Git Bash o Linux/macOS:

```bash
chmod +x renew-token.sh
./renew-token.sh
```

El script:

- Abre la URL de autorización de Mercado Libre
- Pide el código `TG-...`
- Actualiza el Worker (KV), secret de Wrangler y (si tienes `gh`) el secreto de GitHub

### Frecuencia

- El access token de ML dura **~6 horas** con uso continuo.
- El **sync diario** suele funcionar mientras el token siga válido.
- Renueva cuando falle el workflow o antes de un deploy importante.

---

## Verificar que el sync automático funciona

1. **GitHub** → pestaña **Actions** → workflow **Sincronizar catálogo Mercado Libre**.
2. **Run workflow** (manual) o espera el cron (8:00 Chile).
3. Debe terminar en verde.
4. En el repo, revisa el último commit en `data/productos.json` (mensaje del Worker).
5. En la web: sección **Listado de productos** tras unos minutos de GitHub Pages.

Health check del Worker:

```bash
curl -sS "https://TU-WORKER.workers.dev/health"
```

---

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run sync-ml` | Sync local con `ml-sync.js` (requiere `.env`) |
| `npm run deploy-worker` | Despliega el Cloudflare Worker |
| `./renew-token.sh` | Renueva token ML y lo propaga al Worker |

---

## Desarrollo local del Worker

```bash
cd worker
cp .dev.vars.example .dev.vars   # completar valores
npm run dev
```

Endpoints (requieren `Authorization: Bearer WORKER_SYNC_SECRET` salvo `/health`):

- `GET /sync` — sincroniza catálogo → GitHub
- `POST /update-token` — body: `{ "access_token": "APP_USR-..." }`
- `GET /health` — estado

---

## Estructura relevante

```
worker/
  worker.js          # Lógica del Worker
  wrangler.toml      # Config Cloudflare
  package.json
renew-token.sh       # Renovación manual del token
.github/workflows/sync-ml.yml
data/productos.json  # Catálogo (generado automáticamente)
ml-sync.js           # Sync local alternativo
```
