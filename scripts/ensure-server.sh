#!/bin/bash
# Assure que le serveur dev tourne (le sandbox fauche les process node entre les appels)
cd /home/z/my-project
if ss -tln 2>/dev/null | rg -q ':3000 '; then
  echo "SERVER:UP"
  exit 0
fi
pkill -f "next dev" 2>/dev/null; sleep 1
node node_modules/.bin/next dev -p 3000 --webpack >> /tmp/batch-dev.log 2>&1 &
CODE=000
for i in $(seq 1 25); do
  sleep 4
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 --max-time 30)
  [ "$CODE" = "200" ] && break
done
echo "SERVER:$CODE"
