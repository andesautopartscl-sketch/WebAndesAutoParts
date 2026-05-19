#!/usr/bin/env bash
# Renovación rápida del token ML → Worker (un solo flujo interactivo).
# Uso: ./renew-token-quick.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ROOT}/.env"

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

if [ -z "$ML_CLIENT_SECRET" ]; then
  echo "Falta ML_CLIENT_SECRET en .env"
  exit 1
fi
if [ -z "$WORKER_SYNC_URL" ] || [ -z "$WORKER_SYNC_SECRET" ]; then
  echo "Faltan WORKER_SYNC_URL y/o WORKER_SYNC_SECRET en .env"
  exit 1
fi

encode_uri() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import urllib.parse; print(urllib.parse.quote('$1', safe=''))"
  elif command -v node >/dev/null 2>&1; then
    node -e "console.log(encodeURIComponent(process.argv[1]))" "$1"
  else
    echo "$1" | sed 's/:/%3A/g; s/\//%2F/g'
  fi
}

REDIRECT_ENC="$(encode_uri "$ML_REDIRECT_URI")"
AUTH_URL="https://auth.mercadolibre.cl/authorization?response_type=code&client_id=${ML_CLIENT_ID}&redirect_uri=${REDIRECT_ENC}&scope=offline_access+read+write"

echo "=============================================="
echo " Renovación rápida — Mercado Libre → Worker"
echo "=============================================="
echo ""
echo "Paso 1 — Abre esta URL y autoriza (cuenta del vendedor):"
echo ""
echo "  $AUTH_URL"
echo ""

if command -v open >/dev/null 2>&1; then
  read -r -p "¿Abrir en el navegador? [s/N] " OPEN
  if [[ "${OPEN,,}" == "s" || "${OPEN,,}" == "y" ]]; then
    open "$AUTH_URL" 2>/dev/null || true
  fi
elif command -v xdg-open >/dev/null 2>&1; then
  read -r -p "¿Abrir en el navegador? [s/N] " OPEN
  if [[ "${OPEN,,}" == "s" || "${OPEN,,}" == "y" ]]; then
    xdg-open "$AUTH_URL" 2>/dev/null || true
  fi
fi

echo ""
echo "Paso 2 — Pega la URL completa de redirección (o solo el código TG-...):"
read -r -p "> " REDIRECT_INPUT
REDIRECT_INPUT="$(echo "$REDIRECT_INPUT" | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"

AUTH_CODE="$REDIRECT_INPUT"
if echo "$REDIRECT_INPUT" | grep -q 'code='; then
  AUTH_CODE="$(echo "$REDIRECT_INPUT" | sed -n 's/.*[?&]code=\([^&]*\).*/\1/p')"
  if [ -z "$AUTH_CODE" ]; then
    AUTH_CODE="$(echo "$REDIRECT_INPUT" | sed 's/.*code=//' | sed 's/[&?].*//')"
  fi
fi
AUTH_CODE="$(echo "$AUTH_CODE" | tr -d '[:space:]')"

if [ -z "$AUTH_CODE" ]; then
  echo "No se pudo extraer el código. Abortando."
  exit 1
fi

echo ""
echo "Paso 3 — Intercambiando código por access_token..."
TOKEN_JSON=$(curl -sS -X POST "https://api.mercadolibre.com/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=authorization_code" \
  --data-urlencode "client_id=${ML_CLIENT_ID}" \
  --data-urlencode "client_secret=${ML_CLIENT_SECRET}" \
  --data-urlencode "code=${AUTH_CODE}" \
  --data-urlencode "redirect_uri=${ML_REDIRECT_URI}")

ACCESS_TOKEN=$(echo "$TOKEN_JSON" | node -pe "
  const j = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  if (j.error) {
    console.error(j.message || j.error);
    process.exit(1);
  }
  if (!j.access_token) process.exit(1);
  process.stdout.write(j.access_token);
" 2>/dev/null) || {
  echo "Error al obtener token:"
  echo "$TOKEN_JSON"
  exit 1
}

REFRESH=$(echo "$TOKEN_JSON" | node -pe "try{JSON.parse(require('fs').readFileSync(0,'utf8')).refresh_token||''}catch(e){''}" 2>/dev/null || true)
if [ -n "$REFRESH" ]; then
  echo "   refresh_token recibido (guárdalo en .env para renovación automática)."
else
  echo "   Sin refresh_token (el access_token vence en ~6 h)."
fi

echo "   access_token: ${ACCESS_TOKEN:0:28}..."

echo ""
echo "Paso 4 — Subiendo token al Worker..."
BASE="${WORKER_SYNC_URL%/}"
UPDATE_RESP=$(curl -sS -w "\n%{http_code}" -X POST "${BASE}/update-token" \
  -H "Authorization: Bearer ${WORKER_SYNC_SECRET}" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"${ACCESS_TOKEN}\"}")
UPDATE_HTTP=$(echo "$UPDATE_RESP" | tail -n1)
UPDATE_BODY=$(echo "$UPDATE_RESP" | sed '$d')
echo "$UPDATE_BODY"
if [ "$UPDATE_HTTP" != "200" ]; then
  echo "Error: POST /update-token respondió HTTP $UPDATE_HTTP"
  exit 1
fi

echo ""
echo "Paso 5 — Probando sync..."
SYNC_RESP=$(curl -sS -w "\n%{http_code}" \
  -H "Authorization: Bearer ${WORKER_SYNC_SECRET}" \
  "${BASE}/sync")
SYNC_HTTP=$(echo "$SYNC_RESP" | tail -n1)
SYNC_BODY=$(echo "$SYNC_RESP" | sed '$d')
echo "$SYNC_BODY"
echo ""

if [ "$SYNC_HTTP" != "200" ]; then
  echo "Sync falló (HTTP $SYNC_HTTP). Revisa el token o los secrets del Worker."
  exit 1
fi

OK=$(echo "$SYNC_BODY" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).ok" 2>/dev/null || echo false)
if [ "$OK" != "true" ]; then
  echo "Sync respondió ok=false."
  exit 1
fi

PRODUCTS=$(echo "$SYNC_BODY" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).products" 2>/dev/null || echo "?")
echo "=============================================="
echo " Listo. Token renovado y sync OK ($PRODUCTS productos)."
echo "=============================================="
