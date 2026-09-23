@echo off
echo.
echo   ╔══════════════════════════════════════╗
echo   ║        EduGest - Demarrage           ║
echo   ╚══════════════════════════════════════╝
echo.

where bun >nul 2>nul
if %errorlevel% neq 0 (
  echo   [!] Bun est requis pour le serveur WhatsApp ^(mini-services/whatsapp-server^).
  echo       Installez-le depuis https://bun.sh puis relancez ce script.
  echo.
)

echo   [1] WhatsApp Server (port 3001) - mini-services/whatsapp-server
if exist "%~dp0mini-services\whatsapp-server\package.json" (
  start "WhatsApp Server - Port 3001" cmd /k "cd /d "%~dp0mini-services\whatsapp-server" && bun install && bun run dev"
) else (
  echo       [!] mini-services/whatsapp-server introuvable - serveur WhatsApp ignore.
)

echo   [2] Next.js Dev (port 3000)
start "Next.js Dev - Port 3000" cmd /k "cd /d "%~dp0" && npx next dev -p 3000 --webpack"

echo.
echo   2 fenetres ouvertes.
echo   Patientez ~30 secondes pour le premier chargement.
echo.
echo     App       : http://localhost:3000  (section Connexion WhatsApp dans le menu)
echo     WhatsApp  : http://localhost:3001/status  (API - en-tete x-api-key requis)
echo.
