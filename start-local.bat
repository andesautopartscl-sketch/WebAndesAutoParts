@echo off
cd /d "%~dp0"
echo Servidor en carpeta: %CD%
echo.
echo Abriendo el navegador en 1 segundo...
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://127.0.0.1:8080/index.html?promo=1"
echo.
echo Servidor local: http://127.0.0.1:8080/index.html?promo=1
echo (promo=1 fuerza el banner de Fiestas Patrias)
echo Para detener: cierra esta ventana o Ctrl+C
echo.
python -m http.server 8080 --bind 127.0.0.1
pause
