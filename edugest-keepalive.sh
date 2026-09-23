#!/bin/bash
# Keep-alive du serveur de dev EduGest (port 3000)
# Relance next dev s'il meurt. Tue d'abord tout process stale sur :3000.
cd /home/z/my-project

LOG=/home/z/my-project/dev.log

while true; do
  # Tuer tout serveur next dev existant (évite les doublons)
  pkill -f "next dev -p 3000" 2>/dev/null
  pkill -f "next-server" 2>/dev/null
  sleep 2

  # Démarrer le serveur de dev edugest (le package.json à la racine est celui d'edugest)
  DATABASE_URL="file:/home/z/my-project/db/custom.db" \
  NEXT_PUBLIC_APP_URL="http://localhost:3000" \
  WHATSAPP_SERVER_URL="http://localhost:3001" \
  NODE_OPTIONS="--max-old-space-size=1200" \
    ./node_modules/.bin/next dev -p 3000 --webpack >> "$LOG" 2>&1 &
  PID=$!
  echo "[$(date '+%F %T')] EduGest dev server démarré (PID $PID)" >> "$LOG"

  # Surveiller : tant qu'il tourne, on dort
  while kill -0 $PID 2>/dev/null; do
    sleep 5
  done

  echo "[$(date '+%F %T')] Serveur mort, redémarrage dans 3s..." >> "$LOG"
  sleep 3
done
