@echo off
echo.
echo   ╔══════════════════════════════════════╗
echo   ║        EduGest - Demarrage           ║
echo   ╚══════════════════════════════════════╝
echo.

start "WhatsApp Server - Port 3001" cmd /k "cd /d "%~dp0" && node whatsapp-server.js"
echo   [1] WhatsApp Server (port 3001)

start "Next.js Dev - Port 3000" cmd /k "cd /d "%~dp0" && npm run dev"
echo   [2] Next.js (port 3000)

echo.
echo   2 fenetres ouvertes.
echo   Patientez ~30 secondes pour le premier chargement.
echo.
echo     App       : http://localhost:3000
echo     WhatsApp  : http://localhost:3001/qr-page
echo.
