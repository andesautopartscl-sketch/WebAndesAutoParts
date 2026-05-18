#!/usr/bin/env bash
# Crea el namespace KV y muestra los id para pegar en wrangler.toml
set -euo pipefail
cd "$(dirname "$0")"
echo "Creando namespace KV TOKEN_KV..."
npx wrangler kv namespace create TOKEN_KV
echo ""
echo "Creando namespace preview..."
npx wrangler kv namespace create TOKEN_KV --preview
echo ""
echo "Copia los 'id' en wrangler.toml → [[kv_namespaces]] binding TOKEN_KV"
