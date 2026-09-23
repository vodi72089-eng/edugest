#!/bin/bash
# Vérification finale post-merge dans une seule session (le sandbox tue
# next-server entre les commandes bash — tout ici doit tenir en une session).
cd /home/z/my-project

if ! curl -s -o /dev/null --max-time 3 http://localhost:3000/; then
  echo "[..] démarrage serveur"
  setsid nohup node node_modules/.bin/next dev -p 3000 --webpack > /dev/null 2>&1 < /dev/null &
  for i in $(seq 1 30); do sleep 2; curl -s -o /dev/null --max-time 3 http://localhost:3000/ && break; done
fi
for i in 1 2 3; do curl -s -o /dev/null http://localhost:3000/; done
echo "[ok] serveur chaud"

echo "── 1. Landing + modale connexion ──"
agent-browser open http://localhost:3000/ > /dev/null 2>&1
for i in $(seq 1 30); do
  sleep 2
  agent-browser snapshot -i -c 2>&1 | grep -q 'Se connecter' && break
done
agent-browser snapshot -i -c 2>&1 | grep -oE 'button "Se connecter" \[ref=[^]]*\]' | head -1

echo "── 2. Footer page connexion (sans villes + collé en bas) ──"
agent-browser eval "JSON.stringify({footer: document.querySelector('footer')?.textContent?.trim(), bottom: Math.round(document.querySelector('footer')?.getBoundingClientRect().bottom), vh: window.innerHeight, scrollable: document.documentElement.scrollHeight > window.innerHeight})" 2>/dev/null

echo "── 3. Modale reset : numéro inventé → pas d'étape code ──"
agent-browser snapshot -i -c 2>&1 | grep -oE 'button "Se connecter" \[ref=([^]]*)\]' | head -1 | sed -E 's/.*\[ref=([^]]*)\].*/\1/' > /tmp/ref1
agent-browser click "$(cat /tmp/ref1)" > /dev/null 2>&1; sleep 2
agent-browser snapshot -i -c 2>&1 | grep -oE 'button "Mot de passe oublié \?" \[ref=([^]]*)\]' | head -1 | sed -E 's/.*\[ref=([^]]*)\].*/\1/' > /tmp/ref2
agent-browser click "$(cat /tmp/ref2)" > /dev/null 2>&1; sleep 1.5
agent-browser snapshot -i -c 2>&1 | grep -oE 'textbox "\+243 000 000 000" \[ref=([^]]*)\]' | head -1 | sed -E 's/.*\[ref=([^]]*)\].*/\1/' > /tmp/ref3
agent-browser fill "$(cat /tmp/ref3)" "24386758904" > /dev/null 2>&1
agent-browser snapshot -i -c 2>&1 | grep -oE 'button "Envoyer le code" \[ref=([^]]*)\]' | head -1 | sed -E 's/.*\[ref=([^]]*)\].*/\1/' > /tmp/ref4
agent-browser click "$(cat /tmp/ref4)" > /dev/null 2>&1; sleep 3
agent-browser snapshot -i -c 2>&1 | grep -cE "Si un compte existe avec ce numéro" | xargs echo "toast neutre affiché (1=oui):"
agent-browser snapshot -i -c 2>&1 | grep -cE "Changer de numéro" | xargs echo "étape code affichée à tort (0=non):"
agent-browser screenshot /tmp/postmerge-A.png > /dev/null 2>&1

echo "── 4. Numéro valide → bandeau dev honnête + code cliquable ──"
agent-browser fill "$(cat /tmp/ref3)" "+243810000021" > /dev/null 2>&1
agent-browser click "$(cat /tmp/ref4)" > /dev/null 2>&1; sleep 3
agent-browser snapshot -i -c 2>&1 | grep -oE 'Mode développement[^"]*' | head -1
agent-browser snapshot -i -c 2>&1 | grep -oE 'button "[0-9]{6}" \[ref=[^]]*\]' | head -1
agent-browser screenshot /tmp/postmerge-B.png > /dev/null 2>&1

echo "── 5. Mauvais code → rejeté ──"
agent-browser snapshot -i -c 2>&1 | grep -oE 'textbox "000000" \[ref=([^]]*)\]' | head -1 | sed -E 's/.*\[ref=([^]]*)\].*/\1/' > /tmp/ref5
agent-browser fill "$(cat /tmp/ref5)" "000000" > /dev/null 2>&1
agent-browser snapshot -i -c 2>&1 | grep -oE 'button "Continuer" \[ref=([^]]*)\]' | head -1 | sed -E 's/.*\[ref=([^]]*)\].*/\1/' > /tmp/ref6
agent-browser click "$(cat /tmp/ref6)" > /dev/null 2>&1; sleep 2.5
agent-browser snapshot -i -c 2>&1 | grep -cE "Code invalide ou expiré" | xargs echo "mauvais code rejeté (1=oui):"

echo "── FIN vérification post-merge ──"
