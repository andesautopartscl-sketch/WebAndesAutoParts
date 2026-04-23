@echo off
cd /d "%~dp0"
echo Abriendo http://127.0.0.1:8080/index.html ...
start "" "http://127.0.0.1:8080/index.html"
echo Servidor en carpeta: %CD%
echo Para detener: cierra esta ventana o Ctrl+C
python -m http.server 8080 --bind 127.0.0.1
pause
