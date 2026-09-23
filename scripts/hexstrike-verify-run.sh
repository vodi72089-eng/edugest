#!/bin/bash
# Vérification orchestrée VIA HexStrike — cycle de vie complet en une session
set -e
HEXLOG=/home/z/hexstrike-server.log

# 1) Démarrer HexStrike s'il n'est pas déjà en ligne
if ! curl -s http://localhost:8888/health --max-time 3 -o /dev/null; then
  echo "[*] Démarrage du C2 HexStrike AI..."
  nohup /home/z/.venv/bin/python3 /home/z/hexstrike-ai/hexstrike_server.py >> "$HEXLOG" 2>&1 &
  for i in $(seq 1 20); do
    sleep 1
    curl -s http://localhost:8888/health --max-time 3 -o /dev/null && break
  done
fi
curl -s http://localhost:8888/health --max-time 5 -o /dev/null && echo "[✓] HexStrike en ligne (port 8888)"

# 2) Lancer les sondes de vérification via l'API HexStrike
/home/z/.venv/bin/python3 /home/z/my-project/scripts/hexstrike-verify.py
