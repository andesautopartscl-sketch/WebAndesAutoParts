# Servidor local + abrir navegador (Windows / PowerShell)
# Uso: .\start-local.ps1
# Si PowerShell bloquea scripts: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

$port = 8080
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$url = "http://127.0.0.1:$port/index.html"

# Evita conflicto si ya hay algo en el puerto
$inUse = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($inUse) {
  Write-Host "Puerto $port en uso. Abriendo navegador en $url" -ForegroundColor Yellow
  Start-Process $url
  exit 0
}

Write-Host "Servidor en $url (carpeta: $root)" -ForegroundColor Green
Write-Host "Para detener: Ctrl+C en esta ventana" -ForegroundColor Gray

Start-Process $url

# --bind 127.0.0.1 evita problemas con IPv6 / localhost en algunos equipos
python -m http.server $port --bind 127.0.0.1
