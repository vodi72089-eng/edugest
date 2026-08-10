# Design — Détection réelle des appareils connectés (empreinte + géolocalisation IP)

Date : 2026-08-10
Statut : Approuvé (brainstorming)

## Contexte

L'onglet « Appareils connectés » de SettingsView (et la section équivalente de
ProfileView) liste les sessions actives de l'utilisateur avec, pour chaque
session, un nom d'appareil dérivé du User-Agent (`src/lib/detect-device.ts`),
une adresse IP et la date de dernière activité.

Objectif : enrichir cette détection avec des données « réelles » :

- une **empreinte stable** identifiant l'appareil (remplace la MAC, qui est
  techniquement impossible à obtenir depuis un navigateur web — les adresses
  MAC ne traversent pas Internet) ;
- la **localisation** de l'appareil (ville, région, pays, ISP) déduite de son
  IP publique ;
- des **signaux matériels/logiciels** : écran, GPU, batterie, langues, fuseau
  horaire, RAM, cœurs CPU, type de réseau.

L'application sera ultérieurement embarquée dans des wrappers Tauri (iOS +
Windows). Le choix technique est donc le JS navigateur (FingerprintJS agent
officiel), qui fonctionne dans les webviews WKWebView/WebView2 — les SDK
natifs fingerprintjs-pro-ios / fingerprintjs-android ne sont pas compatibles
avec Tauri et ne sont pas utilisés.

## Restrictions imposées

- **Frontend existant inchangé** : seules des *additions* minimales dans le
  même design (couleurs GOLD / TEXT_MUTED_LUXE, tailles de texte et icônes
  existantes) sont autorisées dans les cartes d'appareils.
- **Backend existant non modifié** : aucun changement aux routes ou fonctions
  existantes ; un nouveau endpoint est ajouté. Aucun changement de base de
  données.
- Repos externes fournis (fingerprintjs-pro-ios, fingerprintjs-android,
  ip-tracker, Device-tracker, netowrkDeviceDetector) : non intégrés
  directement — outillage Python/natif inutilisable dans une web app. Leurs
  techniques sont reproduites via FingerprintJS (web) et ip-api.com.

## Architecture

### 1. Côté client — `src/lib/device-fingerprint.ts`

Utilitaire client :

- charge la lib officielle open-source `@fingerprintjs/fingerprintjs`
  (nouvelle dépendance npm, gratuite, sans clé API) ;
- obtient `visitorId` (identifiant stable par appareil/navigateur, persistant
  via localStorage — fonctionne dans les webviews Tauri) ;
- collecte en parallèle les signaux complémentaires :
  - écran : `screen.width × screen.height`, `devicePixelRatio`,
    `screen.colorDepth` ;
  - GPU : `WebGLRenderer` via `<canvas>.getContext('webgl')`
    (VENDOR + RENDERER) ;
  - batterie : `navigator.getBattery()` (si disponible) — niveau/chargement ;
  - langues : `navigator.languages` ;
  - fuseau : `Intl.DateTimeFormat().resolvedOptions().timeZone` ;
  - RAM/cœurs : `navigator.deviceMemory`, `navigator.hardwareConcurrency` ;
  - réseau : `navigator.connection` (effectiveType, downlink) ;
- envoie une fois par session l'objet consolidé via
  `authFetch('/api/sessions/device', { method: 'POST', body })` ;
- en cas d'échec silencieux (hors-ligne, webview restreinte), ne bloque rien.

### 2. Côté serveur

**Nouveau endpoint `src/app/api/sessions/device/route.ts`** (POST, auth
requise) :

- reçoit `{ visitorId, screen, gpu, battery, languages, timezone, memory,
  cores, network }` ;
- écrit ces champs dans le fichier de session courant (via
  `getSessionPath`/`writeSession` existants dans `src/lib/auth.ts`) ;
- retourne `{ ok: true }` ; erreurs silencieuses (jamais de crash).

**Géolocalisation IP — `src/lib/geo.ts`** (nouveau) :

- fonction `resolveIpLocation(ip: string)` : interroge
  `http://ip-api.com/json/<ip>?lang=fr&fields=status,country,city,regionName,isp,lat,lon,query`
  (gratuit, sans clé, ~45 req/min suffisant) avec timeout court (3 s) et
  cache en mémoire (Map, TTL 6 h) ;
- réponse normalisée : `{ city, region, country, isp, lat, lon }` ou `null`.

**Intégration dans `src/lib/auth.ts`** :

- extension de `SessionData` / `SessionListItem` avec des champs optionnels :
  `fingerprintId`, `screen`, `gpu`, `battery`, `languages`, `timezone`,
  `memory`, `cores`, `network`, `location` ;
- `normalizeSession` lit ces champs en défaut (`''`, `null`, `[]` pour les
  anciens fichiers v1) — rétrocompatible ;
- la géoloc est résolue **lazily** dans `listUserSessions` : si la session a
  une IP et pas encore de `location`, on tente la résolution (une seule fois
  par session, jamais bloquant) et on persiste le résultat dans le fichier.

### 3. UI (même design, additions minimales)

Dans SettingsView (onglet devices) **et** ProfileView (section appareils) :

- ligne 2 de la carte (où l'IP est déjà affichée avec l'icône `Globe`) :
  ajout, si disponible, `MapPin` + « ville, pays » ;
- à côté du nom d'appareil : petit badge `Fingerprint` (icône lucide) avec
  les 8 premiers caractères du `visitorId` (couleur GOLD sur fond GOLD_SOFT,
  comme le badge « CET APPAREIL » existant) ;
- si localisation ou empreinte absentes : la carte reste telle quelle
  (aucun affichage vide).

### 4. Flux de données

1. Login → session créée (IP + User-Agent déjà stockés).
2. App chargée → `device-fingerprint.ts` tourne → POST `/api/sessions/device`
   → fichier de session enrichi.
3. Ouverture de l'onglet → GET `/api/sessions` → géoloc IP résolue à la
   demande si manquante → les deux vues affichent les nouvelles infos.

## Gestion d'erreurs

Toutes les étapes d'enrichissement sont best-effort :

- réseau hors-ligne ou API externe injoignable → champs absents, pas d'erreur
  visible, pas de blocage ;
- webview sans `getBattery`/`deviceMemory`/`connection` → champs absents ;
- fichiers de session corrompus → déjà ignorés par `normalizeSession`.

## Dépendances

- Ajout : `@fingerprintjs/fingerprintjs` (open-source, BSD 3-clauses).
- Aucune autre modification de `package.json`.

## Tests et vérification

- `npm run lint` (eslint) ;
- `npm run build` (Next.js) ;
- vérification manuelle sur le serveur dev : connexion depuis deux
  navigateurs (desktop + mobile) → l'onglet montre empreinte, localisation et
  IP distinctes par session ;
- vérifier qu'aucune vue existante n'est cassée (onglet info/fees inchangés).

## Hors périmètre

- Adresse MAC (impossible en web) ;
- SDK natifs fingerprintjs (incompatibles Tauri) ;
- géolocalisation GPS du navigateur (nécessiterait un prompt utilisateur —
  refusée par contrainte « ne rien changer ») ;
- scanner réseau scapy (ne concerne que le LAN de l'école, pas les visiteurs).
