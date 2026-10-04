# Agent IA externe — Look School 360

Connexion d'un agent IA externe aux APIs de **Look School 360** (ex-EduGest).

## 1. Authentification

Tous les endpoints `/api/ai/*` (sauf `/api/ai/health`) exigent un token partagé :

```http
Authorization: Bearer <AI_AGENT_TOKEN>
```

- **Production** : définir le secret côté serveur (`AI_AGENT_TOKEN`), ex. `wrangler secret put AI_AGENT_TOKEN` ou variable d'environnement de l'hôte. **Sans ce secret en production, l'agent est désactivé (503).**
- **Développement** : si `AI_AGENT_TOKEN` n'est pas défini, le token de dev par défaut est `look-school-360-agent-dev-token` (jamais actif en production).

Le token est comparé en temps constant (`crypto.timingSafeEqual`).

## 2. Point d'entrée (handshake)

```http
POST /api/ai/entrance
Content-Type: application/json

{
  "agentToken": "<AI_AGENT_TOKEN>",
  "capabilities": ["pdf", "db", "whatsapp", "notifications"],
  "preferences": { "language": "fr", "timeout": 30000 }
}
```

Réponse `200` :

```json
{
  "status": "connected",
  "app": "Look School 360",
  "connectedAt": "2026-01-15T10:30:00.000Z",
  "authorizedActions": ["pdf", "db_read", "whatsapp", "notifications"],
  "quotas": { "remaining": 999, "limit": 1000, "used": 1, "reset": "2026-01-16T00:00:00.000Z" },
  "endpoints": {
    "health": "/api/ai/health",
    "status": "/api/ai/status",
    "query": "/api/ai/query",
    "db": "/api/ai/db/query",
    "patients": "/api/ai/patients",
    "discipline": "/api/ai/discipline",
    "notifications": "/api/ai/notifications",
    "pdf": "/api/ai/pdf",
    "whatsapp": "/api/ai/whatsapp",
    "payments": "/api/ai/payments",
    "entrance": "/api/ai/entrance"
  }
}
```

Erreurs : `401` (token invalide/absent), `429` (quota quotidien atteint), `503` (agent non configuré).

## 3. Endpoints

| Endpoint | Méthode | Description |
|---|---|---|
| `/api/ai/health` | GET | **Public.** Sonde 200/503 : base de données + agent configuré |
| `/api/ai/status` | GET | Statut connexion + compteurs DB (écoles, élèves, utilisateurs…) |
| `/api/ai/query` | POST | Question en langage naturel → réponse IA (LLM côté serveur) + statistiques réelles |
| `/api/ai/db/query` | POST | SQL **read-only** validé (SELECT seul, tables en whitelist, LIMIT ≤ 500) |
| `/api/ai/patients` | GET | Infirmerie : visites récentes, urgences 30 j, dossiers médicaux (`?schoolId=` requis) |
| `/api/ai/discipline` | GET/POST | Lister incidents / créer un incident (statut PENDING + notification aux SCHOOL_ADMIN) |
| `/api/ai/notifications` | GET/POST | Lister / créer des notifications (`userId` ou `targetRole`) |
| `/api/ai/pdf` | GET | Rapport PDF détaillé (`?schoolId=&days=1-31`) — réutilise le moteur PDF interne |
| `/api/ai/whatsapp` | GET | Statut de l'agent WhatsApp (natsu-baileys-v10) |
| `/api/ai/payments` | GET | Statistiques paiements (`?schoolId=&days=1-90`) : encaissé, par passerelle, transactions récentes |

### Exemples

```bash
# Sonde publique
curl http://localhost:3000/api/ai/health

# Statut (protégé)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/ai/status

# Requête SQL read-only
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"SELECT id, name, shortName FROM School WHERE isActive = 1 LIMIT 50","risk":"read-only"}' \
  http://localhost:3000/api/ai/db/query

# Question IA
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"question":"Combien d élèves actifs et combien encaissés ce mois ?"}' \
  http://localhost:3000/api/ai/query
```

## 4. Sécurité

- **Isolation multi-tenant** : tous les endpoints de données exigent `schoolId` ; une école ne voit jamais les données d'une autre.
- **SQL** : uniquement `SELECT` ; mots-clés d'écriture rejetés (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `PRAGMA`…) ; tables limitées au schéma Prisma ; `LIMIT` forcé (≤ 500). Les risques `"write"`/`"admin"` sont refusés (403).
- **Quota** : 1000 appels/jour par défaut (modifiable via `AI_AGENT_DAILY_QUOTA`), compteur en mémoire réinitialisé chaque jour.
- **Audit trail** : chaque action agent est journalisée dans `AuditLog` (`userRole = AI_AGENT`, action `AI_AGENT_*`).
- Champs sensibles jamais exposés (tokens WhatsApp, réponses brutes passerelles).

## 5. Déploiement via Cloudflare Workers (proxy)

Cette app Next.js peut être publiée derrière un Worker Cloudflare qui expose
`https://<domaine>.workers.dev/api/ai/*` vers l'origine :

```jsonc
// wrangler.jsonc (exemple)
{
  "name": "look-school-360-ai",
  "main": "worker.js",
  "compatibility_date": "2026-01-01",
  "vars": { "ORIGIN": "https://votre-origine-look-school-360.example" }
  // Secrets : wrangler secret put AI_AGENT_TOKEN
}
```

```js
// worker.js — proxy + allowlist d'IP + pass-through du token
const ALLOWED_PATHS = /^\/api\/ai\/(health|entrance|status|query|db\/query|patients|discipline|notifications|pdf|whatsapp|payments)$/;
const ALLOWED_IPS = ['203.0.113.0/24']; // à adapter

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!ALLOWED_PATHS.test(url.pathname)) {
      return new Response('Not found', { status: 404 });
    }
    const ip = req.headers.get('cf-connecting-ip') ?? '';
    const allowed = ALLOWED_IPS.some((cidr) => isIpInCidr(ip, cidr));
    if (!allowed && url.pathname !== '/api/ai/health') {
      return Response.json({ error: 'IP non autorisée' }, { status: 403 });
    }
    return fetch(env.ORIGIN + url.pathname + url.search, new Request(req));
  },
};

function isIpInCidr(ip, cidr) {
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const toInt = (a) => a.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(base) & mask);
}
```

> L'authentification forte reste le `Bearer token` : l'IP allowlist est une
> seconde barrière, pas un remplacement.

## 6. Réponse du DB query

```json
{
  "rows": [{ "id": "clx…", "name": "Complexe Scolaire Lumière", "shortName": "CSL" }],
  "rowCount": 1,
  "sql": "SELECT id, name, shortName FROM School WHERE isActive = 1 LIMIT 50",
  "requestId": null,
  "timestamp": "2026-01-15T10:30:00.000Z"
}
```
