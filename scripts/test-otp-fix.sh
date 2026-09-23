#!/bin/bash
# Cycle de validation complet du fix OTP (tâche OTP-FIX-1)
# Le sandbox tue next-server par OOM entre les commandes → tout en une session.
cd /home/z/my-project

# 1. Serveur déjà vivant ?
if curl -s -o /dev/null --max-time 3 http://localhost:3000/; then
  echo "[ok] serveur déjà en cours"
else
  echo "[..] démarrage du serveur"
  setsid nohup node node_modules/.bin/next dev -p 3000 --webpack > /dev/null 2>&1 < /dev/null &
  for i in $(seq 1 30); do
    sleep 2
    curl -s -o /dev/null --max-time 3 http://localhost:3000/ && break
  done
fi

# 2. Warm-up (pré-compilation) pour stabiliser le RSS
for i in 1 2 3; do curl -s -o /dev/null http://localhost:3000/; done
sleep 2
free -m | head -2

echo "════ TEST 1 : numéro inventé (24386758904) → delivery:none ════"
curl -s -X POST http://localhost:3000/api/auth/forgot-password -H 'Content-Type: application/json' -d '{"phone":"24386758904"}'
echo ""

echo "════ TEST 2 : numéro valide sans + (normalisation) → delivery:dev ════"
R=$(curl -s -X POST http://localhost:3000/api/auth/forgot-password -H 'Content-Type: application/json' -d '{"phone":"243810000021"}')
echo "$R"
CODE=$(echo "$R" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).devCode||''))")
echo "$CODE" > /tmp/edugest_code
echo "code de test : $CODE"

echo "════ TEST 3 : mauvais code → 400 ════"
curl -s -w " [HTTP %{http_code}]" -X POST http://localhost:3000/api/auth/verify-reset-code -H 'Content-Type: application/json' -d '{"phone":"+243810000021","code":"000000"}'
echo ""

echo "════ TEST 4 : bon code → 200 ════"
curl -s -w " [HTTP %{http_code}]" -X POST http://localhost:3000/api/auth/verify-reset-code -H 'Content-Type: application/json' -d "{\"phone\":\"+243810000021\",\"code\":\"$CODE\"}"
echo ""

echo "════ TEST 5 : reset-password avec ce code → 200 ════"
curl -s -w " [HTTP %{http_code}]" -X POST http://localhost:3000/api/auth/reset-password -H 'Content-Type: application/json' -d "{\"phone\":\"243810000021\",\"code\":\"$CODE\",\"newPassword\":\"admin123\"}"
echo ""

echo "════ TEST 6 : même code réutilisé → 400 (usage unique) ════"
curl -s -w " [HTTP %{http_code}]" -X POST http://localhost:3000/api/auth/verify-reset-code -H 'Content-Type: application/json' -d "{\"phone\":\"+243810000021\",\"code\":\"$CODE\"}"
echo ""

echo "════ TEST 7 : login avec le mot de passe réinitialisé → 200 ════"
curl -s -X POST http://localhost:3000/api/auth -H 'Content-Type: application/json' -d '{"phone":"+243810000021","password":"admin123"}' | head -c 120
echo ""
echo "════ FIN — serveur laissé chaud pour les tests navigateur ════"
