#!/usr/bin/env bash
# Renueva ML_ACCESS_TOKEN y lo propaga al Worker (KV), secret de Wrangler y GitHub.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ROOT}/.env"
WORKER_DIR="${ROOT}/worker"

load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source <(grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$' | sed 's/\r$//')
    set +a
  fi
}

load_env

ML_CLIENT_ID="${ML_CLIENT_ID:-2004412570250603}"
ML_CLIENT_SECRET="${ML_CLIENT_SECRET:-}"
ML_REDIRECT_URI="${ML_REDIRECT_URI:-https://andesautopartscl-sketch.github.io/WebAndesAutoParts/}"
WORKER_SYNC_URL="${WORKER_SYNC_URL:-}"
WORKER_SYNC_SECRET="${WORKER_SYNC_SECRET:-}"
CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
WORKER_SCRIPT_NAME="${WORKER_SCRIPT_NAME:-andes-autoparts-ml-sync}"

if [ -z "$ML_CLIENT_SECRET" ]; then
  echo "Falta ML_CLIENT_SECRET en .env"
  exit 1
fi

AUTH_URL="https://auth.mercadolibre.cl/authorization?response_type=code&client_id=${ML_CLIENT_ID}&redirect_uri=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${ML_REDIRECT_URI}', safe=''))" 2>/dev/null || node -e "console.log(encodeURIComponent(process.argv[1]))" "$ML_REDIRECT_URI")&scope=read+write"

echo "=============================================="
echo " Renovación de token Mercado Libre"
echo "=============================================="
echo ""
echo "1) Abre esta URL en el navegador (cuenta administrador del vendedor):"
echo ""
echo "   $AUTH_URL"
echo ""

if command -v xdg-open >/dev/null 2>&1; then
  read -r -p "¿Abrir en el navegador ahora? [s/N] " OPEN
  if [[ "${OPEN,,}" == "s" || "${OPEN,,}" == "y" ]]; then
    xdg-open "$AUTH_URL" 2>/dev/null || true
  fi
elif command -v open >/dev/null 2>&1; then
  read -r -p "¿Abrir en el navegador ahora? [s/N] " OPEN
  if [[ "${OPEN,,}" == "s" || "${OPEN,,}" == "y" ]]; then
    open "$AUTH_URL" 2>/dev/null || true
  fi
elif command -v cmd.exe >/dev/null 2>&1; then
  read -r -p "¿Abrir en el navegador ahora? [s/N] " OPEN
  if [[ "${OPEN,,}" == "s" || "${OPEN,,}" == "y" ]]; then
    cmd.exe /c start "" "$AUTH_URL" 2>/dev/null || true
  fi
fi

echo ""
echo "2) Tras autorizar, copia el parámetro code=TG-... de la URL de redirección."
read -r -p "Pega el código TG-... aquí: " AUTH_CODE
AUTH_CODE="$(echo "$AUTH_CODE" | sed 's/.*code=//' | sed 's/[&?].*//' | tr -d '[:space:]')"

if [ -z "$AUTH_CODE" ]; then
  echo "Código vacío. Abortando."
  exit 1
fi

echo ""
echo "3) Intercambiando código por access_token..."
TOKEN_JSON=$(curl -sS -X POST "https://api.mercadolibre.com/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=authorization_code" \
  --data-urlencode "client_id=${ML_CLIENT_ID}" \
  --data-urlencode "client_secret=${ML_CLIENT_SECRET}" \
  --data-urlencode "code=${AUTH_CODE}" \
  --data-urlencode "redirect_uri=${ML_REDIRECT_URI}")

ACCESS_TOKEN=$(echo "$TOKEN_JSON" | node -pe "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(j.error) { console.error(j.message||j.error); process.exit(1);} process.stdout.write(j.access_token||'')" 2>/dev/null)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "Error al obtener token:"
  echo "$TOKEN_JSON"
  exit 1
fi

echo "   access_token obtenido: ${ACCESS_TOKEN:0:28}..."

update_local_env() {
  local tmp
  tmp="$(mktemp)"
  if [ -f "$ENV_FILE" ]; then
    grep -v '^ML_ACCESS_TOKEN=' "$ENV_FILE" | grep -v '^ML_AUTH_CODE=' > "$tmp" || true
  else
    : > "$tmp"
  fi
  {
    cat "$tmp"
    echo "ML_ACCESS_TOKEN=${ACCESS_TOKEN}"
  } > "$ENV_FILE"
  rm -f "$tmp"
  echo "4) .env local actualizado"
}

update_local_env

# Worker KV vía POST /update-token
if [ -n "$WORKER_SYNC_URL" ] && [ -n "$WORKER_SYNC_SECRET" ]; then
  echo "5) Actualizando token en Cloudflare Worker (KV)..."
  BASE="${WORKER_SYNC_URL%/}"
  RESP=$(curl -sS -w "\n%{http_code}" -X POST "${BASE}/update-token" \
    -H "Authorization: Bearer ${WORKER_SYNC_SECRET}" \
    -H "Content-Type: application/json" \
    -d "{\"access_token\":\"${ACCESS_TOKEN}\"}")
  HTTP=$(echo "$RESP" | tail -n1)
  BODY=$(echo "$RESP" | sed '$d')
  echo "$BODY"
  if [ "$HTTP" != "200" ]; then
    echo "   Advertencia: POST /update-token respondió HTTP $HTTP"
  else
    echo "   Worker KV actualizado"
  fi
else
  echo "5) Omitido Worker KV (define WORKER_SYNC_URL y WORKER_SYNC_SECRET en .env)"
fi

# Wrangler secret (respaldo en secret binding del Worker)
if command -v npx >/dev/null 2>&1 && [ -f "${WORKER_DIR}/wrangler.toml" ]; then
  echo "6) Actualizando secret ML_ACCESS_TOKEN en Wrangler..."
  cd "$WORKER_DIR"
  echo "$ACCESS_TOKEN" | npx wrangler secret put ML_ACCESS_TOKEN
  cd "$ROOT"
elif [ -n "$CLOUDFLARE_API_TOKEN" ] && [ -n "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "6) Actualizando secret vía Cloudflare API..."
  curl -sS -X PUT \
    "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${WORKER_SCRIPT_NAME}/secrets" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "{\"name\":\"ML_ACCESS_TOKEN\",\"text\":\"${ACCESS_TOKEN}\",\"type\":\"secret_text\"}"
  echo ""
else
  echo "6) Omitido Wrangler secret (instala Node/npx o define CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID)"
fi

# GitHub secret (opcional, para sync local ml-sync.js)
if command -v gh >/dev/null 2>&1; then
  echo "7) Actualizando secreto ML_ACCESS_TOKEN en GitHub Actions..."
  echo "$ACCESS_TOKEN" | gh secret set ML_ACCESS_TOKEN
  echo "   Secreto GitHub actualizado"
else
  echo "7) Omitido GitHub secret (instala gh CLI: https://cli.github.com/)"
fi

echo ""
echo "=============================================="
echo " Listo. Prueba el sync:"
if [ -n "$WORKER_SYNC_URL" ] && [ -n "$WORKER_SYNC_SECRET" ]; then
  echo "   curl -H \"Authorization: Bearer \$WORKER_SYNC_SECRET\" \"${WORKER_SYNC_URL%/}/sync\""
fi
echo "=============================================="
